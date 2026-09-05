'use strict';
/* ==========================================================================
   갤러리 = "갤러리에 올린 이미지"만
   배경화면·아이콘·커서·스티커 같은 데 쓰는 재료 이미지는 여기 안 들어온다
   (uploads.purpose = 'asset').

   스킨의 갤러리 위젯은 갤러리 카테고리 글 본문의 이미지를 긁어가므로,
   업로드 목록을 그 글 하나로 계속 동기화해준다. 이 글은 목록에 안 나온다.

   딱 하나 예외: 스킨의 「갤러리에서 고르기」 창을 통해서만 이미지를 지정할 수 있는
   자리가 있어서, 거기에 쓸 재료 하나를 고르는 동안만 잠깐 목록에 끼워준다.
   고르고 나면 바로 빠진다 (stage / unstage).
   ========================================================================== */
const { posts, uploads, settings } = require('./db');
const { cfg } = require('./config');

const TITLE = '갤러리 저장소';
const STAGE_KEY = 'gallery:staged';

function stagedId() {
  const v = settings.get(STAGE_KEY, '');
  return v ? Number(v) : 0;
}
function stage(id) { settings.set(STAGE_KEY, String(id || '')); }
function unstage() { settings.set(STAGE_KEY, ''); }

function visible() {
  const list = uploads.list('gallery');
  const sid = stagedId();
  if (sid) {
    const one = uploads.get(sid);
    if (one && one.purpose === 'asset') list.unshift(one);   // 고르는 동안만 맨 앞에
  }
  return list;
}

function sync() {
  const list = visible();
  const body = list.length
    ? list.map(u =>
        `<img src="${u.path}" alt="${String(u.orig_name).replace(/"/g, '&quot;')}" ` +
        `width="${u.w || ''}" height="${u.h || ''}" loading="lazy">`).join('\n')
    : '';
  const html = `<div class="gallery-store">${body}</div>`;
  const cur = posts.bySystem('gallery');
  if (cur) {
    posts.update(cur.id, {
      title: TITLE, category: cfg.galleryCategory,
      body_md: '', body_html: html, thumb: list[0] ? list[0].path : null
    });
    return cur.id;
  }
  return posts.create({
    title: TITLE, category: cfg.galleryCategory,
    body_md: '', body_html: html, thumb: list[0] ? list[0].path : null,
    system_kind: 'gallery'
  });
}

module.exports = { sync, stage, unstage, stagedId, TITLE };
