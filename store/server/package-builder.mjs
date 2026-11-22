import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(HERE, '..', '..');

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

export const LICENSE_SUMMARY_TEXT = Object.freeze({
  'CC0-1.0': [
    'CC0 1.0 Universal (Public Domain Dedication)',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    '',
    'The person who associated a work with this deed has dedicated the work to the public domain',
    'by waiving all of his or her rights to the work worldwide under copyright law, including all',
    'related and neighboring rights, to the extent allowed by law.',
    'You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.'
  ].join('\n'),
  MIT: [
    'MIT License',
    'https://opensource.org/licenses/MIT',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software',
    'and associated documentation files (the "Software"), to deal in the Software without restriction,',
    'including without limitation the rights to use, copy, modify, merge, publish, distribute,',
    'sublicense, and/or sell copies of the Software, subject to preserving this copyright notice and permission notice.'
  ].join('\n'),
  Unlicense: [
    'The Unlicense',
    'https://unlicense.org/',
    '',
    'This is free and unencumbered software released into the public domain.',
    'Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software for any purpose.'
  ].join('\n'),
  'BSD-3-Clause': [
    'BSD 3-Clause License',
    'https://opensource.org/licenses/BSD-3-Clause',
    '',
    'Redistribution and use in source and binary forms, with or without modification, are permitted',
    'provided that copyright notices and disclaimers are retained and no endorsement is implied.'
  ].join('\n'),
  Zlib: [
    'zlib License',
    'https://opensource.org/licenses/Zlib',
    '',
    'Permission is granted to anyone to use this software for any purpose, including commercial',
    'applications, and to alter it and redistribute it freely, subject to standard origin notice.'
  ].join('\n'),
  'Apache-2.0': [
    'Apache License, Version 2.0',
    'https://www.apache.org/licenses/LICENSE-2.0',
    '',
    'Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at the URL above.',
    'Permits commercial use, modification, distribution, and patent use with notice preservation.'
  ].join('\n'),
  'CC-BY-4.0': [
    'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    'https://creativecommons.org/licenses/by/4.0/',
    '',
    'You are free to share and adapt for any purpose, even commercially, provided appropriate credit',
    'is given, a link to the license is provided, and changes are indicated.'
  ].join('\n'),
  'CC-BY-3.0': [
    'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
    'https://creativecommons.org/licenses/by/3.0/',
    '',
    'You are free to share and adapt for any purpose, even commercially, provided appropriate credit',
    'is given to the original author and a link to the license is provided.'
  ].join('\n'),
  'OGA-BY-3.0': [
    'OpenGameArt.org Attribution 3.0 (OGA-BY 3.0)',
    'https://static.opengameart.org/OGA-BY-3.0.txt',
    '',
    'Permits commercial use, modification, and redistribution with author attribution and no DRM restriction.'
  ].join('\n'),
  'OFL-1.1': [
    'SIL Open Font License, Version 1.1 (OFL-1.1)',
    'https://openfontlicense.org/',
    '',
    'Free to use, embed in commercial games, modify, and redistribute with this license notice.',
    'Standalone paid sale of the font files by themselves is prohibited; free distribution only.'
  ].join('\n')
});

export function buildThirdPartyNoticesText(item) {
  const title = String(item.title || item.asset_id || 'Asset');
  const author = String(item.author || item.publisher_id || 'Community');
  const licenseId = String(item.license || 'CC0-1.0');
  const sourceUrl = String(item.source_url || item.download_url || 'PlayForge Asset Store');
  const aiDisclosure = String(item.ai_disclosure || 'No generative AI used');
  const provider = String(item.source_provider || 'PlayForge Open Catalog');
  const downloadUrl = String(item.external_download_url || item.download_url || sourceUrl);
  const attributionLine = String(item.attribution_text || '')
    || `Asset uses ${title} by ${author} under ${licenseId} (${sourceUrl}); see Third-Party Notices.txt file in package for details. (AI Disclosure: ${aiDisclosure})`;

  return [
    'THIRD-PARTY ASSET NOTICES',
    '=========================',
    '',
    attributionLine,
    '',
    `Asset ID: ${item.asset_id || ''}`,
    `Title: ${title}`,
    `Author / Creator: ${author}`,
    `License: ${licenseId} (${item.license_tier || 'tier1_cc0'})`,
    `Source Provider: ${provider}`,
    `Source URL: ${sourceUrl}`,
    `External Download URL: ${downloadUrl}`,
    `AI Disclosure: ${aiDisclosure}`,
    ''
  ].join('\n');
}

export function buildCollectedPackageFiles(item, repoRoot = DEFAULT_REPO_ROOT) {
  const slug = String(item.asset_id || 'asset');
  const licenseId = String(item.license || 'CC0-1.0');
  const licenseBody = LICENSE_SUMMARY_TEXT[licenseId] || LICENSE_SUMMARY_TEXT['CC0-1.0'];
  const author = String(item.author || item.publisher_id || 'Community');
  const sourceProvider = String(item.source_provider || 'PlayForge Open Catalog');
  const sourceUrl = String(item.source_url || '');
  const downloadUrl = String(item.external_download_url || item.download_url || sourceUrl);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const formats = Array.isArray(item.formats) ? item.formats : [];
  const aiDisclosure = String(item.ai_disclosure || 'No generative AI used');
  const licenseTier = String(item.license_tier || 'tier1_cc0');
  const attributionText = String(item.attribution_text || '')
    || `Asset uses ${item.title} by ${author} under ${licenseId} (${sourceUrl || downloadUrl}); see Third-Party Notices.txt file in package for details. (AI Disclosure: ${aiDisclosure})`;

  const licenseTxt = [
    `Asset: ${item.title} (${slug})`,
    `Author: ${author}`,
    `Source: ${sourceProvider}${sourceUrl ? ` (${sourceUrl})` : ''}`,
    `License: ${licenseId} (${licenseTier})`,
    `License Snapshot Ref: ${item.license_snapshot_ref || ''}`,
    `AI Disclosure: ${aiDisclosure}`,
    '',
    '---',
    '',
    licenseBody,
    ''
  ].join('\n');

  const noticesTxt = buildThirdPartyNoticesText(item);

  const readmeMd = [
    `# ${item.title}`,
    '',
    `- **Asset ID**: \`${slug}\``,
    `- **카테고리**: ${item.category || '기타'}`,
    `- **라이선스**: \`${licenseId}\` (\`${licenseTier}\` · 상업·비상업 게임 제작 활용 가능)`,
    `- **AI 투명성 표기**: ${aiDisclosure}`,
    `- **저작자 / 출처**: ${author} · ${sourceProvider}`,
    sourceUrl ? `- **공식 원본 페이지**: ${sourceUrl}` : '',
    downloadUrl ? `- **외부 공식 다운로드 경로**: ${downloadUrl}` : '',
    formats.length ? `- **지원 포맷**: ${formats.join(', ')}` : '',
    tags.length ? `- **태그**: ${tags.map((t) => `#${t}`).join(' ')}` : '',
    `- **지원 환경**: Godot ${item.engine_compatibility?.godot_min || '4.3'}+ (검증 ${item.engine_compatibility?.godot_tested || '4.7.2'}) · Forge 전용 (${(item.engine_compatibility?.platforms || ['web', 'windows', 'linux', 'macos']).join(', ')})`,
    '',
    '## 설명',
    item.summary || '',
    '',
    '## 표준 크레딧 표기 (CREDITS.md)',
    '```text',
    attributionText,
    '```',
    '',
    '## Godot 4.7.2 프로젝트 적용 안내',
    '1. PlayForge Store 웹에서 본 패키지를 **내 라이브러리**에 저장하거나 **외부 공식 다운로드**에서 원파일을 직접 받습니다.',
    '2. Godot 에디터(설치형 또는 웹 에디터)의 **PlayForge Store 도크**에서 새로고침 후 6단계 검토를 거쳐 프로젝트에 적용합니다.',
    '3. 모든 파일은 `assets/' + slug + '/` 하위 격리 경로에 배치되며 `LICENSE.txt` 및 `Third-Party Notices.txt` 고지 파일이 함께 포함됩니다.',
    ''
  ].filter((line) => line !== null).join('\n');

  const metadataJson = `${JSON.stringify({
    schema_version: 1,
    asset_id: slug,
    asset_version_id: item.asset_version_id,
    release_id: item.release_id,
    title: item.title,
    summary: item.summary || '',
    category: item.category || '',
    tags,
    formats,
    license: licenseId,
    license_tier: licenseTier,
    hosting_policy: item.hosting_policy || 'direct_or_external',
    ai_disclosure: aiDisclosure,
    attribution_text: attributionText,
    license_snapshot_ref: item.license_snapshot_ref || '',
    author,
    source_provider: sourceProvider,
    source_url: sourceUrl,
    download_url: downloadUrl,
    external_download_url: downloadUrl,
    thumbnail_url: item.thumbnail_url || '',
    engine_compatibility: item.engine_compatibility || null
  }, null, 2)}\n`;

  const files = [
    { path: `assets/${slug}/ASSET_METADATA.json`, executable_addon: false, content: Buffer.from(metadataJson, 'utf8') },
    { path: `assets/${slug}/LICENSE.txt`, executable_addon: false, content: Buffer.from(licenseTxt, 'utf8') },
    { path: `assets/${slug}/README.md`, executable_addon: false, content: Buffer.from(readmeMd, 'utf8') },
    { path: `assets/${slug}/Third-Party Notices.txt`, executable_addon: false, content: Buffer.from(noticesTxt, 'utf8') }
  ];

  if (Array.isArray(item.local_bundle_files) && item.local_bundle_files.length > 0) {
    for (const ref of item.local_bundle_files) {
      const absPath = path.resolve(repoRoot, ref.repo_rel_path);
      if (!absPath.startsWith(path.resolve(repoRoot) + path.sep) || !fs.existsSync(absPath)) {
        throw new Error(`Missing local bundle file for ${slug}: ${ref.repo_rel_path}`);
      }
      files.push({
        path: ref.path,
        executable_addon: Boolean(ref.executable_addon),
        content: fs.readFileSync(absPath)
      });
    }
  }
  return files;
}

export function buildCatalogArtifact(item, { customArtifacts = null, repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const key = `${item.asset_id}@${item.asset_version_id}`;
  if (customArtifacts?.has(key)) {
    const provided = customArtifacts.get(key);
    const buffer = Buffer.isBuffer(provided) ? provided : Buffer.from(provided);
    const actualDigest = formatSha256Digest(buffer);
    if (item.artifact_digest && actualDigest !== item.artifact_digest) {
      throw new Error(`Artifact digest mismatch for ${key}: expected ${item.artifact_digest}, got ${actualDigest}`);
    }
    return {
      buffer,
      sha256Hex: actualDigest.slice('sha256:'.length),
      artifactDigest: actualDigest
    };
  }

  const fixtureFiles = SAMPLE_PACKAGE_FILES[key];
  if (fixtureFiles) {
    const built = buildPlayforgePackage(item, fixtureFiles);
    if (item.artifact_digest && built.artifactDigest !== item.artifact_digest) {
      throw new Error(
        `Catalog artifact_digest mismatch for ${key}: catalog has ${item.artifact_digest}, built ${built.artifactDigest}`
      );
    }
    return built;
  }

  if (item.source_provider || Array.isArray(item.local_bundle_files)) {
    const collectedFiles = buildCollectedPackageFiles(item, repoRoot);
    const built = buildPlayforgePackage(item, collectedFiles);
    if (item.artifact_digest && built.artifactDigest !== item.artifact_digest) {
      throw new Error(
        `Collected artifact_digest mismatch for ${key}: catalog has ${item.artifact_digest}, built ${built.artifactDigest}`
      );
    }
    return built;
  }

  if (Array.isArray(item.file_manifest) && item.file_manifest.length > 0) {
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
    return built;
  }
  return null;
}

export function createCatalogArtifacts(catalog, customArtifacts = null, { repoRoot = DEFAULT_REPO_ROOT, lazyThreshold = 50 } = {}) {
  const packages = catalog.filter((item) => item.release_kind === 'package');
  if (packages.length <= lazyThreshold) {
    const artifacts = new Map();
    for (const item of packages) {
      const key = `${item.asset_id}@${item.asset_version_id}`;
      const built = buildCatalogArtifact(item, { customArtifacts, repoRoot });
      if (built) artifacts.set(key, built);
    }
    return artifacts;
  }

  // Lazy LRU-cached artifact store for large catalogs (thousands of CC0/MIT packages)
  const byKey = new Map(packages.map((item) => [`${item.asset_id}@${item.asset_version_id}`, item]));
  const cache = new Map();
  const MAX_CACHE = 128;

  // Always eagerly verify the core SAMPLE_PACKAGE_FILES entries at startup
  for (const [key, item] of byKey.entries()) {
    if (SAMPLE_PACKAGE_FILES[key] || customArtifacts?.has(key)) {
      const built = buildCatalogArtifact(item, { customArtifacts, repoRoot });
      if (built) cache.set(key, built);
    }
  }

  return {
    get size() {
      return byKey.size;
    },
    has(key) {
      return byKey.has(key);
    },
    get(key) {
      if (cache.has(key)) {
        const hit = cache.get(key);
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const item = byKey.get(key);
      if (!item) return undefined;
      const built = buildCatalogArtifact(item, { customArtifacts, repoRoot });
      if (!built) return undefined;
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, built);
      return built;
    }
  };
}
