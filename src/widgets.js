'use strict';
/* ==========================================================================
   위젯 데이터 — 디데이 · 캘린더 · 음악

   스킨은 이 셋을 전부 "블로그 글"에서 읽어간다 (티스토리에 저장할 데가 없었어서).
   그래서 관리 화면에서 입력하면, 서버가 그 글을 대신 만들고 관리한다.
   글 목록에는 안 나온다 (system_kind).
   ========================================================================== */
const { posts, settings } = require('./db');
const { cfg } = require('./config');

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function skinVar(name, dflt) {
  const v = settings.get('skin:' + name, null);
  return v == null || v === '' ? dflt : v;
}

/* ── 디데이 ────────────────────────────────────────────────────────────────
   스킨 규칙: 디데이 카테고리의 글, 제목이 "YYYY-MM-DD 이름".
   본문 첫 이미지가 가로 배너 배경이 되고, 그 위에 어둡게 덮인 채 이름·D-day 가 얹힌다.
   ------------------------------------------------------------------------ */
const DDAY_KIND = 'dday';
const DDAY_TITLE = /^(\d{4})-(\d{2})-(\d{2})\s+(.*\S)$/;

function ddayCategory() { return skinVar('ddayCategory', '디데이'); }

function ddayList() {
  return posts.all()
    .filter(p => p.system_kind === DDAY_KIND)
    .map(p => {
      const m = DDAY_TITLE.exec(p.title || '');
      return {
        id: p.id,
        date: m ? `${m[1]}-${m[2]}-${m[3]}` : '',
        name: m ? m[4] : (p.title || ''),
        image: p.thumb || '',
        link: '/' + p.id
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function ddayPayload({ date, name, image }) {
  const d = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('날짜는 2026-03-15 처럼 적어줘');
  const nm = String(name || '').trim();
  if (!nm) throw new Error('이름을 적어줘');
  const img = String(image || '').trim();
  return {
    title: `${d} ${nm}`,
    category: ddayCategory(),
    body_md: '',
    body_html: img ? `<p><img src="${esc(img)}" alt="${esc(nm)}"></p>` : '',
    thumb: img || null,
    system_kind: DDAY_KIND
  };
}

function ddaySave(item) {
  const p = ddayPayload(item);
  if (item.id) {
    const cur = posts.get(Number(item.id));
    if (!cur || cur.system_kind !== DDAY_KIND) throw new Error('없는 디데이야');
    posts.update(cur.id, p);
    return cur.id;
  }
  return posts.create(p);
}

function ddayRemove(id) {
  const p = posts.get(Number(id));
  if (!p || p.system_kind !== DDAY_KIND) throw new Error('없는 디데이야');
  posts.remove(p.id);
}

/* 카테고리 이름이 바뀌면 기존 디데이 글도 따라 옮긴다 */
function ddayResync() {
  const cat = ddayCategory();
  for (const p of posts.all()) {
    if (p.system_kind === DDAY_KIND && p.category !== cat) posts.update(p.id, { ...p, category: cat });
  }
}

/* ── 캘린더 ────────────────────────────────────────────────────────────────
   스킨 규칙: 글 하나의 본문에 "YYYY-MM-DD 내용" 을 한 줄씩.
   그 글 주소를 스킨 옵션(calendarPostUrl)에 넣어야 하는데, 그것도 여기서 해준다.
   ------------------------------------------------------------------------ */
const CAL_KIND = 'calendar';
const CAL_LINE = /^(\d{4})-(\d{2})-(\d{2})\s+(\S.*)$/;

function calendarPost() { return posts.bySystem(CAL_KIND); }

function calendarList() {
  const p = calendarPost();
  if (!p) return [];
  const out = [];
  for (const raw of String(p.body_md || '').split('\n')) {
    const m = CAL_LINE.exec(raw.trim());
    if (m) out.push({ date: `${m[1]}-${m[2]}-${m[3]}`, text: m[4].trim() });
  }
  return out;
}

function calendarSave(rows) {
  const clean = [];
  for (const r of rows || []) {
    const d = String((r && r.date) || '').trim();
    const t = String((r && r.text) || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) continue;
    clean.push({ date: d, text: t });
  }
  clean.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const md = clean.map(r => `${r.date} ${r.text}`).join('\n');
  const html = clean.length
    ? clean.map(r => `<p>${esc(r.date)} ${esc(r.text)}</p>`).join('\n')
    : '<p></p>';
  const payload = {
    title: '캘린더 기록', category: skinVar('calendarCategory', ''),
    body_md: md, body_html: html, thumb: null, system_kind: CAL_KIND
  };

  const cur = calendarPost();
  const id = cur ? (posts.update(cur.id, payload), cur.id) : posts.create(payload);
  settings.set('skin:calendarPostUrl', '/' + id);   // 스킨이 읽을 주소를 자동 등록
  return { id, count: clean.length };
}

/* ── 음악 ──────────────────────────────────────────────────────────────────
   스킨 규칙: 유튜브 주소, 또는 오디오가 첨부된 글의 주소.
   첨부는 티스토리 첨부 형태(figure.fileblock)로 읽으므로 그 모양 그대로 만들어준다.
   ------------------------------------------------------------------------ */
const BGM_KIND = 'bgm';

function musicPost() { return posts.bySystem(BGM_KIND); }

function musicGet() {
  const p = musicPost();
  const raw = settings.get('music:tracks', '');
  let tracks = [];
  try { tracks = raw ? JSON.parse(raw) : []; } catch (e) { tracks = []; }
  return {
    tracks,                                   // [{name, path, bytes}]
    youtube: settings.get('music:youtube', ''),
    cover: settings.get('music:cover', ''),
    postUrl: p ? '/' + p.id : ''
  };
}

function musicSync() {
  const { tracks, youtube, cover } = musicGet();
  const parts = [];
  if (cover) parts.push(`<p><img src="${esc(cover)}" alt="앨범 커버"></p>`);
  for (const t of tracks) {
    /* 스킨이 오디오를 찾는 모양 (티스토리 첨부와 같은 구조) */
    parts.push(
      `<figure class="fileblock"><a href="${esc(t.path)}">` +
      `<span class="filename"><span class="name">${esc(t.name)}</span></span></a></figure>`
    );
  }
  if (youtube) parts.push(`<p><a href="${esc(youtube)}">${esc(youtube)}</a></p>`);

  const payload = {
    title: '음악 저장소', category: skinVar('musicCategory', ''),
    body_md: '', body_html: parts.join('\n') || '<p></p>',
    thumb: cover || null, system_kind: BGM_KIND
  };
  const cur = musicPost();
  const id = cur ? (posts.update(cur.id, payload), cur.id) : posts.create(payload);
  settings.set('music:postUrl', '/' + id);
  return id;
}

function musicSetTracks(tracks) {
  settings.set('music:tracks', JSON.stringify(tracks || []));
  return musicSync();
}
function musicSetYoutube(url) {
  settings.set('music:youtube', String(url || '').trim());
  return musicSync();
}
function musicSetCover(url) {
  settings.set('music:cover', String(url || '').trim());
  return musicSync();
}

/* 스킨이 음악을 찾을 주소 — 유튜브만 쓰면 유튜브 주소, 아니면 우리 글 주소 */
function musicSource() {
  const m = musicGet();
  if (m.tracks.length) return settings.get('music:postUrl', '');
  if (m.youtube) return m.youtube;
  return '';
}

module.exports = {
  ddayCategory, ddayList, ddaySave, ddayRemove, ddayResync,
  calendarList, calendarSave, calendarPost,
  musicGet, musicSetTracks, musicSetYoutube, musicSetCover, musicSource, musicSync
};
