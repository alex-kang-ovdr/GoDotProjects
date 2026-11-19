'use strict';

const { spawnSync } = require('node:child_process');
const { createHash, createPrivateKey, X509Certificate } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const CERT_DAYS = 365;

function validatePair(key, cert, address) {
  let certificate;
  let privateKey;
  try {
    certificate = new X509Certificate(cert);
    privateKey = createPrivateKey(key);
  } catch {
    throw new Error('LAN TLS needs a PEM certificate and its unencrypted PEM private key.');
  }
  if (!certificate.checkIP(address)) {
    throw new Error(`The LAN TLS certificate needs an IP subject alternative name for ${address}.`);
  }
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) {
    throw new Error('The LAN TLS certificate is outside its validity period.');
  }
  if (!certificate.checkPrivateKey(privateKey)) {
    throw new Error('The LAN TLS certificate and private key do not match.');
  }
  return { key, cert };
}

function opensslCandidates(env) {
  if (process.platform !== 'win32') return ['openssl'];
  const roots = [
    env.ProgramFiles || 'C:\\Program Files',
    env['ProgramFiles(x86)'],
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
  ].filter(Boolean);
  const gitPaths = roots.flatMap(root => ['mingw64', 'mingw32', 'usr'].map(bin =>
    path.join(root, 'Git', bin, 'bin', 'openssl.exe')));
  return ['openssl.exe', ...gitPaths.filter(candidate => fs.existsSync(candidate))];
}

function generateWithOpenSSL(address, keyPath, certPath, env) {
  const args = [
    'req', '-new', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(CERT_DAYS), '-subj', '/CN=PlayForge LAN',
    '-addext', 'subjectAltName=IP:' + address,
    '-addext', 'basicConstraints=critical,CA:FALSE',
    '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
    '-addext', 'extendedKeyUsage=serverAuth',
    '-keyout', keyPath, '-out', certPath,
  ];
  return opensslCandidates(env).some(executable => spawnSync(executable, args, {
    env, timeout: 12000, windowsHide: true, stdio: 'ignore',
  }).status === 0);
}

function generateWithDotNet(address, keyPath, certPath, env) {
  if (process.platform !== 'win32') return false;
  // PowerShell 7 exposes .NET PEM export without an OpenSSL installation.
  const script = `
$ErrorActionPreference = 'Stop'
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
try {
  $certReq = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=PlayForge LAN', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
  $san.AddIpAddress([System.Net.IPAddress]::Parse($env:PLAYFORGE_TMP_LAN_IP))
  $certReq.CertificateExtensions.Add($san.Build())
  $certReq.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
  $usage = [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
  $certReq.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($usage,$true))
  $oids = [System.Security.Cryptography.OidCollection]::new()
  [void]$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
  $certReq.CertificateExtensions.Add(
    [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false))
  $now = [DateTimeOffset]::UtcNow
  $cert = $certReq.CreateSelfSigned($now.AddMinutes(-5), $now.AddDays(${CERT_DAYS}))
  try {
    [System.IO.File]::WriteAllText($env:PLAYFORGE_TMP_LAN_CERT, $cert.ExportCertificatePem())
    [System.IO.File]::WriteAllText($env:PLAYFORGE_TMP_LAN_KEY, $rsa.ExportPkcs8PrivateKeyPem())
  } finally {
    $cert.Dispose()
  }
} finally {
  $rsa.Dispose()
}
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: {
      ...env, PLAYFORGE_TMP_LAN_IP: address,
      PLAYFORGE_TMP_LAN_KEY: keyPath, PLAYFORGE_TMP_LAN_CERT: certPath,
    },
    timeout: 12000, windowsHide: true, stdio: 'ignore',
  }).status === 0;
}

function readPair(folder, address) {
  const publicCertPath = path.join(folder, 'cert.pem');
  return {
    ...validatePair(fs.readFileSync(path.join(folder, 'key.pem')), fs.readFileSync(publicCertPath), address),
    publicCertPath,
  };
}

function findCachedPair(root, address) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('pair-')) continue;
    try {
      return readPair(path.join(root, entry.name), address);
    } catch {
      // An incomplete or expired pair cannot be used.
    }
  }
  return null;
}

function getLanTls(address, { env = process.env } = {}) {
  if (typeof address !== 'string' || !net.isIP(address) || address.includes('%')) {
    throw new Error('A plain IP address is required for the LAN TLS certificate.');
  }
  const keyPath = env.PLAYFORGE_LAN_KEY;
  const certPath = env.PLAYFORGE_LAN_CERT;
  if (keyPath || certPath) {
    if (!keyPath || !certPath) throw new Error('Set both PLAYFORGE_LAN_CERT and PLAYFORGE_LAN_KEY.');
    return {
      ...validatePair(fs.readFileSync(keyPath), fs.readFileSync(certPath), address),
      publicCertPath: path.resolve(certPath),
    };
  }
  const dataRoot = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const ipKey = createHash('sha256').update(address).digest('hex').slice(0, 24);
  const cacheRoot = path.resolve(dataRoot, 'PlayForge', 'lan-tls', ipKey);
  fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  const cached = findCachedPair(cacheRoot, address);
  if (cached) return cached;
  const tempDir = fs.mkdtempSync(path.join(cacheRoot, '.pending-'));
  const tmpKey = path.join(tempDir, 'key.pem');
  const tmpCert = path.join(tempDir, 'cert.pem');
  let published = false;
  try {
    if (!generateWithOpenSSL(address, tmpKey, tmpCert, env) && !generateWithDotNet(address, tmpKey, tmpCert, env)) {
      throw new Error('No local TLS certificate generator succeeded. Use OpenSSL, PowerShell 7, or provide the PEM certificate and key.');
    }
    fs.chmodSync(tmpKey, 0o600);
    const pair = readPair(tempDir, address);
    const existing = findCachedPair(cacheRoot, address);
    if (existing) return existing;
    const pairDir = path.join(cacheRoot, path.basename(tempDir).replace('.pending-', 'pair-'));
    fs.renameSync(tempDir, pairDir);
    published = true;
    return { ...pair, publicCertPath: path.join(pairDir, 'cert.pem') };
  } finally {
    if (!published) {
      fs.rmSync(tmpKey, { force: true });
      fs.rmSync(tmpCert, { force: true });
      fs.rmdirSync(tempDir);
    }
  }
}

module.exports = { getLanTls };
