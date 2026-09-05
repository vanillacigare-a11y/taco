'use strict';
/* ==========================================================================
   갤러리 = 업로드한 이미지들
   스킨의 갤러리 위젯은 "갤러리 카테고리의 글 본문에 들어있는 이미지"를 긁어간다.
   그래서 업로드 목록을 그 카테고리의 글 하나로 계속 동기화해준다.
   → 스킨 코드는 한 줄도 안 고치고, 너는 글을 쓸 필요가 없어진다.
   이 글은 system_kind='gallery' 라서 일반 글 목록에는 안 나온다.
   ========================================================================== */
const { posts, uploads } = require('./db');
const { cfg } = require('./config');

const TITLE = '갤러리 저장소';

function sync() {
  const list = uploads.list();
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
  const id = posts.create({
    title: TITLE, category: cfg.galleryCategory,
    body_md: '', body_html: html, thumb: list[0] ? list[0].path : null,
    system_kind: 'gallery'
  });
  return id;
}

module.exports = { sync, TITLE };
