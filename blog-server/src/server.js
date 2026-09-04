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
app.use('/skin', express.static(cfg.skinDir, { maxAge: '1h' }));
app.use('/uploads', express.static(cfg.uploadDir, { maxAge: '30d', immutable: true }));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/bridge', express.static(path.join(__dirname, '..', 'public', 'bridge')));

/* ── 업로드 ────────────────────────────────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.maxUploadMb * 1024 * 1024, files: 20 }
});

async function saveImage(file) {
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
    mime: 'image/webp'
  });
}

/* ── API ───────────────────────────────────────────────────────────────── */
const api = express.Router();

api.get('/me', (req, res) => {
  res.json({
    owner: req.isOwner,
    guest: req.guestName,
    needsSetup: !auth.ownerExists(),
    blogTitle: cfg.blogTitle
  });
});

api.post('/setup', async (req, res) => {
  if (auth.ownerExists()) return res.status(409).json({ error: 'exists', message: '이미 계정이 있어' });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'bad', message: '아이디와 8자 이상 비밀번호가 필요해' });
  }
  const id = await auth.createOwner(username.trim(), password);
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

api.delete('/posts/:id', auth.requireOwner, (req, res) => {
  const p = posts.get(Number(req.params.id));
  if (p && p.system_kind) return res.status(400).json({ error: 'system' });
  posts.remove(Number(req.params.id));
  res.json({ ok: true });
});

/* 업로드 */
api.get('/uploads', auth.requireOwner, (req, res) => {
  res.json({ items: uploads.list(), totalBytes: uploads.totalBytes() });
});

api.post('/uploads', auth.requireOwner, upload.array('files', 20), async (req, res) => {
  try {
    const saved = [];
    for (const f of req.files || []) {
      if (!/^image\//.test(f.mimetype)) continue;
      saved.push(await saveImage(f));
    }
    if (!saved.length) return res.status(400).json({ error: 'noimage', message: '이미지 파일이 없어' });
    gallery.sync(); slot.refreshImages();
    res.json({ ok: true, items: saved });
  } catch (e) {
    console.error('[upload]', e);
    res.status(500).json({ error: 'failed', message: '업로드 실패: ' + e.message });
  }
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
  const name = req.isOwner ? '주인' : req.guestName;
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

api.delete('/sounds/:key', auth.requireOwner, (req, res) => {
  sounds.remove(req.params.key);
  res.json({ ok: true, items: sounds.list() });
});

app.use('/api', api);

/* ── 관리 화면 ─────────────────────────────────────────────────────────── */
app.get(['/manage', '/manage/newpost'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

/* ── 블로그 페이지 (스킨이 읽는 HTML) ───────────────────────────────────── */
const pageOf = (req) => Math.max(1, Number(req.query.page) || 1);

function listView(req, { category = null, tag = null, bodyId, title }) {
  const page = pageOf(req);
  const { rows, hasNext, hasPrev } = posts.list({
    page, perPage: cfg.perPage, category, tag,
    includeSystem: !!category   // 갤러리 저장소 글은 자기 카테고리에서만 보인다
  });
  return { kind: 'list', rows, hasNext, hasPrev, bodyId, title };
}

app.get('/', (req, res) => {
  res.type('html').send(render.page(listView(req, { bodyId: 'tt-body-index' }), { owner: req.isOwner }));
});

app.get('/guestbook', (req, res) => {
  res.type('html').send(render.page({ kind: 'guestbook', bodyId: 'tt-body-guestbook', title: '방명록' }, { owner: req.isOwner }));
});

app.use('/tag', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const tag = decodeURIComponent(req.path.replace(/^\//, '')).trim();
  if (!tag) return res.type('html').send(render.page(listView(req, { bodyId: 'tt-body-tag', title: '태그' }), { owner: req.isOwner }));
  res.type('html').send(render.page(listView(req, { tag, bodyId: 'tt-body-tag', title: '태그: ' + tag }), { owner: req.isOwner }));
});

app.use('/category', (req, res, next) => {
  if (req.method !== 'GET') return next();
  const cat = req.path.replace(/^\//, '').split('/').map(decodeURIComponent).filter(Boolean).join('/');
  res.type('html').send(render.page(listView(req, {
    category: cat || null, bodyId: 'tt-body-category', title: cat || '전체 글'
  }), { owner: req.isOwner }));
});

app.get('/:id', (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const p = posts.get(Number(req.params.id));
  if (!p || p.visibility !== 'public') return next();
  res.type('html').send(render.page({
    kind: 'post', post: p, tags: posts.tagsOf(p.id),
    bodyId: 'tt-body-page', title: p.title
  }, { owner: req.isOwner }));
});

app.use((req, res) => {
  res.status(404).type('html').send(render.page({
    kind: 'list', rows: [], hasNext: false, hasPrev: false,
    bodyId: 'tt-body-index', title: '없는 페이지'
  }, { owner: req.isOwner }));
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
