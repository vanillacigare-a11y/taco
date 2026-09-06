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

/* 「지금 이게 기본 화면」 표시를 옮긴다.
   스킨은 슬롯 덩어리 바로 뒤에 붙은 [DDS-ACTIVE] 한 줄을 보고 어느 화면을 입힐지 정한다.
   주인이 고른 이름 뒤로 그 줄을 옮겨주면, 들어오자마자 맞는 화면이 뜬다.
   (이걸 안 하면 브라우저가 슬롯 창을 몰래 열어서 카드를 눌러야 해서 화면이 깜빡인다) */
function withActive(text, name) {
  const raw = String(text || '');
  if (!raw.trim()) return raw;
  const body = raw.replace(/\n?\[DDS-ACTIVE\]/g, '');      // 있던 표시는 걷어낸다
  if (!name) return body;

  /* 슬롯 덩어리들을 이름과 함께 끊어 읽는다 */
  const re = /\[([^\[\]\n]+)\]\s*\n\[DDS-SLOT:[^\]\n]+\][\s\S]*?\[\/DDS-SLOT\]/g;
  let m, hit = null;
  while ((m = re.exec(body))) {
    if (m[1].trim() === String(name).trim()) { hit = m; break; }
  }
  if (!hit) return body;                                   // 그런 이름이 없으면 그대로
  const at = hit.index + hit[0].length;
  return body.slice(0, at) + '\n[DDS-ACTIVE]' + body.slice(at);
}

/* 주인이 고른 화면을 게시글에도 반영한다 */
function setActive(name) {
  const p = posts.bySystem('slot');
  if (!p) return false;
  const cur = getText();
  if (!cur.trim()) return false;
  const next = withActive(cur, name);
  if (next === cur) return true;
  posts.update(p.id, { title: TITLE, category: '', body_md: '', body_html: bodyHtml(next), thumb: null });
  return true;
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

module.exports = { ensure, getText, setText, setActive, refreshImages, TITLE };
