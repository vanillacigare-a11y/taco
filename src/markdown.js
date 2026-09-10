'use strict';
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({
  html: false,        // 본문에 날 HTML 은 허용하지 않는다 (붙여넣기 오염·스크립트 차단)
  linkify: true,
  breaks: true,       // 줄바꿈을 <br> 로 — 블로그 글에는 이게 자연스러움
  typographer: false
});

/* 이미지에 lazy 로딩을 붙인다 */
const defaultImage = md.renderer.rules.image ||
  function (tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
md.renderer.rules.image = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

/* 외부 링크는 새 창 */
const defaultLink = md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) { return self.renderToken(tokens, idx, options); };
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const href = tokens[idx].attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener');
  }
  return defaultLink(tokens, idx, options, env, self);
};

function render(src) { return md.render(src || ''); }

/* 본문 첫 이미지를 대표 썸네일로 */
function firstImage(mdSrc) {
  const m = String(mdSrc || '').match(/!\[[^\]]*\]\(([^)\s]+)/);
  return m ? m[1] : null;
}

/* 본문에서 참조 중인 업로드 경로들 (안 쓰는 파일 정리용) */
function referencedUploads(mdSrc) {
  const out = new Set();
  const re = /\((\/uploads\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(String(mdSrc || '')))) out.add(m[1]);
  return out;
}

function excerpt(mdSrc, n = 140) {
  return String(mdSrc || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim().slice(0, n);
}

module.exports = { render, firstImage, referencedUploads, excerpt };
