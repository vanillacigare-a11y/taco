'use strict';
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');
const { settings, posts, guestbook } = require('./db');
const site = require('./site');

/* ==========================================================================
   스킨이 읽는 HTML 계약
   - skin.html 을 그대로 쓰되 #tistory-data 블록만 우리가 만든 것으로 바꾼다
   - 스킨 JS 는 이 블록을 파싱해 창 안에 다시 그린다 (script.js 는 손대지 않음)
   ========================================================================== */

const SKIN_HTML = path.join(cfg.skinDir, 'skin.html');

/* 스킨 옵션 기본값 — index.xml 의 variables 와 같은 이름 */
const SKIN_VARS = {
  configPostUrl: '',
  calendarPostUrl: '',
  galleryCategories: cfg.galleryCategory,
  ddayCategory: '디데이',
  loadingBg: '#dcdcd8',
  loadingLogoText: '',
  loadingLogoImage: '',
  loadingCaption: 'Now Loading...',
  clickSound: 'true',
  shakerSound: 'true',
  windowMotion: 'true',
  postSerifFont: 'false',
  pixelCursor: 'true',
  categoryTreeExpanded: 'true',
  visitorEditing: 'false',
  noteStorage: '', noteGallery: ''
};

function skinVar(name) {
  const v = settings.get('skin:' + name, null);
  return v == null ? (SKIN_VARS[name] ?? '') : v;
}
function isOn(name) {
  const v = String(skinVar(name)).toLowerCase();
  return v === 'true' || v === '1' || v === 'on';
}

let cached = null;
function template() {
  if (cached && !process.env.DEV_RELOAD_SKIN) return cached;
  if (!fs.existsSync(SKIN_HTML)) {
    cached = { head: null };
    return cached;
  }
  let s = fs.readFileSync(SKIN_HTML, 'utf8');

  // 스킨 파일 참조를 /skin/ 으로
  s = s.replace(/(src|href)="\.\/([^"]+)"/g, (m, a, p) => `${a}="/skin/${p}"`);

  // 조건 블록 처리: <s_if_var_X>…</s_if_var_X> / <s_not_var_X>…</s_not_var_X>
  s = s.replace(/<s_if_var_([a-zA-Z]+)>([\s\S]*?)<\/s_if_var_\1>/g, (m, name, body) => isOn(name) ? body : '');
  s = s.replace(/<s_not_var_([a-zA-Z]+)>([\s\S]*?)<\/s_not_var_\1>/g, (m, name, body) => isOn(name) ? '' : body);

  // 데이터 블록 자리를 표시
  const i = s.indexOf('<div id="tistory-data"');
  const j = s.indexOf('<script type="module"');
  if (i < 0 || j < 0) throw new Error('skin.html 구조를 알아볼 수 없어 (#tistory-data / module script 를 못 찾음)');
  cached = { before: s.slice(0, i), after: s.slice(j) };
  return cached;
}

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ── 조각들 ─────────────────────────────────────────────────────────────── */

function categoryListHtml() {
  const rows = posts.categories();
  const tree = new Map();                       // 상위 → [하위…]
  let total = 0;
  for (const r of rows) {
    total += r.n;
    const [top, sub] = r.category.split('/');
    if (!tree.has(top)) tree.set(top, { n: 0, subs: [] });
    const node = tree.get(top);
    if (sub) node.subs.push({ name: sub, full: r.category, n: r.n });
    else node.n += r.n;
  }
  let out = `<ul class="tt_category"><li class="c_open">` +
    `<a href="/category" class="link_tit">분류 전체보기 <span class="c_cnt">(${total})</span></a>` +
    `<ul class="category_list">`;
  for (const [top, node] of tree) {
    const cnt = node.n + node.subs.reduce((a, s) => a + s.n, 0);
    out += `<li class="category_item"><a href="/category/${encodeURIComponent(top)}" class="link_item">` +
      `${esc(top)} <span class="c_cnt">(${cnt})</span></a>`;
    if (node.subs.length) {
      out += `<ul class="sub_category_list">`;
      for (const s of node.subs) {
        out += `<li class="sub_category_item"><a href="/category/${s.full.split('/').map(encodeURIComponent).join('/')}" class="link_sub_item">` +
          `${esc(s.name)} <span class="c_cnt">(${s.n})</span></a></li>`;
      }
      out += `</ul>`;
    }
    out += `</li>`;
  }
  out += `</ul></li></ul>`;
  return out;
}

function tagListHtml() {
  const tags = posts.allTags();
  if (!tags.length) return '';
  const max = tags[0].n || 1;
  return tags.map(t => {
    const cloud = 'cloud' + Math.max(1, Math.min(5, Math.round((t.n / max) * 5)));
    return `<a class="t-tag" href="/tag/${encodeURIComponent(t.tag)}" data-cloud="${cloud}">${esc(t.tag)}</a>`;
  }).join('\n');
}

function listItemHtml(p) {
  const thumb = p.thumb ? `<img class="t-thumb" src="${esc(p.thumb)}" alt="" loading="lazy">` : '';
  return `<article class="t-article t-list-item${p.is_notice ? ' t-notice' : ''}" data-link="/${p.id}" data-category="${esc(p.category)}">
  ${thumb}
  <h2 class="t-title">${esc(p.title)}</h2>
  <span class="t-date t-list-date">${fmtDate(p.created_at)}</span>
</article>`;
}

function articleHtml(p, tags) {
  const tagHtml = tags && tags.length
    ? `<div class="t-tags">${tags.map(t => `<a href="/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join(' ')}</div>`
    : '';
  return `<article class="t-article" data-link="/${p.id}" data-category="${esc(p.category)}">
  <h2 class="t-title">${esc(p.title)}</h2>
  <span class="t-date t-list-date">${fmtDate(p.created_at)}</span>
  <div class="t-meta">
    <span class="t-category">${esc(p.category)}</span>
    <span class="t-date">${fmtDate(p.created_at)}</span>
  </div>
  ${tagHtml}
  <div class="t-body">${p.body_html}</div>
</article>`;
}

/* 페이징: data-no-next 가 빈 문자열이면 "다음 페이지 있음" 이라는 뜻 (스킨 ve() 규칙) */
function pagingHtml({ hasPrev, hasNext }) {
  return `<div class="t-paging" data-no-prev="${hasPrev ? '' : '1'}" data-no-next="${hasNext ? '' : '1'}"></div>`;
}

function guestbookHtml() {
  const rows = guestbook.list(200);
  const body = rows.length
    ? rows.map(g => `<div class="guest-item"><strong>${esc(g.nickname)}</strong> ` +
        `<span class="t-date">${fmtDate(g.created_at)}</span><p>${esc(g.body)}</p></div>`).join('\n')
    : '<p>아직 방명록이 없어.</p>';
  return `<article class="t-article t-guestbook" data-link="">
  <h2 class="t-title">방명록</h2>
  <div class="t-body t-guestbook-body">${body}</div>
</article>`;
}

/* ── 페이지 조립 ────────────────────────────────────────────────────────── */

function dataBlock(view) {
  const parts = [`<div id="tistory-data" hidden>`];
  parts.push(`<div class="t-category-list">${categoryListHtml()}</div>`);
  parts.push(`<div class="t-tag-list">${tagListHtml()}</div>`);

  if (view.kind === 'list') {
    parts.push(`<div class="t-list-style" data-value="${esc(cfg.listStyle)}"></div>`);
    for (const p of view.rows) parts.push(listItemHtml(p));
    parts.push(pagingHtml(view));
  } else if (view.kind === 'post') {
    parts.push(articleHtml(view.post, view.tags));
  } else if (view.kind === 'guestbook') {
    parts.push(guestbookHtml());
  }
  parts.push(`</div>`);
  return parts.join('\n');
}

/* 스크립트 안에 안전하게 넣기 위한 JSON */
function jsonInScript(v) {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function desktopSeed() {
  let st;
  try {
    const raw = settings.get('desktop:state', '');
    if (!raw) return '';
    st = JSON.parse(raw);
  } catch (e) { return ''; }
  const keys = (st && st.keys) || {};
  const icons = (st && st.icons) || {};
  if (!Object.keys(keys).length && !Object.keys(icons).length) return '';
  return '<script>(function(){var K=' + jsonInScript(keys) + ',P=' + jsonInScript(icons) + ';' +
    'try{for(var k in K){if(sessionStorage.getItem("dds:"+k)===null)sessionStorage.setItem("dds:"+k,K[k]);}}catch(e){}' +
    'window.DDS_ICON_POS=P;})();</script>\n';
}

/* 관리 화면에서 등록한 음악 — 스킨이 찾을 주소를 미리 깔아준다 */
function musicSeed() {
  let src = '';
  try { src = require('./widgets').musicSource(); } catch (e) { return ''; }
  if (!src) return '';
  return '<script>try{if(sessionStorage.getItem("dds:bgmSource")===null)' +
    'sessionStorage.setItem("dds:bgmSource",' + jsonInScript(JSON.stringify(src)) + ');}catch(e){}</script>\n';
}

function page(view, opts) {
  opts = opts || {};
  const t = template();
  if (!t.before) {
    return `<!doctype html><meta charset="utf-8"><title>스킨 없음</title>
<body style="font:14px/1.7 system-ui;padding:40px;max-width:640px;margin:auto">
<h1>스킨 파일이 없어</h1>
<p><code>public/skin/</code> 안에 <code>skin.html</code>, <code>style.css</code>, <code>images/</code> 를 넣어줘.
README 의 <b>설치</b> 항목을 봐.</p>
<p>관리 화면은 <a href="/manage">/manage</a> 로 들어갈 수 있어.</p>`;
  }
  const blogTitle = site.displayTitle();
  const title = view.title ? `${view.title} :: ${blogTitle}` : blogTitle;
  let head = t.before
    .replace(/\[##_page_title_##\]/g, esc(title))
    .replace(/\[##_title_##\]/g, esc(blogTitle))
    .replace(/\[##_blog_link_##\]/g, '/')
    .replace(/\[##_body_id_##\]/g, view.bodyId)
    .replace(/\[##_var_([a-zA-Z]+)_##\]/g, (m, name) => esc(skinVar(name)));
  /* 주인으로 로그인했을 때만: 스킨에 "이 사람이 주인" 신호를 주고 슬롯 저장 다리를 넣는다.
     스킨은 window.tiara.customProps.role 로 권한을 판정한다 (티스토리와 같은 방식). */
  /* 주인이 「저장」을 눌러둔 바탕화면 상태 — 모든 방문자 화면에 미리 깔아준다.
     스킨은 이 값들을 sessionStorage 에서 읽는다. 이 탭에서 이미 뭔가 바꿨다면 건드리지 않는다.
     반드시 스킨 스크립트보다 먼저 실행돼야 한다. */
  const deskBits = desktopSeed() + musicSeed();

  const ownerBits = opts.owner
    ? '<script>window.tiara={customProps:{role:"owner"}};</script>\n' +
      '<script src="/bridge/slot-bridge.js"></script>\n'
    : '';
  return head + dataBlock(view) + '\n' + deskBits + ownerBits +
    '<script src="/bridge/desktop.js" defer></script>\n' + t.after;
}

module.exports = { page, dataBlock, skinVar, isOn, SKIN_VARS, fmtDate, esc };
