'use strict';
/* ==========================================================================
   슬롯(꾸미기 설정) 저장
   스킨은 configPostUrl 이 가리키는 글의 #tistory-data .t-body 를 읽어서
   - textContent  → 슬롯 설정 텍스트 ([DDS-ACTIVE] 표식 등)
   - <img> 목록   → 배경화면·스티커가 참조하는 이미지들
   두 가지를 가져간다. 그래서 그 글을 우리가 만들어 두고 API 로 갱신한다.
   티스토리에서는 이 글을 손으로 수정해야 했는데, 여기서는 자동으로 저장된다.
   ========================================================================== */
const { posts, uploads, settings } = require('./db');

const TITLE = '슬롯 저장소';

function ensure() {
  let p = posts.bySystem('slot');
  if (!p) {
    const id = posts.create({
      title: TITLE, category: '', body_md: '', body_html: bodyHtml(''),
      system_kind: 'slot'
    });
    p = posts.get(id);
  }
  settings.set('skin:configPostUrl', '/' + p.id);
  return p;
}

/* 설정 텍스트 + 갤러리 이미지 전부를 한 본문에 담는다.
   (스킨이 레이아웃에서 참조하는 이미지를 이 목록에서 찾기 때문) */
function bodyHtml(text) {
  const imgs = uploads.list().map(u =>
    `<img src="${u.path}" alt="${String(u.orig_name).replace(/"/g, '&quot;')}" loading="lazy">`).join('\n');
  const safe = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="slot-store"><pre class="slot-config">${safe}</pre>\n${imgs}</div>`;
}

function getText() {
  const p = posts.bySystem('slot');
  if (!p) return '';
  const m = String(p.body_html).match(/<pre class="slot-config">([\s\S]*?)<\/pre>/);
  if (!m) return '';
  return m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function setText(text) {
  const p = ensure();
  posts.update(p.id, { title: TITLE, category: '', body_md: '', body_html: bodyHtml(text), thumb: null });
  return p.id;
}

/* 업로드가 바뀌면 이미지 목록도 다시 넣어준다 */
function refreshImages() {
  const p = posts.bySystem('slot');
  if (!p) return;
  setText(getText());
}

module.exports = { ensure, getText, setText, refreshImages, TITLE };
