'use strict';

const { execFileSync } = require('node:child_process');
const { isIPv4 } = require('node:net');
const os = require('node:os');

function ipv4Number(ip) {
  return ip.split('.').reduce((value, octet) => (value << 8) | Number(octet), 0) >>> 0;
}

function ipv4String(value) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
}

function readSubnet(cidr) {
  if (typeof cidr !== 'string') return null;
  const [address, prefix, ...rest] = cidr.split('/');
  if (!isIPv4(address) || !/^(?:[1-9]|[12]\d|3[0-2])$/.test(prefix) || rest.length) return null;
  const mask = (0xffffffff << (32 - Number(prefix))) >>> 0;
  return { network: (ipv4Number(address) & mask) >>> 0, mask, prefix };
}

function isLanPeer(ip, cidr) {
  if (typeof ip !== 'string') return false;
  const address = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  const subnet = readSubnet(cidr);
  return Boolean(subnet && isIPv4(address) && ((ipv4Number(address) & subnet.mask) >>> 0) === subnet.network);
}

function assignedInterfaces() {
  const addresses = new Map();
  for (const records of Object.values(os.networkInterfaces())) {
    for (const { address, cidr, internal } of records ?? []) {
      const subnet = readSubnet(cidr);
      if (internal || !isIPv4(address) || !subnet || !isLanPeer(address, cidr)) continue;
      addresses.set(address, { address, cidr: ipv4String(subnet.network) + '/' + subnet.prefix });
    }
  }
  return addresses;
}

function windowsCandidates() {
  const output = execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ' +
    'Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.NetAdapter.HardwareInterface } | ' +
    'Select-Object @{n="addresses";e={@($_.IPv4Address.IPAddress)}}, @{n="gateways";e={@($_.IPv4DefaultGateway.NextHop)}}, ' +
    '@{n="medium";e={[int]$_.NetAdapter.NdisPhysicalMedium}} | ConvertTo-Json -Compress',
  ], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (!output.trim()) return [];
  const rows = JSON.parse(output);
  return Array.isArray(rows) ? rows : [rows];
}

function selectLanInterface(env = process.env) {
  const addresses = assignedInterfaces();
  if (env.PLAYFORGE_LAN_IP !== undefined) {
    return typeof env.PLAYFORGE_LAN_IP === 'string' ? addresses.get(env.PLAYFORGE_LAN_IP.trim()) ?? null : null;
  }
  if (process.platform !== 'win32') return null;

  let rows;
  try { rows = windowsCandidates(); } catch { return null; }
  const candidates = [];
  for (const row of rows) {
    const gateways = [].concat(row.gateways ?? []);
    for (const address of [].concat(row.addresses ?? [])) {
      const assigned = addresses.get(address);
      if (!assigned || address.startsWith('169.254.') ||
          !gateways.some(gateway => isLanPeer(gateway, assigned.cidr) && gateway !== address && gateway !== '0.0.0.0')) continue;
      // NDIS physical media 1 and 9 are wireless LAN and native 802.11.
      candidates.push({ ...assigned, wifi: [1, 9].includes(row.medium) });
    }
  }
  const wireless = candidates.filter(candidate => candidate.wifi);
  const eligible = wireless.length ? wireless : candidates;
  if (eligible.length !== 1) return null;
  const { address, cidr } = eligible[0];
  return { address, cidr };
}

module.exports = { selectLanInterface, isLanPeer };
