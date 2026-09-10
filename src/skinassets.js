'use strict';
/* ==========================================================================
   스킨이 바깥 CDN 에서 받아오던 것들을 우리 서버 것으로 바꿔치기

   티스토리에서는 스킨이 파일을 못 올려서 폰트도 아이콘도 CDN 말고는 방법이 없었다.
   우리는 우리가 서버라 그냥 우리가 내주면 된다. 그러면
   - 방문자 IP 가 제3자(jsdelivr, code.jquery.com, api.iconify.design)에 안 남고
   - CDN 이 막히거나 죽어도 글씨체·아이콘이 그대로 나오고
   - 요청이 세 군데로 흩어지지 않는다.

   중요: 스킨 원본 파일(script.js, style.css)은 손대지 않는다.
   디스크의 파일은 받은 그대로 두고, 내보낼 때만 메모리에서 주소를 바꾼다.
   그래야 나중에 스킨 업데이트를 받아도 덮어쓰기만 하면 된다.
   바꿀 문자열을 못 찾으면(스킨이 바뀌었으면) 원본을 그대로 내보내고 알려준다.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { cfg } = require('./config');

const VENDOR = path.join(cfg.skinDir, 'images', 'vendor');

/* ── 스킨에 창구 하나 내기 ──────────────────────────────────────────────
   스킨은 꾸미기를 저장할 때 「슬롯 창 열기 → 편집 모드 → 저장 → 새로고침」을
   사람이 손으로 밟게 돼 있다. 프로그램이 부를 수 있는 창구가 없어서, 우리는
   그 여섯 단계를 대신 클릭해주고 있었다 (느리고, 창이 깜빡이고, 잘 깨졌다).

   그런데 필요한 함수는 스킨 안에 전부 있다. 밖으로 안 나와 있을 뿐이다.
   그래서 모듈 맨 끝에 한 줄을 덧붙여 네 개만 꺼낸다:

     pw  지금 화면을 통째로 찍는다 (스티커·위젯·배경·커서·투두… 전부)
     Ip  슬롯 글을 슬롯 목록으로 푼다
     Qp  슬롯 목록을 다시 슬롯 글로 만든다
     vw  「지금이 저장된 상태」라고 스킨에 알린다
     Lp  슬롯 글에서 「지금 입고 있는 화면」 이름을 읽는다

   스킨이 자기 함수로 만들어내니 결과는 손으로 저장한 것과 완전히 같다.
   원본 파일은 안 건드린다 — 내보낼 때만 붙인다.
   덧붙이는 자리를 못 찾으면(스킨이 바뀌면) 그냥 안 붙이고, 예전 방식으로 돌아간다. */
const HOOK = '\n;try{window.__ddsSlot={' +
  'snapshot:function(){return pw?pw():null},' +
  'parse:function(t){return Ip(t)},' +
  'build:function(s,a){return Qp(s,a)},' +
  'seen:function(){try{vw()}catch(e){}},' +
  'active:function(t){try{return Lp(t)}catch(e){return null}}' +
  '};}catch(e){}\n';

/* 위 이름들이 정말 그 뜻인지 확인하는 표식 — 하나라도 안 맞으면 창구를 안 낸다 */
const HOOK_MARKS = [
  'function yw(e){pw=e',                 // pw = 화면 찍는 함수
  'function Ip(e)',                      // 슬롯 글 → 목록
  'async function Qp(e,t)',              // 목록 → 슬롯 글
  'function vw(){if(pw)',                // 저장된 상태로 표시
  'function Lp(e)'                       // 지금 입고 있는 화면 이름
];

/* 바깥 주소 → 우리 주소 */
const SWAPS = [
  ['https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/Galmuri11-Condensed.woff2',
   '/skin/images/vendor/Galmuri11-Condensed.woff2'],
  ['https://api.iconify.design/pixelarticons/',
   '/skin/images/icons/pixelarticons/']
];

function swap(text, label) {
  let out = String(text);
  for (const [from, to] of SWAPS) {
    if (out.indexOf(from) === -1) continue;
    out = out.split(from).join(to);
  }
  return out;
}

/* ── 스킨 파일을 고쳐서 내보내기 ────────────────────────────────────────── */

const memo = new Map();
function patched(rel) {
  if (memo.has(rel) && !process.env.DEV_RELOAD_SKIN) return memo.get(rel);
  const abs = path.join(cfg.skinDir, rel);
  let body = '';
  try { body = fs.readFileSync(abs, 'utf8'); } catch (e) { return null; }
  let out = swap(body, rel);
  let hooked = false;
  if (rel === 'images/script.js' && !process.env.DDS_NO_HOOK && HOOK_MARKS.every(m => body.indexOf(m) !== -1)) {
    out += HOOK;
    hooked = true;
  }
  const v = { body: out, changed: out !== body, hooked };
  memo.set(rel, v);
  return v;
}

/* 창구를 냈나 — 못 냈으면 편집 도구가 예전 방식으로 저장한다 */
function hasHook() {
  const v = patched('images/script.js');
  return !!(v && v.hooked);
}

/* 어떤 파일에서 무엇을 못 찾았는지 시작할 때 한 번 알려준다 */
function check() {
  for (const rel of ['style.css', 'images/script.js']) {
    const abs = path.join(cfg.skinDir, rel);
    let body = '';
    try { body = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
    for (const [from] of SWAPS) {
      if (body.indexOf(from) !== -1) return;                    // 하나라도 있으면 정상
    }
  }
  console.log('알림: 스킨에서 바꿀 CDN 주소를 못 찾았어. 원본 그대로 내보낼게.');
}

/* 시작할 때 한 번 — 꾸미기 저장 창구가 열렸는지 알려준다 */
function checkHook() {
  if (hasHook()) return;
  console.log('알림: 스킨에 꾸미기 저장 창구를 못 냈어. 예전 방식(편집 모드를 대신 눌러주기)으로 저장할게.');
}

/* ── 아이콘 ─────────────────────────────────────────────────────────────── */
/* api.iconify.design 이 내주던 것과 같은 SVG 를 우리가 만들어 낸다.
   자료(pixelarticons.json)는 iconify 가 npm 에 공개한 그 데이터 그대로라 모양이 같다.
   스킨은 이 그림을 CSS mask 로 쓰기 때문에 색은 아무 의미가 없다 (?color= 는 무시해도 된다). */
let SET = null;
function iconSet() {
  if (SET) return SET;
  try { SET = JSON.parse(fs.readFileSync(path.join(VENDOR, 'pixelarticons.json'), 'utf8')); }
  catch (e) { SET = { icons: {}, aliases: {}, width: 24, height: 24 }; }
  return SET;
}

const svgMemo = new Map();
function iconSvg(name) {
  if (!/^[a-z0-9-]{1,60}$/.test(name)) return null;
  if (svgMemo.has(name)) return svgMemo.get(name);
  const set = iconSet();
  let it = set.icons[name];
  if (!it && set.aliases && set.aliases[name]) {
    const a = set.aliases[name];
    it = set.icons[a.parent];
  }
  if (!it || !it.body) { svgMemo.set(name, null); return null; }
  const w = it.width || set.width || 24;
  const h = it.height || set.height || 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">${it.body}</svg>`;
  svgMemo.set(name, svg);
  return svg;
}

/* ── express 에 붙이기 ──────────────────────────────────────────────────── */
function mount(app) {
  app.get('/skin/images/icons/pixelarticons/:name.svg', (req, res) => {
    const svg = iconSvg(String(req.params.name || '').toLowerCase());
    if (!svg) return res.status(404).end();          // 스킨이 알아서 기본 아이콘으로 바꾼다
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.send(svg);
  });

  app.get('/skin/style.css', (req, res, next) => {
    const v = patched('style.css');
    if (!v) return next();
    res.type('text/css');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(v.body);
  });

  app.get('/skin/images/script.js', (req, res, next) => {
    const v = patched('images/script.js');
    if (!v) return next();
    res.type('application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(v.body);
  });
}

module.exports = { mount, swap, iconSvg, check, checkHook, hasHook, SWAPS };
