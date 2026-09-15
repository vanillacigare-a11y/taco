'use strict';
/* ==========================================================================
   블로그 이름 / 닉네임
   환경변수(BLOG_TITLE)를 기본값으로 두고, 관리 화면에서 바꾸면 그 값이 이긴다.
   ========================================================================== */
const { settings } = require('./db');
const { cfg } = require('./config');

const FIELDS = {
  title: () => cfg.blogTitle,   // 브라우저 탭 · 바탕화면 머리글에 쓰인다
  nickname: () => ''            // 방명록에서 내가 쓴 글에 붙는 이름
};

/* 이름을 아직 안 정했을 때 화면에 뜨는 말.
   여기에 그럴듯한 이름을 지어넣지 말 것 — 이름은 주인이 관리 화면에서 정한다. */
const UNSET_TITLE = '블로그';

const LIMITS = { title: 60, nickname: 20 };

function get(key) {
  const v = settings.get('site:' + key, null);
  if (v == null || v === '') return FIELDS[key] ? FIELDS[key]() : '';
  return v;
}

function all() {
  const out = {};
  for (const k of Object.keys(FIELDS)) out[k] = get(k);
  return out;
}

function set(obj) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (!(k in FIELDS)) continue;
    settings.set('site:' + k, String(v == null ? '' : v).trim().slice(0, LIMITS[k] || 60));
  }
  return all();
}

/* 방명록 등에서 쓰는 표시 이름 */
function ownerName() { return get('nickname') || '주인'; }

/* 화면에 실제로 그릴 블로그 이름 */
function displayTitle() { return get('title') || UNSET_TITLE; }
function titleIsSet() { return !!get('title'); }

module.exports = { get, all, set, ownerName, displayTitle, titleIsSet, UNSET_TITLE, FIELDS };
