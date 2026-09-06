'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const sharp = require('sharp');

const { cfg, banner } = require('./config');
const { settings, posts, uploads, guestbook } = require('./db');
const auth = require('./auth');
const mdx = require('./markdown');
const render = require('./render');
const gallery = require('./gallery');
const slot = require('./slot');
const sounds = require('./sounds');
const site = require('./site');
const widgets = require('./widgets');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(auth.attach);

/* ── 정적 파일 ─────────────────────────────────────────────────────────── */
/* 바꾼 소리가 있으면 스킨 파일 대신 그걸 내보낸다 (스킨은 주소를 그대로 물고 있음) */
app.use('/skin/images', (req, res, next) => {
  const file = req.path.replace(/^\//, '');
  const ov = sounds.override(file);
  if (!ov) return next();
  res.type(ov.mime).sendFile(ov.abs);
});
/* 스킨·관리·편집도구는 고칠 때마다 바로 반영돼야 한다.
   no-cache 는 "안 받아온다"가 아니라 "쓰기 전에 한 번 물어본다" 라서,
   안 바뀌었으면 304 만 오고 끝이라 느려지지도 않는다.
   (이게 없으면 브라우저가 예전 파일을 계속 써서 "고쳤는데 그대로"가 된다) */
const revalidate = { etag: true, maxAge: 0, setHeaders(res) { res.setHeader('Cache-Control', 'no-cache'); } };
app.use('/skin', express.static(cfg.skinDir, revalidate));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), revalidate));
app.use('/bridge', express.static(path.join(__dirname, '..', 'public', 'bridge'), revalidate));
/* 올린 이미지는 이름에 무작위 글자가 붙어 있어서 안전하게 오래 캐시해도 된다 */
app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '30d', immutable: true }));

/* 블로그 페이지는 사람마다 내용이 다르다 (주인이면 편집 버튼이 들어 있다).
   캐시에 남으면 로그인해도 예전(로그아웃) 화면이 다시 뜬다. 아예 저장하지 않게 한다. */
app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') &&
      !/^\/(uploads|skin|bridge|admin)\//.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Vary', 'Cookie');
  }
  next();
});

/* ── 업로드 ────────────────────────────────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxUploadMb * 1024 * 1024, files: 20 }
});

/* 브라우저가 늘 형식을 제대로 알려주지는 않는다.
   맥에서 고른 HEIC 사진, 확장자가 대문자인 파일(IMG.PNG), 외장 디스크에서 온 파일은
   application/octet-stream 으로 오거나 형식이 아예 비어서 온다.
   그래서 형식이 아니면 확장자도 한 번 더 본다. */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|avif|heic|heif|svg)$/i;
function looksLikeImage(file) {
  if (!file) return false;
  if (/^image\//i.test(file.mimetype || '')) return true;
  return IMAGE_EXT.test(file.originalname || '');
}
/* 왜 안 되는지 알 수 있게 파일 이름과 형식을 같이 알려준다 */
function notImageMsg(file) {
  if (!file) return '파일이 안 왔어';
  return '이미지로 못 읽었어 — ' + (file.originalname || '이름 없음') +
    ' (형식: ' + (file.mimetype || '알 수 없음') + ')';
}

async function saveImage(file, purpose) {
  const d = new Date();
  const dir = path.join(cfg.uploadDir, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });

  const base = (file.originalname || 'image').replace(/\.[^.]+$/, '')
    .replace(/[^\w가-힣.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const rand = Math.random().toString(36).slice(2, 7);
  const name = `${base}-${rand}.webp`;

  const img = sharp(file.buffer, { animated: false });
  const meta = await img.metadata();
  const out = await img
    .rotate()
    .resize({ width: cfg.imageMaxSide, height: cfg.imageMaxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  fs.writeFileSync(path.join(dir, name), out.data);
  const rel = `/uploads/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${name}`;
  return uploads.add({
    path: rel, orig_name: file.originalname || name,
    w: out.info.width, h: out.info.height, bytes: out.data.length,
    mime: 'image/webp',
    // gallery = 갤러리 창에 전시되는 것 / asset = 배경·아이콘 같은 재료 / post = 글 본문 사진
    purpose: purpose === 'asset' ? 'asset' : purpose === 'post' ? 'post' : 'gallery'
  });
}

/* ── API ───────────────────────────────────────────────────────────────── */
const api = express.Router();

api.get('/me', (req, res) => {
  res.json({
    owner: req.isOwner,
    guest: req.guestName,
    needsSetup: !auth.ownerExists(),
    blogTitle: site.get('title'),
    nickname: site.get('nickname')
  });
});

/* 블로그 이름 · 닉네임 */
api.get('/site', auth.requireOwner, (req, res) => res.json(site.all()));
api.put('/site', auth.requireOwner, (req, res) => {
  const b = req.body || {};
  const next = {};
  if (typeof b.title === 'string') {
    if (!b.title.trim()) return res.status(400).json({ error: 'bad', message: '블로그 이름이 비었어' });
    next.title = b.title;
  }
  if (typeof b.nickname === 'string') next.nickname = b.nickname;
  res.json({ ok: true, ...site.set(next) });
});

api.post('/setup', async (req, res) => {
  if (auth.ownerExists()) return res.status(409).json({ error: 'exists', message: '이미 계정이 있어' });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'bad', message: '아이디와 8자 이상 비밀번호가 필요해' });
  }
  const id = await auth.createOwner(username.trim(), password);
  if (typeof req.body.title === 'string' && req.body.title.trim()) site.set({ title: req.body.title });
  auth.setCookie(res, auth.createSession({ kind: 'owner', userId: id }));
  res.json({ ok: true });
});

api.post('/login', async (req, res) => {
  const ip = req.ip || 'x';
  if (auth.tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'throttled', message: '시도가 너무 많아. 10분 뒤에 다시 해줘' });
  }
  const { username, password } = req.body || {};
  const u = await auth.verifyOwner(String(username || '').trim(), String(password || ''));
  if (!u) {
    auth.noteAttempt(ip);
    return res.status(401).json({ error: 'bad', message: '아이디나 비밀번호가 달라' });
  }
  auth.clearAttempts(ip);
  auth.setCookie(res, auth.createSession({ kind: 'owner', userId: u.id }));
  res.json({ ok: true, owner: true });
});

api.post('/guest', (req, res) => {
  const nick = String((req.body && req.body.nickname) || '').trim().slice(0, 20);
  if (nick.length < 1) return res.status(400).json({ error: 'bad', message: '닉네임을 적어줘' });
  auth.setCookie(res, auth.createSession({ kind: 'guest', nickname: nick }));
  res.json({ ok: true, guest: nick });
});

api.post('/logout', (req, res) => { auth.clearCookie(res); res.json({ ok: true }); });

api.post('/password', auth.requireOwner, async (req, res) => {
  const pw = String((req.body && req.body.password) || '');
  if (pw.length < 8) return res.status(400).json({ error: 'bad', message: '8자 이상으로 정해줘' });
  await auth.changePassword(req.session.user_id, pw);
  res.json({ ok: true, message: '바꿨어. 다시 로그인해줘' });
});

/* 글 */
api.get('/posts', auth.requireOwner, (req, res) => {
  res.json(posts.all().map(p => ({
    id: p.id, title: p.title, category: p.category, visibility: p.visibility,
    is_notice: p.is_notice, system_kind: p.system_kind,
    created_at: p.created_at, updated_at: p.updated_at,
    tags: posts.tagsOf(p.id), excerpt: mdx.excerpt(p.body_md)
  })));
});

api.get('/posts/:id', auth.requireOwner, (req, res) => {
  const p = posts.get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'notfound' });
  res.json({ ...p, tags: posts.tagsOf(p.id) });
});

function postPayload(body) {
  const title = String(body.title || '').trim() || '제목 없음';
  const body_md = String(body.body_md || '');
  return {
    title,
    category: String(body.category || '').trim(),
    body_md,
    body_html: mdx.render(body_md),
    thumb: mdx.firstImage(body_md),
    visibility: body.visibility === 'private' ? 'private' : 'public',
    is_notice: body.is_notice ? 1 : 0
  };
}

api.post('/posts', auth.requireOwner, (req, res) => {
  const id = posts.create(postPayload(req.body || {}));
  posts.setTags(id, (req.body.tags || []).map(t => String(t).trim()).filter(Boolean));
  res.json({ ok: true, id });
});

api.put('/posts/:id', auth.requireOwner, (req, res) => {
  const id = Number(req.params.id);
  const cur = posts.get(id);
  if (!cur) return res.status(404).json({ error: 'notfound' });
  if (cur.system_kind) return res.status(400).json({ error: 'system', message: '갤러리 저장소 글은 여기서 못 고쳐' });
  posts.update(id, postPayload(req.body || {}));
  posts.setTags(id, (req.body.tags || []).map(t => String(t).trim()).filter(Boolean));
  res.json({ ok: true });
});

/* 글을 쓰거나 고친 뒤, 페이지를 통째로 새로 고치지 않고 목록만 다시 그리려고 쓴다.
   render.js 가 처음에 심어주는 값들과 같은 내용이다. */
api.get('/board/state', (req, res) => {
  res.json(render.boardState());
});

/* 블로그 창 맨 위에 고정할 글 — 0 을 보내면 고정 해제 (그러면 최신 글이 올라온다) */
api.post('/board/pinned', auth.requireOwner, (req, res) => {
  const id = Number((req.body && req.body.id) || 0);
  if (!id) { settings.set('board:pinned', ''); return res.json({ ok: true, pinned: 0 }); }
  const p = posts.get(id);
  if (!p || p.system_kind) return res.status(400).json({ error: 'bad', message: '고정할 수 없는 글이야' });
  settings.set('board:pinned', String(id));
  res.json({ ok: true, pinned: id });
});

/* 프로필 창에 통째로 띄울 글 */
api.post('/board/profile', auth.requireOwner, (req, res) => {
  const id = Number((req.body && req.body.id) || 0);
  if (!id) { settings.set('board:profile', ''); return res.json({ ok: true, profile: 0 }); }
  const p = posts.get(id);
  if (!p || p.system_kind) return res.status(400).json({ error: 'bad', message: '쓸 수 없는 글이야' });
  settings.set('board:profile', String(id));
  res.json({ ok: true, profile: id });
});

/* 글 창의 「비공개로 전환」 — 스킨 버튼을 우리 쪽으로 돌려 쓴다 */
api.post('/posts/:id/visibility', auth.requireOwner, (req, res) => {
  const cur = posts.get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'notfound' });
  if (cur.system_kind) return res.status(400).json({ error: 'system', message: '저장소 글은 못 바꿔' });
  const to = req.body && req.body.visibility === 'private' ? 'private'
    : req.body && req.body.visibility === 'public' ? 'public'
    : (cur.visibility === 'public' ? 'private' : 'public');
  posts.update(cur.id, { ...cur, visibility: to });
  res.json({ ok: true, visibility: to });
});

api.delete('/posts/:id', auth.requireOwner, (req, res) => {
  const p = posts.get(Number(req.params.id));
  if (p && p.system_kind) return res.status(400).json({ error: 'system' });
  posts.remove(Number(req.params.id));
  res.json({ ok: true });
});

/* 업로드 */
api.get('/uploads', auth.requireOwner, (req, res) => {
  /* 갤러리 탭은 갤러리 이미지만 보여준다 */
  res.json({
    items: uploads.list('gallery'),
    totalBytes: uploads.totalBytes('gallery'),
    assetBytes: uploads.totalBytes('asset')
  });
});

/* purpose=post 면 글 본문에 넣는 사진이라 갤러리에는 안 들어간다.
   갤러리는 갤러리 창에 전시하려고 올린 것만 담는다. */
api.post('/uploads', auth.requireOwner, upload.array('files', 20), async (req, res) => {
  try {
    const forPost = req.query.purpose === 'post' || req.body.purpose === 'post';
    /* titles 는 고른 파일 순서대로 온다 (한 장이면 문자열, 여러 장이면 배열) */
    const t = req.body.titles;
    const titles = t == null ? [] : (Array.isArray(t) ? t : [t]);
    const saved = [];
    let n = 0;
    for (const f of req.files || []) {
      if (!looksLikeImage(f)) continue;
      const one = await saveImage(f, forPost ? 'post' : 'gallery');
      const title = String(titles[n++] || '').trim();
      saved.push(title && !forPost ? uploads.setTitle(one.id, title) : one);
    }
    if (!saved.length) return res.status(400).json({ error: 'noimage', message: '이미지 파일이 없어' });
    if (!forPost) { gallery.sync(); slot.refreshImages(); }
    res.json({ ok: true, items: saved });
  } catch (e) {
    console.error('[upload]', e);
    res.status(500).json({ error: 'failed', message: '업로드 실패: ' + e.message });
  }
});

/* 재료 이미지 — 배경·아이콘·커서·스티커 등에 쓰는 것. 갤러리에는 안 들어간다.
   stage=1 이면, 스킨의 「갤러리에서 고르기」 창으로 한 번 고르는 동안만 목록에 끼워둔다. */
api.post('/assets', auth.requireOwner, upload.single('file'), async (req, res) => {
  try {
    if (!looksLikeImage(req.file)) {
      return res.status(400).json({ error: 'noimage', message: notImageMsg(req.file) });
    }
    const saved = await saveImage(req.file, 'asset');
    if (String(req.query.stage) === '1') { gallery.stage(saved.id); gallery.sync(); }
    slot.refreshImages();
    res.json({ ok: true, item: saved, path: saved.path });
  } catch (e) {
    console.error('[asset]', e);
    /* sharp 가 못 읽는 형식이면 여기로 온다 (예: 아이폰 HEIC 사진) */
    res.status(400).json({
      error: 'failed',
      message: '이 사진은 못 읽었어 — ' + (req.file && req.file.originalname || '') +
        '. jpg 나 png 로 바꿔서 올려줄래?'
    });
  }
});

/* 다 골랐으니 갤러리 목록에서 빼줘 */
api.post('/assets/done', auth.requireOwner, (req, res) => {
  gallery.unstage(); gallery.sync();
  res.json({ ok: true });
});

/* 갤러리 사진 제목 고치기 — 주소로 찾는다 (갤러리 창이 주소밖에 모르니까) */
/* 주인이 고른 바탕화면(슬롯) — 손님이 처음 들어왔을 때 보는 화면.
   스킨 안에도 「지금 이게 기본」 표시가 있지만, 그걸 고치려면 편집 모드를 거쳐야 해서
   갈아입을 때마다 화면이 다시 뜬다. 우리 쪽에 따로 적어두고 들어올 때 입혀준다. */
api.post('/board/slot', auth.requireOwner, (req, res) => {
  const name = String((req.body && req.body.name) || '').slice(0, 80);
  settings.set('board:slot', name);
  /* 스킨이 들어오자마자 이 화면을 입도록 게시글의 표시도 옮겨준다 —
     그래야 브라우저가 슬롯 창을 열었다 닫는 깜빡임이 없다 */
  let moved = false;
  try { moved = slot.setActive(name); } catch (e) {}
  res.json({ ok: true, name, moved });
});

api.post('/uploads/title', auth.requireOwner, (req, res) => {
  const p = String((req.body && req.body.path) || '');
  const u = uploads.byPath(p);
  if (!u) return res.status(404).json({ error: 'notfound', message: '목록에 없는 이미지야' });
  const one = uploads.setTitle(u.id, (req.body && req.body.title) || '');
  res.json({ ok: true, item: one });
});

/* 갤러리 창에서 주소만 알고 지울 때 */
api.post('/uploads/remove', auth.requireOwner, (req, res) => {
  const p = String((req.body && req.body.path) || '');
  const u = uploads.byPath(p);
  if (!u) return res.status(404).json({ error: 'notfound', message: '목록에 없는 이미지야' });
  const abs = path.join(cfg.uploadDir, u.path.replace(/^\/uploads\//, ''));
  try { fs.unlinkSync(abs); } catch (e) {}
  uploads.remove(u.id);
  gallery.sync(); slot.refreshImages();
  res.json({ ok: true });
});

api.delete('/uploads/:id', auth.requireOwner, (req, res) => {
  const u = uploads.get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'notfound' });
  const abs = path.join(cfg.uploadDir, u.path.replace(/^\/uploads\//, ''));
  try { fs.unlinkSync(abs); } catch (e) { /* 파일이 이미 없어도 목록에서는 지운다 */ }
  uploads.remove(u.id);
  gallery.sync(); slot.refreshImages();
  res.json({ ok: true });
});

/* 방명록 */
api.get('/guestbook', (req, res) => res.json(guestbook.list(200)));
api.post('/guestbook', (req, res) => {
  const name = req.isOwner ? site.ownerName() : req.guestName;
  if (!name) return res.status(401).json({ error: 'needguest', message: '닉네임을 정하고 들어와줘' });
  const body = String((req.body && req.body.body) || '').trim().slice(0, 500);
  if (!body) return res.status(400).json({ error: 'empty' });
  guestbook.add(name, body);
  res.json({ ok: true });
});
api.delete('/guestbook/:id', auth.requireOwner, (req, res) => {
  guestbook.remove(Number(req.params.id));
  res.json({ ok: true });
});

/* 스킨 옵션 */
api.get('/settings', auth.requireOwner, (req, res) => {
  const out = {};
  for (const k of Object.keys(render.SKIN_VARS)) out[k] = render.skinVar(k);
  res.json(out);
});
api.put('/settings', auth.requireOwner, (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k in render.SKIN_VARS) settings.set('skin:' + k, String(v));
  }
  res.json({ ok: true });
});

/* 슬롯(꾸미기 설정) — 스킨의 「게시글에 반영」이 복사할 때 다리가 자동으로 보낸다 */
api.get('/slot', auth.requireOwner, (req, res) => {
  slot.ensure();
  res.json({ text: slot.getText(), postUrl: render.skinVar('configPostUrl') });
});
api.put('/slot', auth.requireOwner, (req, res) => {
  const text = String((req.body && req.body.text) || '');
  if (!text.trim()) return res.status(400).json({ error: 'empty', message: '내용이 비었어' });
  const id = slot.setText(text);
  /* 저장하면서 스킨이 자기 기준으로 표시를 새로 적는다 — 주인이 고른 쪽으로 다시 맞춘다 */
  try {
    const pick = settings.get('board:slot', '');
    if (pick) slot.setActive(pick);
  } catch (e) {}
  res.json({ ok: true, id, bytes: text.length });
});

/* 소리 */
const soundUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

api.get('/sounds', auth.requireOwner, (req, res) => res.json(sounds.list()));

api.post('/sounds/:key', auth.requireOwner, soundUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'nofile', message: '파일이 없어' });
  if (!/^audio\//.test(req.file.mimetype)) {
    return res.status(400).json({ error: 'notaudio', message: '소리 파일이 아니야 (mp3, wav, m4a, ogg)' });
  }
  try {
    sounds.save(req.params.key, req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ ok: true, items: sounds.list() });
  } catch (e) {
    res.status(400).json({ error: 'failed', message: e.message });
  }
});

/* ── 위젯: 디데이 ─────────────────────────────────────────────────────── */
api.get('/dday', auth.requireOwner, (req, res) => {
  res.json({ items: widgets.ddayList(), category: widgets.ddayCategory() });
});
api.post('/dday', auth.requireOwner, (req, res) => {
  try {
    const id = widgets.ddaySave(req.body || {});
    res.json({ ok: true, id, items: widgets.ddayList() });
  } catch (e) { res.status(400).json({ error: 'bad', message: e.message }); }
});
api.delete('/dday/:id', auth.requireOwner, (req, res) => {
  try {
    widgets.ddayRemove(req.params.id);
    res.json({ ok: true, items: widgets.ddayList() });
  } catch (e) { res.status(400).json({ error: 'bad', message: e.message }); }
});

/* ── 위젯: 캘린더 ─────────────────────────────────────────────────────── */
api.get('/calendar', auth.requireOwner, (req, res) => {
  res.json({ items: widgets.calendarList() });
});
api.put('/calendar', auth.requireOwner, (req, res) => {
  const r = widgets.calendarSave((req.body && req.body.items) || []);
  res.json({ ok: true, ...r, items: widgets.calendarList() });
});

/* ── 위젯: 음악 ───────────────────────────────────────────────────────── */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(cfg.maxUploadMb, 30) * 1024 * 1024, files: 10 }
});
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)$/i;

api.get('/music', auth.requireOwner, (req, res) => res.json(widgets.musicGet()));

api.post('/music/tracks', auth.requireOwner, audioUpload.array('files', 10), (req, res) => {
  try {
    const dir = path.join(cfg.uploadDir, 'music');
    fs.mkdirSync(dir, { recursive: true });
    const cur = widgets.musicGet().tracks.slice();
    for (const f of req.files || []) {
      const orig = f.originalname || 'track.mp3';
      if (!AUDIO_EXT.test(orig)) continue;
      const ext = orig.match(AUDIO_EXT)[0].toLowerCase();
      const base = orig.replace(AUDIO_EXT, '').replace(/[^\w가-힣.-]+/g, '-').slice(0, 40) || 'track';
      const name = `${base}-${Math.random().toString(36).slice(2, 7)}${ext}`;
      fs.writeFileSync(path.join(dir, name), f.buffer);
      /* 스킨이 파일 이름에서 확장자를 보고 오디오인지 판단한다 */
      cur.push({ name: base + ext, path: '/uploads/music/' + name, bytes: f.buffer.length });
    }
    if (!cur.length) return res.status(400).json({ error: 'noaudio', message: '소리 파일이 없어 (mp3, m4a, wav, ogg, flac)' });
    widgets.musicSetTracks(cur);
    res.json({ ok: true, ...widgets.musicGet() });
  } catch (e) {
    console.error('[music]', e);
    res.status(500).json({ error: 'failed', message: '올리기 실패: ' + e.message });
  }
});

api.delete('/music/tracks/:idx', auth.requireOwner, (req, res) => {
  const list = widgets.musicGet().tracks.slice();
  const i = Number(req.params.idx);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) return res.status(404).json({ error: 'notfound' });
  const [gone] = list.splice(i, 1);
  try { fs.unlinkSync(path.join(cfg.uploadDir, gone.path.replace(/^\/uploads\//, ''))); } catch (e) {}
  widgets.musicSetTracks(list);
  res.json({ ok: true, ...widgets.musicGet() });
});

api.put('/music', auth.requireOwner, (req, res) => {
  const b = req.body || {};
  if (typeof b.youtube === 'string') widgets.musicSetYoutube(b.youtube);
  if (typeof b.cover === 'string') widgets.musicSetCover(b.cover);
  res.json({ ok: true, ...widgets.musicGet() });
});

/* 바탕화면 상태 — 「저장」을 누르면 지금 화면 설정이 통째로 여기 들어온다.
   다음 방문자의 화면에는 render.js 가 이 값을 미리 깔아준다. */
const DESKTOP_MAX = 512 * 1024;
api.put('/desktop', auth.requireOwner, (req, res) => {
  const b = req.body || {};
  const keys = (b.keys && typeof b.keys === 'object' && !Array.isArray(b.keys)) ? b.keys : {};
  const icons = (b.icons && typeof b.icons === 'object' && !Array.isArray(b.icons)) ? b.icons : {};

  const clean = {};
  for (const [k, v] of Object.entries(keys)) {
    if (typeof v !== 'string') continue;
    if (!/^[\w:.-]{1,64}$/.test(k)) continue;
    clean[k] = v;
  }
  const cleanIcons = {};
  for (const [k, v] of Object.entries(icons)) {
    if (!Array.isArray(v) || v.length !== 2) continue;
    const x = Number(v[0]), y = Number(v[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    cleanIcons[String(k).slice(0, 40)] = [Math.round(x), Math.round(y)];
  }

  /* 지금 화면 색 — 관리 화면이 같은 색을 쓰게 하려고 같이 받아둔다 */
  const theme = (b.theme && typeof b.theme === 'object' && !Array.isArray(b.theme)) ? b.theme : {};
  const cleanTheme = {};
  for (const [k, v] of Object.entries(theme)) {
    if (!/^--dds-[a-z0-9-]{1,40}$/.test(k)) continue;
    if (typeof v !== 'string' || v.length > 200) continue;
    if (!/^[#a-zA-Z0-9(),.%\s/-]+$/.test(v)) continue;   // 색·그라디언트 값만
    cleanTheme[k] = v.trim();
  }

  const payload = JSON.stringify({ keys: clean, icons: cleanIcons, theme: cleanTheme });
  if (payload.length > DESKTOP_MAX) {
    return res.status(413).json({ error: 'toobig', message: '설정이 너무 커서 저장 못 했어' });
  }
  settings.set('desktop:state', payload);
  res.json({ ok: true, bytes: payload.length });
});

/* 시메지 설정 — 이 브라우저뿐 아니라 손님 화면에도 같은 캐릭터가 뜨도록 서버에 둔다 */
const SHIMEJI_MAX = 3 * 1024 * 1024;   // 캐릭터 그림이 설정 안에 들어갈 수 있어 넉넉히
api.put('/shimeji', auth.requireOwner, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'bad', message: '설정 모양이 이상해' });
  }
  const payload = JSON.stringify(body);
  if (payload.length > SHIMEJI_MAX) {
    return res.status(413).json({ error: 'toobig', message: '설정이 너무 커 (캐릭터 그림을 줄여줘)' });
  }
  settings.set('shimeji:config', payload);
  res.json({ ok: true, bytes: payload.length });
});

api.delete('/shimeji', auth.requireOwner, (req, res) => {
  settings.set('shimeji:config', '');
  res.json({ ok: true });
});

/* 관리 화면이 블로그와 같은 색을 쓰기 위해 읽어간다 */
api.get('/theme', auth.requireOwner, (req, res) => {
  let theme = {};
  try {
    const raw = settings.get('desktop:state', '');
    if (raw) theme = JSON.parse(raw).theme || {};
  } catch (e) {}
  res.json(theme);
});

api.delete('/desktop', auth.requireOwner, (req, res) => {
  settings.set('desktop:state', '');
  res.json({ ok: true });
});

/* 바탕화면 이미지 — 갤러리를 거치지 않고 바로 올린다 (갤러리 위젯에는 안 보인다) */
api.post('/wallpaper', auth.requireOwner, upload.single('file'), async (req, res) => {
  if (!looksLikeImage(req.file)) {
    return res.status(400).json({ error: 'notimage', message: notImageMsg(req.file) });
  }
  try {
    const dir = path.join(cfg.uploadDir, 'wall');
    fs.mkdirSync(dir, { recursive: true });
    const name = 'wall-' + Date.now().toString(36) + '.webp';
    const out = await sharp(req.file.buffer, { animated: false })
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    fs.writeFileSync(path.join(dir, name), out);

    /* 최근 5장만 남기고 정리 */
    try {
      fs.readdirSync(dir)
        .filter(f => /^wall-.*\.webp$/.test(f))
        .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(5)
        .forEach(x => { try { fs.unlinkSync(path.join(dir, x.f)); } catch (e) {} });
    } catch (e) { /* 정리는 실패해도 상관없다 */ }

    const url = '/uploads/wall/' + name;
    settings.set('site:wallpaper', url);
    res.json({ ok: true, path: url, bytes: out.length });
  } catch (e) {
    console.error('[wallpaper]', e);
    res.status(500).json({ error: 'failed', message: '올리기 실패: ' + e.message });
  }
});

/* 올린 배경 지우기 — 방문자에게도 다시 기본 바탕화면으로 돌아간다 */
api.delete('/wallpaper', auth.requireOwner, (req, res) => {
  settings.set('site:wallpaper', '');
  res.json({ ok: true });
});

api.delete('/sounds/:key', auth.requireOwner, (req, res) => {
  sounds.remove(req.params.key);
  res.json({ ok: true, items: sounds.list() });
});

app.use('/api', api);

/* ── 관리 화면 ─────────────────────────────────────────────────────────── */
/* /manage, /manage/newpost, /manage/newpost/12 (스킨의 글쓰기·수정 버튼이 이 주소를 연다) */
app.get(/^\/manage(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

/* ── 블로그 페이지 (스킨이 읽는 HTML) ───────────────────────────────────── */
const pageOf = (req) => Math.max(1, Number(req.query.page) || 1);

function listView(req, { category = null, tag = null, q = null, bodyId, title }) {
  const page = pageOf(req);
  const { rows, hasNext, hasPrev } = posts.list({
    page, perPage: cfg.perPage, category, tag, q,
    includeSystem: !!category   // 갤러리 저장소 글은 자기 카테고리에서만 보인다
  });
  return { kind: 'list', rows, hasNext, hasPrev, bodyId, title };
}

app.get('/', (req, res) => {
  res.type('html').send(render.page(listView(req, { bodyId: 'tt-body-index' }), { owner: req.isOwner, guest: req.guestName }));
});

/* 공지 목록 — 스킨이 이 주소를 직접 읽는다 (프로필 아이콘 → 공지사항 창) */
app.get('/notice', (req, res) => {
  res.type('html').send(render.page({
    kind: 'notice', rows: posts.notices(),
    bodyId: 'tt-body-notice', title: '공지사항'
  }, { owner: req.isOwner, guest: req.guestName }));
});

app.get('/guestbook', (req, res) => {
  res.type('html').send(render.page({
    kind: 'guestbook', bodyId: 'tt-body-guestbook', title: '방명록',
    me: { owner: req.isOwner, guest: req.guestName }
  }, { owner: req.isOwner, guest: req.guestName }));
});

/* 검색 — 스킨의 검색창이 /search/{검색어}?page=N 을 읽는다 */
app.use('/search', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const q = decodeURIComponent(req.path.replace(/^\//, '')).trim();
  res.type('html').send(render.page(listView(req, {
    q: q || null, bodyId: 'tt-body-search', title: q ? '검색: ' + q : '검색'
  }), { owner: req.isOwner, guest: req.guestName }));
});

app.use('/tag', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const tag = decodeURIComponent(req.path.replace(/^\//, '')).trim();
  if (!tag) return res.type('html').send(render.page(listView(req, { bodyId: 'tt-body-tag', title: '태그' }), { owner: req.isOwner, guest: req.guestName }));
  res.type('html').send(render.page(listView(req, { tag, bodyId: 'tt-body-tag', title: '태그: ' + tag }), { owner: req.isOwner, guest: req.guestName }));
});

app.use('/category', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const cat = req.path.replace(/^\//, '').split('/').map(decodeURIComponent).filter(Boolean).join('/');
  res.type('html').send(render.page(listView(req, {
    category: cat || null, bodyId: 'tt-body-category', title: cat || '전체 글'
  }), { owner: req.isOwner, guest: req.guestName }));
});

app.get('/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const p = posts.get(Number(req.params.id));
  if (!p || p.visibility !== 'public') return next();
  res.type('html').send(render.page({
    kind: 'post', post: p, tags: posts.tagsOf(p.id),
    bodyId: 'tt-body-page', title: p.title, owner: req.isOwner
  }, { owner: req.isOwner, guest: req.guestName }));
});

app.use((req, res) => {
  res.status(404).type('html').send(render.page({
    kind: 'list', rows: [], hasNext: false, hasPrev: false,
    bodyId: 'tt-body-index', title: '없는 페이지'
  }, { owner: req.isOwner, guest: req.guestName }));
});

/* ── 시작 ──────────────────────────────────────────────────────────────── */
if (require.main === module) {
  banner();
  gallery.sync();
  slot.ensure();
  app.listen(cfg.port, () => {
    console.log(`블로그: http://localhost:${cfg.port}`);
    console.log(`관리:   http://localhost:${cfg.port}/manage`);
    if (!auth.ownerExists()) console.log('→ 아직 계정이 없어. /manage 에서 첫 계정을 만들면 돼.');
  });
}

module.exports = app;
