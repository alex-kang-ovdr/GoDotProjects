'use strict';
// 어댑터 공통 도구: 경량 CSV 파서, MB→bytes, ISO 시각 정규화.
const fs = require('node:fs');

const MB = 1024 * 1024;

// 기존 프로파일 CSV는 따옴표·쉼표 포함 필드가 없는 숫자/식별자 표라 단순 분할로 충분하다.
function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] === undefined ? '' : cells[i].trim(); });
    return row;
  });
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mbToBytes(mb) {
  return Math.round(mb * MB);
}

// "2026-11-20T05:45:27" 처럼 오프셋 없는 *_utc 시각은 UTC 로 간주해 Z 를 붙인다.
function isoUtc(value, fallback) {
  if (typeof value === 'string' && value) {
    const v = /([zZ]|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallback || new Date(0).toISOString();
}

module.exports = { MB, parseCsv, readCsv, readJson, num, mbToBytes, isoUtc };
