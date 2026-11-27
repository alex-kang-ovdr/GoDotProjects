// Cloudflare Workers + Durable Objects (WebSocket Hibernation API) Edge Relay for Type 1 (relay-spatial-v1).
// 1 Channel = 1 Durable Object: global edge routing, zero split-brain, built-in L3/L4/L7 DDoS absorption, ~0 idle cost.
// Zero game-specific logic: verifies signed JoinTicket at edge and forwards N-D coordinates + opaque payloads only.

const TEXT_ENCODER = new TextEncoder();
const MAX_PAYLOAD_BYTES = 1024;
const MAX_CLOCK_SKEW_SEC = 5;

function b64urlToBytes(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyTicketEdge(token, secret) {
  if (!token || !secret) return { ok: false, reason: 'missing_ticket_or_secret' };
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return { ok: false, reason: 'ticket_malformed' };
  const bodyB64 = token.slice(0, dot);
  const sigBytes = b64urlToBytes(token.slice(dot + 1));
  const bodyBytes = b64urlToBytes(bodyB64);
  if (!sigBytes || !bodyBytes || sigBytes.length !== 32) return { ok: false, reason: 'ticket_malformed' };

  const key = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, TEXT_ENCODER.encode(bodyB64));
  if (!valid) return { ok: false, reason: 'invalid_signature' };

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return { ok: false, reason: 'ticket_malformed' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp + MAX_CLOCK_SKEW_SEC < nowSec) {
    return { ok: false, reason: 'ticket_expired' };
  }
  if (payload.runtime && payload.runtime !== 'relay-spatial-v1') {
    return { ok: false, reason: 'runtime_mismatch' };
  }
  return { ok: true, payload };
}

function extractTicket(request) {
  const proto = request.headers.get('sec-websocket-protocol') || '';
  for (const part of proto.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('ticket.')) return trimmed.slice('ticket.'.length).trim();
  }
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const url = new URL(request.url);
  return (url.searchParams.get('ticket') || '').trim();
}

function distSq(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return sum;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return Response.json({ ok: true, service: 'cloudflare-spatial-relay-v1' });
    }
    if (url.pathname !== '/ws/relay-spatial') {
      return new Response('Not Found', { status: 404 });
    }
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const token = extractTicket(request);
    const verified = await verifyTicketEdge(token, env.PLAYHUB_RELAY_TICKET_SECRET);
    if (!verified.ok) {
      return new Response(verified.reason, { status: 401 });
    }
    const { gameId, roomId } = verified.payload;
    if (!gameId) return new Response('missing_game_id', { status: 400 });
    const channelKey = `${gameId}:${roomId || 'public-0'}`;
    const id = env.SPATIAL_CHANNELS.idFromName(channelKey);
    const stub = env.SPATIAL_CHANNELS.get(id);

    const forwarded = new Request(request, {
      headers: new Headers([
        ...request.headers.entries(),
        ['X-PlayHub-Ticket-Payload', JSON.stringify(verified.payload)],
      ]),
    });
    return stub.fetch(forwarded);
  },
};

export class SpatialChannelDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.nextShortId = 1;
    this.usedJti = new Map();
    this.config = { dimensions: 2, aoiRadius: 520, aoiHysteresis: 60, maxVisiblePeers: 12, maxPlayersPerChannel: 64 };
  }

  async fetch(request) {
    const payloadRaw = request.headers.get('X-PlayHub-Ticket-Payload');
    if (!payloadRaw) return new Response('Unauthorized', { status: 401 });
    const ticket = JSON.parse(payloadRaw);
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [k, exp] of this.usedJti.entries()) {
      if (exp <= nowSec) this.usedJti.delete(k);
    }
    if (ticket.jti && this.usedJti.has(ticket.jti)) {
      return new Response('ticket_replayed', { status: 401 });
    }
    if (ticket.jti) this.usedJti.set(ticket.jti, (ticket.exp || nowSec + 60) + MAX_CLOCK_SKEW_SEC);

    const active = this.ctx.getWebSockets();
    if (active.length >= this.config.maxPlayersPerChannel) {
      return new Response('CHANNEL_FULL', { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const shortId = this.nextShortId++;
    const meta = {
      shortId,
      sub: ticket.sub || '',
      name: ticket.name || `Player ${shortId}`,
      platform: ticket.platform || 'web',
      gameId: ticket.gameId || '',
      roomId: ticket.roomId || 'public-0',
      pos: [0, 0],
      nearby: [],
      lastOpaqueState: null,
    };
    server.serializeAttachment(meta);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({
      t: 'welcome',
      protocol: 'playhub.relay.v1',
      roomId: meta.roomId,
      gameId: meta.gameId,
      shortId,
      name: meta.name,
      online: active.length + 1,
    }));

    const headers = {};
    const proto = request.headers.get('sec-websocket-protocol') || '';
    if (proto.split(',').some(p => p.trim() === 'playhub.v1')) {
      headers['Sec-WebSocket-Protocol'] = 'playhub.v1';
    }
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const sender = ws.deserializeAttachment();
    if (!sender) return;

    if (msg.t === 'join' && msg.config && typeof msg.config === 'object') {
      if (Number.isFinite(msg.config.dimensions)) this.config.dimensions = Math.max(1, Math.min(3, Math.floor(msg.config.dimensions)));
      if (Number.isFinite(msg.config.aoiRadius)) this.config.aoiRadius = Math.max(0, Math.min(100000, Number(msg.config.aoiRadius)));
      if (Number.isFinite(msg.config.aoiHysteresis)) this.config.aoiHysteresis = Math.max(0, Math.min(10000, Number(msg.config.aoiHysteresis)));
    }
    if (Array.isArray(msg.p)) {
      sender.pos = msg.p.slice(0, this.config.dimensions).map(n => (Number.isFinite(Number(n)) ? Number(n) : 0));
    }
    const opaqueData = msg.d !== undefined ? msg.d : null;
    if (opaqueData !== null) {
      if (JSON.stringify(opaqueData).length > MAX_PAYLOAD_BYTES) return;
      if (msg.k === 0 || sender.lastOpaqueState === null) sender.lastOpaqueState = opaqueData;
    }

    const peers = this.ctx.getWebSockets();
    const senderNearby = new Set(sender.nearby || []);
    const cap = this.config.maxVisiblePeers;

    for (const otherWs of peers) {
      if (otherWs === ws) continue;
      const other = otherWs.deserializeAttachment();
      if (!other) continue;
      const otherNearby = new Set(other.nearby || []);
      const wasNearby = senderNearby.has(other.shortId);
      const limit = this.config.aoiRadius + (wasNearby ? this.config.aoiHysteresis : 0);
      const inRange = this.config.aoiRadius <= 0 || distSq(sender.pos, other.pos) <= limit * limit;
      const nowNearby = inRange && (wasNearby || (senderNearby.size < cap && otherNearby.size < cap));

      if (nowNearby) {
        if (!wasNearby) {
          senderNearby.add(other.shortId);
          otherNearby.add(sender.shortId);
          other.nearby = [...otherNearby];
          otherWs.serializeAttachment(other);
          otherWs.send(JSON.stringify({ b: [[sender.shortId, sender.pos, opaqueData ?? sender.lastOpaqueState, sender.name]], o: [peers.length, otherNearby.size] }));
          ws.send(JSON.stringify({ b: [[other.shortId, other.pos, other.lastOpaqueState, other.name]], o: [peers.length, senderNearby.size] }));
        } else if (opaqueData !== null) {
          otherWs.send(JSON.stringify({ b: [[sender.shortId, sender.pos, opaqueData]] }));
        }
      } else if (wasNearby) {
        senderNearby.delete(other.shortId);
        otherNearby.delete(sender.shortId);
        other.nearby = [...otherNearby];
        otherWs.serializeAttachment(other);
        otherWs.send(JSON.stringify({ r: [sender.shortId], o: [peers.length, otherNearby.size] }));
        ws.send(JSON.stringify({ r: [other.shortId], o: [peers.length, senderNearby.size] }));
      }
    }

    sender.nearby = [...senderNearby];
    ws.serializeAttachment(sender);
  }

  async webSocketClose(ws) {
    const leaving = ws.deserializeAttachment();
    if (!leaving) return;
    const peers = this.ctx.getWebSockets().filter(s => s !== ws);
    for (const otherWs of peers) {
      const other = otherWs.deserializeAttachment();
      if (!other) continue;
      const set = new Set(other.nearby || []);
      if (set.delete(leaving.shortId)) {
        other.nearby = [...set];
        otherWs.serializeAttachment(other);
        otherWs.send(JSON.stringify({ r: [leaving.shortId], o: [peers.length, set.size] }));
      }
    }
  }
}
