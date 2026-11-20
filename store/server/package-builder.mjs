import { createHash } from 'node:crypto';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function formatSha256Digest(value) {
  return `sha256:${sha256Hex(value)}`;
}

function normalizeZipPath(relativePath) {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid archive entry path: ${relativePath}`);
  }
  return normalized;
}

/**
 * Builds a deterministic STORED ZIP archive (UTF-8 filenames, fixed DOS timestamp)
 * so identical package inputs always produce the exact same bytes and SHA-256 digest.
 */
export function buildZipBuffer(entries) {
  const expanded = new Map();
  const sortedInputs = [...entries]
    .map(([entryPath, content]) => [normalizeZipPath(entryPath), Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [entryPath, bytes] of sortedInputs) {
    const parts = entryPath.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      const dirPath = `${parts.slice(0, i).join('/')}/`;
      if (!expanded.has(dirPath)) {
        expanded.set(dirPath, Buffer.alloc(0));
      }
    }
    expanded.set(entryPath, bytes);
  }

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const [entryPath, bytes] of expanded.entries()) {
    const nameBuf = Buffer.from(entryPath, 'utf8');
    const crc = crc32(bytes);
    const isDir = entryPath.endsWith('/');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename
    localHeader.writeUInt16LE(0, 8); // STORED
    localHeader.writeUInt16LE(0, 10); // DOS time
    localHeader.writeUInt16LE(0x0021, 12); // DOS date (1980-01-01)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, nameBuf, bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8
    centralHeader.writeUInt16LE(0, 10); // STORED
    centralHeader.writeUInt16LE(0, 12); // DOS time
    centralHeader.writeUInt16LE(0x0021, 14); // DOS date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(isDir ? 16 : 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralChunks.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + bytes.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(expanded.size, 8);
  endRecord.writeUInt16LE(expanded.size, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, endRecord]);
}

/**
 * Parses a STORED ZIP archive created by buildZipBuffer and verifies entry CRC32 checksums.
 */
export function parseZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new Error('Invalid ZIP buffer');
  }
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ZIP End of Central Directory not found');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (cdOffset + cdSize > eocdOffset) {
    throw new Error('ZIP Central Directory bounds invalid');
  }

  const files = new Map();
  let cursor = cdOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory signature');
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header for ${name}`);
    }
    if (method !== 0) {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    }
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    const content = Buffer.from(buffer.subarray(dataStart, dataEnd));
    if (content.length !== uncompressedSize || crc32(content) !== expectedCrc) {
      throw new Error(`CRC/size mismatch for ${name}`);
    }
    if (!name.endsWith('/')) {
      files.set(name, content);
    }
  }
  return files;
}

function buildMinimalGlb(name) {
  const jsonText = JSON.stringify({
    asset: { version: '2.0', generator: 'PlayForge Store Fixture Builder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name }]
  });
  const rawJson = Buffer.from(jsonText, 'utf8');
  const padLen = (4 - (rawJson.length % 4)) % 4;
  const paddedJson = Buffer.concat([rawJson, Buffer.alloc(padLen, 0x20)]);
  const totalLength = 12 + 8 + paddedJson.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(paddedJson.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  paddedJson.copy(glb, 20);
  return glb;
}

function buildMinimalOgg(label) {
  const header = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x20', 'latin1');
  const payload = Buffer.from(`PlayForgeAudio:${label}:48000Hz:stereo`, 'utf8');
  return Buffer.concat([header, payload]);
}

export const SAMPLE_PACKAGE_FILES = {
  'lowpoly-fortress-pack@1.2.0': [
    {
      path: 'assets/fortress/wall_segment.glb',
      executable_addon: false,
      content: buildMinimalGlb('FortressWallSegment')
    },
    {
      path: 'assets/fortress/turret_base.tscn',
      executable_addon: false,
      content: Buffer.from(
        '[gd_scene format=3]\n\n[node name="TurretBase" type="Node3D"]\n',
        'utf8'
      )
    }
  ],
  'ui-tactical-hud-kit@2.0.1': [
    {
      path: 'addons/tactical_hud/plugin.cfg',
      executable_addon: true,
      content: Buffer.from(
        '[plugin]\n\nname="Tactical Strategy HUD"\ndescription="PlayForge Store package"\nauthor="pub-studio-nord"\nversion="2.0.1"\nscript="hud_theme.tres"\n',
        'utf8'
      )
    },
    {
      path: 'addons/tactical_hud/hud_theme.tres',
      executable_addon: false,
      content: Buffer.from(
        '[gd_resource type="Theme" format=3]\n\n[resource]\ndefault_font_size = 14\n',
        'utf8'
      )
    }
  ],
  'sfx-siege-audio-pack@1.1.0': [
    {
      path: 'assets/audio/cannon_fire.ogg',
      executable_addon: false,
      content: buildMinimalOgg('cannon_fire')
    }
  ]
};

export function buildPlayforgePackage(entry, filesInput) {
  if (!entry || entry.release_kind !== 'package') {
    throw new Error('Playforge package can only be built for release_kind="package"');
  }
  const files = [...filesInput]
    .map((f) => {
      const content = Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content ?? ''), 'utf8');
      return {
        path: normalizeZipPath(f.path),
        bytes: content.length,
        sha256: sha256Hex(content),
        executable_addon: Boolean(f.executable_addon),
        content
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const fileManifest = files.map(({ path, bytes, sha256, executable_addon }) => ({
    path,
    bytes,
    sha256,
    executable_addon
  }));

  const dependencyPayload = JSON.stringify({
    asset_id: entry.asset_id,
    asset_version_id: entry.asset_version_id,
    dependencies: entry.dependencies || []
  });
  const dependencyManifestHash = formatSha256Digest(dependencyPayload);

  const packageManifest = {
    schema_version: 1,
    format: 'playforgepkg/v1',
    asset_id: entry.asset_id,
    asset_version_id: entry.asset_version_id,
    release_id: entry.release_id,
    release_kind: 'package',
    artifact_id: entry.artifact_id,
    publisher_id: entry.publisher_id,
    dependency_manifest_hash: dependencyManifestHash,
    engine_compatibility: entry.engine_compatibility,
    license_snapshot_ref: entry.license_snapshot_ref,
    file_manifest: fileManifest
  };

  const zipEntries = [
    ['playforge-package.json', `${JSON.stringify(packageManifest, null, 2)}\n`],
    ...files.map((f) => [f.path, f.content])
  ];

  const buffer = buildZipBuffer(zipEntries);
  const digestHex = sha256Hex(buffer);
  return {
    buffer,
    sha256Hex: digestHex,
    artifactDigest: `sha256:${digestHex}`,
    dependencyManifestHash,
    fileManifest
  };
}

export function createCatalogArtifacts(catalog, customArtifacts = null) {
  const artifacts = new Map();
  for (const item of catalog) {
    if (item.release_kind !== 'package') continue;
    const key = `${item.asset_id}@${item.asset_version_id}`;
    if (customArtifacts?.has(key)) {
      const provided = customArtifacts.get(key);
      const buffer = Buffer.isBuffer(provided) ? provided : Buffer.from(provided);
      const actualDigest = formatSha256Digest(buffer);
      if (item.artifact_digest && actualDigest !== item.artifact_digest) {
        throw new Error(`Artifact digest mismatch for ${key}: expected ${item.artifact_digest}, got ${actualDigest}`);
      }
      artifacts.set(key, {
        buffer,
        sha256Hex: actualDigest.slice('sha256:'.length),
        artifactDigest: actualDigest
      });
      continue;
    }

    const fixtureFiles = SAMPLE_PACKAGE_FILES[key];
    if (fixtureFiles) {
      const built = buildPlayforgePackage(item, fixtureFiles);
      if (item.artifact_digest && built.artifactDigest !== item.artifact_digest) {
        throw new Error(
          `Catalog artifact_digest mismatch for ${key}: catalog has ${item.artifact_digest}, built ${built.artifactDigest}`
        );
      }
      artifacts.set(key, built);
    } else if (Array.isArray(item.file_manifest) && item.file_manifest.length > 0) {
      // Deterministic fallback synthesis only if no fixture files were explicitly registered
      const syntheticFiles = item.file_manifest.map((f) => ({
        path: f.path,
        executable_addon: Boolean(f.executable_addon),
        content: Buffer.from(`playforgepkg-stub:${key}:${f.path}`, 'utf8')
      }));
      const built = buildPlayforgePackage(item, syntheticFiles);
      if (item.artifact_digest && built.artifactDigest !== item.artifact_digest) {
        throw new Error(
          `No matching artifact buffer for ${key}: catalog digest ${item.artifact_digest} !== ${built.artifactDigest}`
        );
      }
      artifacts.set(key, built);
    }
  }
  return artifacts;
}
