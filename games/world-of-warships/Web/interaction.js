/* Iron Tide — validated UI saves, explicit target picking and direct-hit feedback. */
(function (global) {
  'use strict';
  const IT = global.IronTide = global.IronTide || {};
  const finite = (n, fallback, low, high) => typeof n === 'number' && Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
  function control(raw, game) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const p = game.player, w = game.world.w, h = game.world.h;
    const fallbackX = finite(p.aimX, p.x, -w, w * 2), fallbackY = finite(p.aimY, p.y, -h, h * 2);
    const campaign = raw.sessionType === 'campaign' && typeof raw.campaignRunId === 'string' && /^[\w-]{1,96}$/.test(raw.campaignRunId) && Number.isInteger(raw.campaignStage) && raw.campaignStage >= 0 && raw.campaignStage <= 2;
    return {
      ammo: ['HE','AP','TORP'].includes(raw.ammo) && !(raw.ammo === 'TORP' && p.torpReloadMax <= 0) ? raw.ammo : 'HE',
      spread: raw.spread === 'wide' ? 'wide' : 'narrow',
      aimX: finite(raw.aimX, fallbackX, -w, w * 2), aimY: finite(raw.aimY, fallbackY, -h, h * 2),
      binocular: raw.binocular === true,
      targetId: typeof raw.targetId === 'string' && game.ships.some(s => s.id === raw.targetId && s.team !== p.team) ? raw.targetId : null,
      sessionType: campaign ? 'campaign' : 'free',
      campaignRunId: campaign ? raw.campaignRunId : null,
      campaignStage: campaign ? raw.campaignStage : null
    };
  }
  function shotFeedback(events, playerId) {
    const hits = events.filter(e => e.type === 'hit' && e.ownerId === playerId && e.secondary !== true && e.result !== 'secondary' && e.visible !== false && ['HE','AP','TORP'].includes(e.ammo));
    if (!hits.length) return null;
    const rank = {citadel:8,torpedo:7,penetration:6,overpen:5,hit:4,ricochet:2,shatter:1};
    const best = [...hits].sort((a,b) => (rank[b.result] || 3) - (rank[a.result] || 3))[0];
    const labels = {citadel:'집중방호구역 관통',torpedo:'어뢰 명중',penetration:'장갑 관통',overpen:'과관통',ricochet:'도탄 · 각도를 바꿔 보세요',shatter:'비관통 · 탄종을 바꿔 보세요',hit:'명중'};
    return {damage: hits.reduce((sum,e) => sum + Math.max(0,Number.isFinite(e.damage) ? e.damage : 0),0), result:best.result, label:labels[best.result] || '주포 명중', count:hits.length};
  }
  function queueDuration(solution) {
    if (!solution || !Number.isFinite(solution.reload) || solution.reload > .8) return 0;
    const alignment = Number.isFinite(solution.alignmentTime) ? Math.max(0,solution.alignmentTime) : 0;
    return Math.min(4.5,Math.max(.3,Math.max(solution.reload,alignment)+.2));
  }
  function pickTarget(ships, screen, renderer) {
    // This function receives only visible contacts from the controller.
    let picked = null, closest = Infinity;
    for (const ship of ships) {
      const center = renderer.worldToScreen(ship.x,ship.y), dx = screen.x-center.x, dy = screen.y-center.y;
      const ca = Math.cos(ship.angle), sa = Math.sin(ship.angle);
      const along = dx*ca+dy*sa, across = -dx*sa+dy*ca;
      const halfLength = Math.max(24,ship.length*renderer.zoom*.53), halfWidth = Math.max(24,ship.width*renderer.zoom*.6);
      const hull = Math.abs(along) <= halfLength && Math.abs(across) <= halfWidth;
      const offset = Math.max(21,ship.length*renderer.zoom*.48+9), labelY = center.y-offset-9;
      const label = Math.abs(dx) <= 36 && Math.abs(screen.y-labelY) <= 22;
      if (!hull && !label) continue;
      const distance = Math.min(hull ? Math.hypot(along/halfLength,across/halfWidth) : Infinity,label ? Math.hypot(dx/36,(screen.y-labelY)/22) : Infinity);
      if (distance < closest) { picked = ship; closest = distance; }
    }
    return picked;
  }
  IT.Interaction = Object.freeze({control,shotFeedback,pickTarget,queueDuration});
})(globalThis);
