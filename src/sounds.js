'use strict';
/* ==========================================================================
   소리 교체
   스킨은 click.mp3 / alarm.mp3 / shaker_*.mp3 를 고정된 주소로 물고 있다.
   그 주소로 요청이 오면, 바꾼 파일이 있을 때 그걸 대신 내보낸다.
   → 스킨 파일을 건드리지 않고 관리 화면에서 소리를 바꿀 수 있다.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');

const DIR = path.join(cfg.dataDir, 'sounds');
fs.mkdirSync(DIR, { recursive: true });

/* 바꿀 수 있는 소리 목록 (스킨이 쓰는 파일 이름 기준) */
const SOUNDS = [
  { key: 'click',         file: 'click.mp3',         label: '클릭음' },
  { key: 'alarm',         file: 'alarm.mp3',         label: '알람' },
  { key: 'shaker_shorts', file: 'shaker_shorts.mp3', label: '쉐이커 (짧게)' },
  { key: 'shaker_long',   file: 'shaker_long.mp3',   label: '쉐이커 (길게)' }
];

const byFile = new Map(SOUNDS.map(s => [s.file, s]));
const byKey = new Map(SOUNDS.map(s => [s.key, s]));

function metaPath(key) { return path.join(DIR, key + '.json'); }
function readMeta(key) {
  try { return JSON.parse(fs.readFileSync(metaPath(key), 'utf8')); } catch (e) { return null; }
}

/* 바뀐 파일이 있으면 { abs, mime, name, bytes } 를 준다 */
function override(file) {
  const s = byFile.get(file);
  if (!s) return null;
  const m = readMeta(s.key);
  if (!m) return null;
  const abs = path.join(DIR, m.stored);
  if (!fs.existsSync(abs)) return null;
  return { abs, mime: m.mime, name: m.name, bytes: m.bytes };
}

function save(key, buffer, origName, mime) {
  const s = byKey.get(key);
  if (!s) throw new Error('바꿀 수 없는 소리야');
  remove(key);
  const ext = (String(origName).match(/\.([a-z0-9]{2,4})$/i) || [, 'mp3'])[1].toLowerCase();
  const stored = key + '.' + ext;
  fs.writeFileSync(path.join(DIR, stored), buffer);
  const meta = { stored, name: origName, mime: mime || 'audio/mpeg', bytes: buffer.length, at: Date.now() };
  fs.writeFileSync(metaPath(key), JSON.stringify(meta));
  return meta;
}

function remove(key) {
  const m = readMeta(key);
  if (m) { try { fs.unlinkSync(path.join(DIR, m.stored)); } catch (e) {} }
  try { fs.unlinkSync(metaPath(key)); } catch (e) {}
}

function list() {
  return SOUNDS.map(s => {
    const m = readMeta(s.key);
    return {
      key: s.key, file: s.file, label: s.label,
      custom: !!m,
      name: m ? m.name : null,
      bytes: m ? m.bytes : null,
      url: '/skin/images/' + s.file + (m ? '?v=' + m.at : '')
    };
  });
}

module.exports = { SOUNDS, override, save, remove, list };
