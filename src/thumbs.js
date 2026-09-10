'use strict';
/* ==========================================================================
   사진 줄여서 내보내기

   티스토리에서는 다음 CDN 이 이걸 대신 해줬다. 스킨에도 그 코드가 남아 있는데
     img1.daumcdn.net/thumb/R{가로}x0/?fname={원본주소}
   카카오·다음·티스토리 주소일 때만 동작하게 돼 있어서 우리 사진은 해당이 없다.
   그래서 지금은 2000px 원본이 160px 칸에 그대로 들어간다.

   여기서 그 일을 우리가 한다. /uploads/… 뒤에 ?w=400 을 붙이면 그 크기로 줄여서
   내보내고, 만든 건 디스크에 남겨서 두 번째부터는 그냥 파일을 보낸다.

   크기는 정해둔 몇 가지만 받는다. 아무 숫자나 받으면 주소를 조금씩 바꿔가며
   호출하는 것만으로 디스크를 채울 수 있다.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { cfg } = require('./config');

const SIZES = [200, 400, 800, 1200];
const CACHE = path.join(cfg.dataDir, 'thumbs');

/* 몇 픽셀로 만들지 — 요청한 값보다 크거나 같은 것 중 제일 작은 것 */
function pick(w) {
  const n = Number(w);
  if (!Number.isFinite(n) || n <= 0) return 0;
  for (const s of SIZES) if (n <= s) return s;
  return 0;                                   // 원본보다 크게 달라면 원본을 준다
}

/* 주소를 안전한 상대 경로로 (…/.. 같은 건 못 들어온다) */
function safeRel(p) {
  const rel = path.normalize(String(p || '')).replace(/^([/\\])+/, '');
  if (!rel || rel.split(path.sep).includes('..')) return null;
  return rel;
}

async function make(rel, size) {
  const src = path.join(cfg.uploadDir, rel);
  if (!fs.existsSync(src)) return null;
  const out = path.join(CACHE, String(size), rel + '.webp');

  try {
    const s = fs.statSync(src);
    const c = fs.statSync(out);
    /* 원본이 나중에 바뀌었으면 다시 만든다 */
    if (c.mtimeMs >= s.mtimeMs) return out;
  } catch (e) { /* 아직 없음 */ }

  const meta = await sharp(src).metadata().catch(() => null);
  if (!meta) return null;
  /* 이미 작으면 줄일 게 없다 — 원본을 그대로 쓰라고 알려준다 */
  if ((meta.width || 0) <= size) return false;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.' + process.pid + '.tmp';
  await sharp(src).resize({ width: size, withoutEnlargement: true })
    .webp({ quality: 78 }).toFile(tmp);
  fs.renameSync(tmp, out);                    // 반쯤 쓴 파일이 남지 않게
  return out;
}

/* /uploads 정적 배달보다 먼저 붙인다 */
function mount(app) {
  app.get(/^\/uploads\/(.+)$/, (req, res, next) => {
    const size = pick(req.query.w);
    if (!size) return next();                 // ?w= 가 없거나 이상하면 원본
    const rel = safeRel(req.params[0]);
    if (!rel) return next();

    make(rel, size).then(file => {
      if (file === false || !file) return next();   // 줄일 필요 없음 / 못 만듦 → 원본
      res.type('image/webp');
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      res.sendFile(file, err => { if (err) next(); });
    }).catch(() => next());
  });
}

/* 사진을 지울 때 줄여둔 것도 같이 치운다 */
function drop(relPath) {
  const rel = safeRel(String(relPath || '').replace(/^\/uploads\//, ''));
  if (!rel) return;
  for (const s of SIZES) {
    try { fs.unlinkSync(path.join(CACHE, String(s), rel + '.webp')); } catch (e) {}
  }
}

/* 목록의 작은 사진용 주소 */
function small(url, w) {
  const u = String(url || '');
  if (!u || u.indexOf('/uploads/') !== 0) return u;
  if (u.indexOf('?') !== -1) return u;
  return u + '?w=' + (pick(w) || SIZES[1]);
}

module.exports = { mount, drop, small, SIZES };
