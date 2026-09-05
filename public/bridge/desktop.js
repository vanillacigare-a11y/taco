/* ==========================================================================
   바탕화면 편집 도구
   - 모두에게: 저장해둔 아이콘 위치를 화면에 적용한다
   - 주인에게만: 저장 버튼, 아이콘 끌어 옮기기, 이미지 직접 올리기

   스킨은 설정을 sessionStorage(dds:…)에 넣고, 바뀔 때마다
   document 에 'dds:session-change' 를 쏜다. 그 신호로 "저장 안 한 변경"을
   판단하고, 저장을 누르면 그 값들을 통째로 서버에 보관한다.
   서버에 보관된 값은 다음 방문자의 화면에 미리 깔린다 (render.js).
   스킨 파일은 한 줄도 고치지 않는다.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__ddsDesktop) return;
  window.__ddsDesktop = true;

  var P = 'dds:';
  var GAP = 8;                 // 아이콘 격자 간격
  var DRAG_SLOP = 4;           // 이만큼 움직여야 "끌기"로 본다

  /* 저장하지 않는 값들 — 캐시거나 잠깐 쓰는 것들 */
  function skip(k) {
    return k === 'booted' ||
      k.indexOf('gallery:') === 0 ||
      k.indexOf('lastGlobal') === 0 ||
      k === 'wallpaperResolveCache';
  }

  function isOwner() {
    try {
      var r = window.tiara && window.tiara.customProps && window.tiara.customProps.role;
      return typeof r === 'string' && /^(owner|manager|editor)$/i.test(r);
    } catch (e) { return false; }
  }

  /* ── 알림 (스킨 토스트를 못 부르니 같은 자리에 같은 모양으로) ─────────── */
  function note(msg) {
    var el = document.createElement('div');
    el.className = 'dds-mine-note';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /* ── 파일 고르기 ──────────────────────────────────────────────────────── */
  var fileIn = null;
  function pickFile(onPick, multiple) {
    if (!fileIn) {
      fileIn = document.createElement('input');
      fileIn.type = 'file';
      fileIn.accept = 'image/*';
      fileIn.style.display = 'none';
      document.body.appendChild(fileIn);
    }
    fileIn.multiple = !!multiple;
    fileIn.onchange = function () {
      var fs = Array.prototype.slice.call(fileIn.files || []);
      fileIn.value = '';
      if (fs.length) onPick(multiple ? fs : fs[0]);
    };
    fileIn.click();
  }

  function post(url, form) {
    return fetch(url, { method: 'POST', body: form, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); });
  }

  /* ── 아이콘 위치 ─────────────────────────────────────────────────────── */
  var pos = {};
  try { pos = window.DDS_ICON_POS && typeof window.DDS_ICON_POS === 'object' ? window.DDS_ICON_POS : {}; } catch (e) { pos = {}; }

  function iconHost() { return document.getElementById('desktop-icons'); }
  function iconKey(el) {
    var l = el.querySelector('.desktop-icon-label');
    var t = l ? (l.textContent || '').trim() : '';
    return t || null;
  }
  function hasPos() { for (var k in pos) if (pos.hasOwnProperty(k)) return true; return false; }

  function applyPositions() {
    var host = iconHost();
    if (!host) return;
    var free = hasPos();
    host.classList.toggle('dds-icons-free', free);
    if (!free) {
      var all = host.querySelectorAll('.desktop-icon');
      for (var j = 0; j < all.length; j++) { all[j].style.left = ''; all[j].style.top = ''; }
      return;
    }
    var hb = host.getBoundingClientRect();
    var list = host.querySelectorAll('.desktop-icon');
    for (var i = 0; i < list.length; i++) {
      var el = list[i], k = iconKey(el), p = k && pos[k];
      var im = el.querySelectorAll('img');
      for (var m = 0; m < im.length; m++) im[m].draggable = false;
      var x = p ? p[0] : 12 + i * 4;
      var y = p ? p[1] : 16 + i * 4;
      /* 좁은 화면에서 아이콘이 밖으로 나가지 않게 (폰에서 보는 경우) */
      var b = el.getBoundingClientRect();
      var w = b.width || 88, h = b.height || 96;
      if (hb.width) x = Math.max(0, Math.min(x, hb.width - w));
      if (hb.height) y = Math.max(0, Math.min(y, hb.height - h));
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
    }
  }

  /* 처음 끌기 시작할 때, 지금 눈에 보이는 자리를 그대로 위치값으로 굳힌다 */
  function freezeCurrent() {
    var host = iconHost();
    if (!host || hasPos()) return;
    var hb = host.getBoundingClientRect();
    var list = host.querySelectorAll('.desktop-icon');
    for (var i = 0; i < list.length; i++) {
      var k = iconKey(list[i]);
      if (!k) continue;
      var b = list[i].getBoundingClientRect();
      pos[k] = [Math.round(b.left - hb.left), Math.round(b.top - hb.top)];
    }
  }

  function gridStep(el) {
    var b = el.getBoundingClientRect();
    return [Math.round(b.width) + GAP, Math.round(b.height) + GAP];
  }

  function initIcons(tries) {
    var host = iconHost();
    if (!host) {
      if ((tries || 0) > 40) return;
      setTimeout(function () { initIcons((tries || 0) + 1); }, 250);
      return;
    }
    applyPositions();
    /* 스킨이 아이콘을 다시 그리면 위치도 다시 입힌다 */
    new MutationObserver(function () { applyPositions(); })
      .observe(host, { childList: true });
  }

  /* ====================================================================== */
  /*  여기서부터 주인 전용                                                     */
  /* ====================================================================== */
  function initOwner() {
    injectStyle();
    initDrag();
    initSaveButton();
    watchWindows();
    guardLeave();
  }

  /* ── 저장 상태 ───────────────────────────────────────────────────────── */
  var DIRTY_KEY = 'bridge:dirty';     // 새로고침을 건너뛰어도 "저장 안 함"이 남아야 한다
  var dirty = false;
  var btns = [];            // 저장 버튼들 (작업표시줄 + 설정 창)
  var undoBtn = null;

  try { dirty = sessionStorage.getItem(DIRTY_KEY) === '1'; } catch (e) {}

  function markDirty() {
    try { sessionStorage.setItem(DIRTY_KEY, '1'); } catch (e) {}
    if (dirty) return;
    dirty = true;
    paint();
  }
  function paint() {
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.classList.toggle('is-dirty', dirty);
      b.disabled = !dirty;
      b.title = dirty ? '바뀐 걸 저장해 (손님 화면에도 반영돼)' : '저장할 변경이 없어';
      var label = b.querySelector('.dds-save-label');
      if (label) label.textContent = dirty ? '저장 •' : '저장';
    }
    if (undoBtn) undoBtn.hidden = !dirty;
  }

  document.addEventListener('dds:session-change', function (e) {
    var k = e && e.detail && e.detail.key;
    if (typeof k === 'string' && skip(k)) return;
    markDirty();
  });

  function snapshot() {
    var keys = {};
    try {
      for (var i = 0; i < sessionStorage.length; i++) {
        var full = sessionStorage.key(i);
        if (!full || full.indexOf(P) !== 0) continue;
        var k = full.slice(P.length);
        if (skip(k)) continue;
        keys[k] = sessionStorage.getItem(full);
      }
    } catch (e) {}
    return { keys: keys, icons: pos, theme: themeTokens() };
  }

  /* 관리 화면이 같은 색을 쓰도록, 지금 화면에 실제로 적용된 색을 그대로 담아 보낸다 */
  var THEME_KEYS = [
    '--dds-face', '--dds-face-dark', '--dds-face-light', '--dds-face-shadow',
    '--dds-win-bg', '--dds-win-fg', '--dds-win-border',
    '--dds-accent', '--dds-accent-dark', '--dds-accent-light',
    '--dds-win-titlebar-active-top', '--dds-win-titlebar-bottom',
    '--dds-desktop-bg-top', '--dds-desktop-bg-bottom', '--dds-icon-fg'
  ];
  function themeTokens() {
    var out = {};
    try {
      var cs = getComputedStyle(document.documentElement);
      for (var i = 0; i < THEME_KEYS.length; i++) {
        var v = (cs.getPropertyValue(THEME_KEYS[i]) || '').trim();
        if (v) out[THEME_KEYS[i]] = v.slice(0, 200);
      }
    } catch (e) {}
    return out;
  }

  function save() {
    if (!dirty) return;
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    fetch('/api/desktop', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot()),
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
      .then(function () {
        dirty = false;
        try { sessionStorage.removeItem(DIRTY_KEY); } catch (e) {}
        paint();
        note('저장했어. 이제 손님 화면에도 이렇게 보여');
      })
      .catch(function (e) { paint(); note('저장 실패 — ' + e.message); });
  }

  function undo() {
    if (!dirty) return;
    if (!confirm('저장한 마지막 상태로 되돌릴까? 지금 바꾼 건 사라져.')) return;
    try {
      var del = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(P) === 0) del.push(k);
      }
      for (var j = 0; j < del.length; j++) sessionStorage.removeItem(del[j]);
      sessionStorage.removeItem(DIRTY_KEY);
    } catch (e) {}
    dirty = false;
    location.reload();
  }

  function guardLeave() {
    window.addEventListener('beforeunload', function (e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
  }

  /* ── 작업표시줄 저장 버튼 ────────────────────────────────────────────── */
  function saveIcon() {
    /* 디스켓 — 스킨 아이콘과 같은 24 격자 픽셀 모양 */
    return '<svg viewBox="0 0 24 24" width="16" height="16" class="dds-icon" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M3 3h14l4 4v14H3V3zm2 2v14h14V8l-3-3H5zm2 0h7v4H7V5zm0 8h10v6H7v-6z"/></svg>';
  }

  function initSaveButton() {
    var tries = 0;
    var iv = setInterval(function () {
      var bar = document.querySelector('#taskbar .taskbar-right') || document.getElementById('taskbar');
      if (!bar) { if (++tries > 40) clearInterval(iv); return; }
      clearInterval(iv);
      if (document.getElementById('dds-save')) return;

      var quick = bar.querySelector('.taskbar-quick') || bar;

      var u = document.createElement('button');
      u.type = 'button';
      u.id = 'dds-undo';
      u.className = 'taskbar-button dds-undo';
      u.textContent = '되돌리기';
      u.title = '마지막으로 저장한 상태로 되돌려';
      u.hidden = true;
      u.addEventListener('click', undo);

      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'dds-save';
      b.className = 'taskbar-button dds-save';
      b.innerHTML = saveIcon() + '<span class="dds-save-label">저장</span>';
      b.addEventListener('click', save);

      quick.appendChild(u);
      quick.appendChild(b);
      undoBtn = u;
      btns.push(b);
      paint();
    }, 250);
  }

  /* 설정 창 안에 넣는 저장 줄 */
  function panelSave(host) {
    if (!host || host.querySelector('.dds-panel-save')) return;
    var row = document.createElement('div');
    row.className = 'dds-panel-save';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn dds-save';
    b.innerHTML = '<span class="dds-save-label">저장</span>';
    b.addEventListener('click', save);
    var hint = document.createElement('span');
    hint.className = 'dds-panel-save-hint';
    hint.textContent = '저장해야 손님 화면에도 반영돼';
    row.append(b, hint);
    host.appendChild(row);
    btns.push(b);
    paint();
  }

  /* ── 아이콘 끌어 옮기기 ─────────────────────────────────────────────── */
  function initDrag() {
    var host = iconHost();
    if (!host) { setTimeout(initDrag, 400); return; }
    host.classList.add('dds-icons-draggable');

    /* 아이콘 안에 <img> 가 있으면 브라우저가 제 나름의 "그림 끌기"를 시작해버려서
       우리 쪽 pointermove 가 끊긴다. 그걸 막는다. */
    host.addEventListener('dragstart', function (e) { e.preventDefault(); });

    var cur = null;

    host.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var el = e.target && e.target.closest ? e.target.closest('.desktop-icon') : null;
      if (!el || !iconKey(el)) return;
      var hb = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      cur = {
        el: el, key: iconKey(el), moved: false, id: e.pointerId,
        sx: e.clientX, sy: e.clientY,
        ox: e.clientX - b.left, oy: e.clientY - b.top,
        hb: hb, w: b.width, h: b.height
      };
      /* 포인터를 이 아이콘에 묶어둬야 밖으로 나가도 계속 따라온다 */
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });

    host.addEventListener('pointermove', function (e) {
      if (!cur) return;
      if (!cur.moved) {
        if (Math.abs(e.clientX - cur.sx) < DRAG_SLOP && Math.abs(e.clientY - cur.sy) < DRAG_SLOP) return;
        cur.moved = true;
        freezeCurrent();
        applyPositions();
        cur.hb = host.getBoundingClientRect();
        cur.el.classList.add('dds-icon-dragging');
      }
      e.preventDefault();
      var x = e.clientX - cur.hb.left - cur.ox;
      var y = e.clientY - cur.hb.top - cur.oy;
      cur.el.style.left = x + 'px';
      cur.el.style.top = y + 'px';
    });

    function end(e) {
      if (!cur) return;
      var c = cur; cur = null;
      try { c.el.releasePointerCapture(c.id); } catch (err) {}
      if (!c.moved) return;
      c.el.classList.remove('dds-icon-dragging');

      var step = gridStep(c.el);
      var maxX = Math.max(0, c.hb.width - c.w);
      var maxY = Math.max(0, c.hb.height - c.h);
      var x = Math.min(maxX, Math.max(0, parseFloat(c.el.style.left) || 0));
      var y = Math.min(maxY, Math.max(0, parseFloat(c.el.style.top) || 0));
      x = Math.min(maxX, Math.round((x - 12) / step[0]) * step[0] + 12);
      y = Math.min(maxY, Math.round((y - 16) / step[1]) * step[1] + 16);

      pos[c.key] = [Math.round(x), Math.round(y)];
      applyPositions();
      markDirty();

      /* 끌고 놓은 직후의 클릭은 창을 열지 않게 한 번만 막는다 */
      var kill = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      c.el.addEventListener('click', kill, { capture: true, once: true });
      setTimeout(function () { c.el.removeEventListener('click', kill, true); }, 400);
    }
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
  }

  /* ── 설정 창 안에 버튼 심기 ─────────────────────────────────────────── */
  function onEach(root, sel, fn) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(sel)) { fn(root); return; }
    if (!root.querySelectorAll) return;
    var f = root.querySelectorAll(sel);
    for (var i = 0; i < f.length; i++) fn(f[i]);
  }

  function watchWindows() {
    var scan = function (node) {
      onEach(node, '.wpset-wallpaper-actions', wallpaperActions);
      onEach(node, '.wpset', function (el) { panelSave(el); });
      onEach(node, '.cursor-panel', function (el) { panelSave(el); });
      /* 「갤러리에서 선택」 옆에 「컴퓨터에서 선택」을 나란히 놓는다 (기본/해제는 스킨에 이미 있다) */
      onEach(node, '.cursor-pick', function (el) { directBtn(el, '컴퓨터에서 선택'); });
      onEach(node, '.catset-thumb-btn', function (el) { directBtn(el, '컴퓨터에서 선택'); });
      onEach(node, '.ich-row-list', iconRows);
      onEach(node, '.icon-config-helper', function (el) { panelSave(el); });
      onEach(node, '.category-settings', function (el) { panelSave(el); });
      onEach(node, '.gallery', galleryPanel);
      onEach(node, '.dds-editbar-apply', function (el) {
        if (el.dataset.ddsRenamed) return;
        el.dataset.ddsRenamed = '1';
        el.textContent = '저장';
      });
    };
    scan(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var add = ms[i].addedNodes;
        for (var j = 0; j < add.length; j++) scan(add[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* 바탕화면 설정 — 배경 이미지 올리기 */
  function wallpaperActions(actions) {
    if (actions.querySelector('.dds-wall-upload')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn dds-wall-upload';
    b.textContent = '컴퓨터에서 선택';
    b.addEventListener('click', function () {
      pickFile(function (f) {
        var label = b.textContent;
        b.disabled = true; b.textContent = '올리는 중…';
        var fd = new FormData(); fd.append('file', f);
        post('/api/wallpaper', fd)
          .then(function (j) {
            try {
              sessionStorage.setItem(P + 'wallpaper', JSON.stringify(j.path));
              sessionStorage.removeItem(P + 'wallpaperPost');
            } catch (e) { throw new Error('브라우저가 저장을 막고 있어'); }
            markDirty();
            b.textContent = '적용했어. 새로고침…';
            setTimeout(function () { location.reload(); }, 350);
          })
          .catch(function (e) { b.disabled = false; b.textContent = label; note('배경 올리기 실패 — ' + e.message); });
      });
    });
    var pick = actions.querySelector('.wpset-pick');
    if (pick && pick.nextSibling) actions.insertBefore(b, pick.nextSibling);
    else actions.appendChild(b);
  }

  /* 아이콘 설정 — 줄마다 이미지 올리기 */
  function iconRows(list) {
    var root = list.closest('.icon-config-helper') || list;
    var apply = function () {
      var picks = root.querySelectorAll('.ich-icon-btn');
      for (var i = 0; i < picks.length; i++) iconUploadBtn(picks[i]);
    };
    apply();
    new MutationObserver(apply).observe(root, { childList: true, subtree: true });
  }

  function iconUploadBtn(galleryBtn) {
    var row = galleryBtn.closest('.ich-row') || galleryBtn.parentElement;
    if (!row || row.querySelector('.dds-icon-upload')) return;
    var input = row.querySelector('.ich-icon-input');
    var link = row.querySelector('.ich-link-btn');
    if (!input || !link) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn dds-btn-icon dds-icon-upload';
    b.title = '컴퓨터에서 이미지 올리기';
    b.setAttribute('aria-label', '컴퓨터에서 아이콘 이미지 올리기');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" class="dds-icon" aria-hidden="true">' +
      '<path fill="currentColor" d="M11 4h2v8h3l-4 5-4-5h3V4zM4 18h16v2H4v-2z"/></svg>';
    b.addEventListener('click', function () {
      pickFile(function (f) {
        b.disabled = true;
        var fd = new FormData(); fd.append('file', f);
        /* 아이콘도 재료라 갤러리에는 안 들어간다 */
        post('/api/assets', fd)
          .then(function (j) {
            var url = j.path;
            if (!url) throw new Error('주소를 못 받았어');
            /* 스킨의 입력칸을 열고 → 값을 넣고 → 엔터로 확정 (스킨이 알아서 반영한다) */
            link.click();
            input.value = url;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            b.disabled = false;
            markDirty();
          })
          .catch(function (e) { b.disabled = false; note('아이콘 올리기 실패 — ' + e.message); });
      });
    });
    link.parentElement.insertBefore(b, link.nextSibling);
  }

  /* 갤러리 창 — 이미지 올리기.
     스킨의 거의 모든 "이미지 고르기"(배경·스티커·커서·아이콘·앨범 커버·투두·캘린더·
     자유 위젯·쉐이커·카테고리 섬네일)가 이 창을 거치기 때문에, 여기 하나만 열어두면
     전부 컴퓨터에서 바로 올릴 수 있게 된다.
     "고르는 중"일 때도 쓸 수 있어야 하므로 새로고침 대신, 올린 뒤 스킨이 이미 갖고 있는
     섹션 새로고침 버튼을 눌러 목록만 다시 읽게 한다 (고르던 흐름이 끊기지 않는다). */
  function galleryPanel(g) {
    if (g.querySelector('.dds-gal-upload')) return;

    var picking = !!g.querySelector('.gallery-pick-banner');

    var row = document.createElement('div');
    row.className = 'dds-gal-upload';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn';
    b.textContent = '＋ 컴퓨터에서 올리기';
    var hint = document.createElement('span');
    hint.className = 'dds-gal-hint';
    hint.textContent = picking ? '올리면 목록 맨 앞에 뜨고, 누르면 바로 적용돼' : '여러 장 한 번에 올려도 돼';
    row.append(b, hint);

    b.addEventListener('click', function () {
      pickFile(function (files) {
        b.disabled = true; b.textContent = '올리는 중…';

        /* 고르러 들어온 거면 재료로 올린다 (갤러리에 안 남는다).
           그냥 갤러리를 보고 있는 거면 갤러리 이미지로 올린다. */
        if (picking) {
          var one = new FormData();
          one.append('file', files[0]);
          post('/api/assets?stage=1', one)
            .then(function (j) {
              refreshGallery(g);
              b.textContent = '적용하는 중…';
              waitForCard(g, j.path, function (card) {
                b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기';
                if (card) card.click(); else note('올리긴 했는데 목록에서 못 찾았어');
                assetDone();
              });
            })
            .catch(function (e) { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; note('올리기 실패 — ' + e.message); });
          return;
        }

        var fd = new FormData();
        for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
        post('/api/uploads', fd)
          .then(function (j) {
            refreshGallery(g);
            b.textContent = ((j.items || []).length) + '장 올렸어';
            setTimeout(function () { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; }, 1600);
          })
          .catch(function (e) { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; note('올리기 실패 — ' + e.message); });
      }, !picking);
    });

    var first = g.firstChild;
    if (first) g.insertBefore(row, first); else g.appendChild(row);

    if (!picking) galleryDelete(g);
  }

  /* 갤러리 창에서 이미지 지우기 (주인, 고르는 중이 아닐 때만) */
  function galleryDelete(g) {
    var apply = function () {
      var cards = g.querySelectorAll('.gallery-card');
      for (var i = 0; i < cards.length; i++) addDeleteBtn(cards[i]);
    };
    apply();
    new MutationObserver(apply).observe(g, { childList: true, subtree: true });
  }

  function addDeleteBtn(card) {
    if (card.querySelector('.dds-gal-del')) return;
    var img = card.querySelector('img');
    if (!img) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn dds-gal-del';
    b.title = '이 이미지를 지우기';
    b.setAttribute('aria-label', '이미지 지우기');
    b.textContent = '×';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var src = img.getAttribute('src') || '';
      var m = src.match(/\/uploads\/[^?#]+/);
      if (!m) { note('이 이미지는 갤러리에서 지울 수 없어'); return; }
      if (!confirm('이 이미지를 갤러리에서 지울까? 쓰고 있던 곳이 있으면 깨져.')) return;
      b.disabled = true;
      fetch('/api/uploads/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: m[0] }),
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); }); })
        .then(function () { card.remove(); clearGalleryCache(); refreshGallery(document.querySelector('.gallery') || card); })
        .catch(function (err) { b.disabled = false; note('못 지웠어 — ' + err.message); });
    });
    card.style.position = card.style.position || 'relative';
    card.appendChild(b);
  }

  /* 목록만 다시 읽기 — 스킨이 5분간 기억해둔 걸 지우고, 스킨의 새로고침 버튼을 누른다 */
  function refreshGallery(g) {
    clearGalleryCache();
    var btns = g.querySelectorAll('.gallery-section-refresh');
    for (var j = 0; j < btns.length; j++) btns[j].click();
  }

  /* ── 「컴퓨터에서 선택」 ──────────────────────────────────────────────
     스킨의 「갤러리에서 선택」 버튼 옆에 붙는다.
     파일을 고르면 올린 뒤, 스킨의 고르기 창을 잠깐 열어 방금 올린 걸 대신 눌러준다.
     (스킨 안쪽 함수는 건드릴 수 없어서, 스킨이 원래 쓰는 길을 그대로 통과시키는 방식이다) */
  function directBtn(galleryBtn, label) {
    /* 우리가 만든 버튼에 우리가 또 붙지 않도록 (그러면 무한히 늘어난다) */
    if (!galleryBtn || galleryBtn.classList.contains('dds-direct')) return;
    if (galleryBtn.dataset.ddsDirect) return;
    galleryBtn.dataset.ddsDirect = '1';

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn dds-direct';
    b.textContent = label;
    b.title = '컴퓨터에서 이미지를 골라 바로 적용해';
    b.addEventListener('click', function () {
      pickFile(function (f) {
        var old = b.textContent;
        b.disabled = true; b.textContent = '올리는 중…';
        var fd = new FormData();
        fd.append('file', f);
        /* 재료 이미지 — 갤러리에는 안 남는다. 고르는 동안만 목록에 잠깐 끼워둔다 */
        post('/api/assets?stage=1', fd)
          .then(function (j) {
            var path = j.path;
            clearGalleryCache();
            galleryBtn.click();
            waitForGallery(function (g) {
              if (!g) { b.disabled = false; b.textContent = old; assetDone(); note('올리긴 했는데 적용을 못 했어. 「갤러리에서 선택」에서 골라줘'); return; }
              refreshGallery(g);
              waitForCard(g, path, function (card) {
                b.disabled = false; b.textContent = old;
                if (card) card.click(); else note('올리긴 했는데 목록에서 못 찾았어');
                assetDone();
              });
            });
          })
          .catch(function (e) { b.disabled = false; b.textContent = old; note('올리기 실패 — ' + e.message); });
      });
    });

    if (galleryBtn.nextSibling) galleryBtn.parentElement.insertBefore(b, galleryBtn.nextSibling);
    else galleryBtn.parentElement.appendChild(b);

    widen(galleryBtn, 480);
  }

  /* 버튼이 하나 늘었으니 창이 좁으면 넓혀준다 (스킨이 정해둔 너비를 살짝만 키운다) */
  function widen(el, min) {
    var win = el.closest ? el.closest('.win') : null;
    if (!win || win.dataset.ddsWide) return;
    win.dataset.ddsWide = '1';
    var w = win.getBoundingClientRect().width;
    if (w >= min) return;
    var room = Math.max(0, innerWidth - 24);
    win.style.width = Math.min(min, room) + 'px';
  }

  /* 다 골랐으니 갤러리 목록에서 빼달라고 알린다 */
  function assetDone() {
    fetch('/api/assets/done', { method: 'POST', credentials: 'same-origin' })
      .then(function () { clearGalleryCache(); })
      .catch(function () {});
  }

  function waitForGallery(done) {
    var tries = 0;
    var iv = setInterval(function () {
      var g = document.querySelector('.gallery');
      if (g) { clearInterval(iv); done(g); return; }
      if (++tries > 40) { clearInterval(iv); done(null); }
    }, 150);
  }

  function clearGalleryCache() {
    try {
      var del = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(P + 'gallery:') === 0) del.push(k);
      }
      for (var n = 0; n < del.length; n++) sessionStorage.removeItem(del[n]);
    } catch (e) {}
  }

  /* 목록이 다시 그려지고 방금 올린 게 나타날 때까지 기다린다 (최대 12초) */
  function waitForCard(g, path, done) {
    if (!path) { done(null); return; }
    var tries = 0;
    var iv = setInterval(function () {
      var imgs = g.querySelectorAll('.gallery-card img');
      for (var i = 0; i < imgs.length; i++) {
        if ((imgs[i].getAttribute('src') || '').indexOf(path) !== -1) {
          clearInterval(iv);
          done(imgs[i].closest('.gallery-card'));
          return;
        }
      }
      if (++tries > 60) { clearInterval(iv); done(null); }
    }, 200);
  }

  /* ── 스타일 ──────────────────────────────────────────────────────────── */
  function injectStyle() {
    if (document.getElementById('dds-mine-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-mine-style';
    s.textContent = [
      '.dds-save{display:inline-flex;align-items:center;gap:5px}',
      '.dds-save[disabled]{opacity:.45;cursor:default}',
      '.dds-save.is-dirty{color:var(--dds-accent,#e2901d)}',
      '.taskbar-button.dds-save .dds-save-label{font-size:var(--dds-text-caption,12px)}',
      '.taskbar-button.dds-undo{font-size:var(--dds-text-caption,12px)}',
      /* 설정 창은 내용이 길어서 아래로 스크롤된다. 저장 줄은 늘 보이게 바닥에 붙여둔다 */
      '.dds-panel-save{position:sticky;z-index:2;display:flex;align-items:center;gap:8px;' +
        'flex-wrap:wrap;margin-top:var(--dds-space-sm,10px);' +
        /* 창 본문의 안쪽 여백까지 덮어야 밑으로 내용이 비쳐 보이지 않는다 */
        'bottom:calc(-1 * var(--dds-win-pad,12px));' +
        'margin-bottom:calc(-1 * var(--dds-win-pad,12px));' +
        'padding:var(--dds-space-sm,10px) 0 var(--dds-win-pad,12px);' +
        'border-top:1px solid var(--dds-face-light,#565656);' +
        'background:var(--dds-win-bg,var(--dds-face,#3a3a3a))}',
      '.dds-panel-save-hint{font-size:var(--dds-text-caption,12px);opacity:.75}',
      '.dds-gal-upload{display:flex;align-items:center;gap:8px;flex-wrap:wrap;' +
        'margin-bottom:var(--dds-space-sm,10px)}',
      '.dds-gal-hint{font-size:var(--dds-text-caption,12px);opacity:.75}',
      '.dds-gal-del{position:absolute;right:3px;top:3px;z-index:2;width:20px;height:19px;padding:0;' +
        'line-height:1;font-size:14px;display:grid;place-items:center}',
      '.dds-mine-note{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:100000;' +
        'padding:8px 14px;background:var(--dds-face-shadow,#1e1e1e);color:var(--dds-win-fg,#e4e4e2);' +
        'border:1px solid var(--dds-accent-dark,#ab6f19);font-size:13px;max-width:80vw;white-space:pre-line;' +
        'font-family:var(--dds-font-pixel,monospace)}',
      '.dds-icons-draggable .desktop-icon{touch-action:none}',
      '.dds-icon-dragging{opacity:.7;z-index:5}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* 아이콘 자유 배치는 손님 화면에도 필요하다 */
  function baseStyle() {
    if (document.getElementById('dds-icons-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-icons-style';
    s.textContent = '#desktop-icons.dds-icons-free{display:block}' +
      '#desktop-icons.dds-icons-free .desktop-icon{position:absolute}';
    document.head.appendChild(s);
  }

  /* ==================================================================== */
  /*  들어올 때 뜨는 로그인 창 (아직 아무도 아닌 사람에게만)                    */
  /* ==================================================================== */
  var SKIP = 'bridge:skipLogin';

  function needLogin() {
    var me = window.DDS_ME || {};
    if (me.owner || me.guest) return false;
    try { if (localStorage.getItem(SKIP) === '1') return false; } catch (e) {}
    return true;
  }

  /* 「그냥 둘러보기」로 닫았어도 나중에 들어올 수 있게, 작업표시줄에 로그인 버튼 하나 */
  function loginButton() {
    var me = window.DDS_ME || {};
    if (me.owner) return;
    var tries = 0;
    var iv = setInterval(function () {
      var bar = document.querySelector('#taskbar .taskbar-right') || document.getElementById('taskbar');
      if (!bar) { if (++tries > 40) clearInterval(iv); return; }
      clearInterval(iv);
      if (document.getElementById('dds-login-btn')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'dds-login-btn';
      b.className = 'taskbar-button';
      b.textContent = me.guest ? me.guest : '로그인';
      b.title = me.guest ? '지금은 손님으로 보고 있어 — 누르면 다시 정할 수 있어' : '로그인';
      b.addEventListener('click', function () {
        try { localStorage.removeItem(SKIP); } catch (e) {}
        if (document.querySelector('.dds-gate')) return;
        openGate();
      });
      var quick = bar.querySelector('.taskbar-quick') || bar;
      quick.insertBefore(b, quick.firstChild);
    }, 250);
  }

  function loginGate() {
    if (!needLogin()) return;
    openGate();
  }

  function openGate() {

    var back = document.createElement('div');
    back.className = 'dds-gate';

    var win = document.createElement('div');
    win.className = 'win dds-gate-win';

    var bar = document.createElement('div');
    bar.className = 'win-titlebar';
    var t = document.createElement('span');
    t.className = 'win-title';
    t.textContent = '로그인';
    bar.appendChild(t);

    var body = document.createElement('div');
    body.className = 'win-body dds-gate-body';

    var err = document.createElement('p');
    err.className = 'dds-gate-err';

    /* 주인 */
    var f1 = document.createElement('form');
    f1.className = 'dds-gate-form';
    f1.method = 'post';
    f1.action = '/api/login';
    f1.innerHTML =
      '<p class="dds-gate-head">주인</p>' +
      '<input class="dds-gate-in" name="username" autocomplete="username" placeholder="아이디">' +
      '<input class="dds-gate-in" name="password" type="password" autocomplete="current-password" placeholder="비밀번호">';
    var b1 = document.createElement('button');
    b1.type = 'submit'; b1.className = 'dds-btn'; b1.textContent = '들어가기';
    f1.appendChild(b1);

    /* 손님 */
    var f2 = document.createElement('form');
    f2.className = 'dds-gate-form';
    f2.method = 'post';
    f2.action = '/api/guest';
    f2.innerHTML =
      '<p class="dds-gate-head">손님</p>' +
      '<input class="dds-gate-in" name="nickname" autocomplete="nickname" placeholder="닉네임 (방명록에 쓸 이름)">';
    var b2 = document.createElement('button');
    b2.type = 'submit'; b2.className = 'dds-btn'; b2.textContent = '닉네임으로 들어가기';
    f2.appendChild(b2);

    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'dds-btn dds-gate-skip';
    skip.textContent = '그냥 둘러보기';
    skip.addEventListener('click', function () {
      try { localStorage.setItem(SKIP, '1'); } catch (e) {}
      back.remove();
    });

    function send(url, data, btn) {
      var old = btn.textContent;
      btn.disabled = true; btn.textContent = '잠깐만…';
      err.textContent = '';
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
        .then(function () { location.reload(); })
        .catch(function (e) { btn.disabled = false; btn.textContent = old; err.textContent = e.message; });
    }

    f1.addEventListener('submit', function (ev) {
      ev.preventDefault();
      send('/api/login', { username: f1.username.value, password: f1.password.value }, b1);
    });
    f2.addEventListener('submit', function (ev) {
      ev.preventDefault();
      send('/api/guest', { nickname: f2.nickname.value }, b2);
    });

    body.append(f1, document.createElement('hr'), f2, err, skip);
    win.append(bar, body);
    back.appendChild(win);
    document.body.appendChild(back);
    setTimeout(function () { try { f1.username.focus(); } catch (e) {} }, 60);
  }

  function gateStyle() {
    if (document.getElementById('dds-gate-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-gate-style';
    s.textContent = [
      '.dds-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(0,0,0,.5);backdrop-filter:blur(2px);padding:16px}',
      '.dds-gate-win{width:min(340px,100%)}',
      '.dds-gate-body{display:flex;flex-direction:column;gap:10px}',
      '.dds-gate-form{display:flex;flex-direction:column;gap:6px;margin:0}',
      '.dds-gate-head{margin:0;font-family:var(--dds-font-pixel,monospace);' +
        'font-size:var(--dds-text-caption,12px);opacity:.8}',
      '.dds-gate-in{width:100%;padding:7px 9px;border:1px solid var(--dds-face-dark,#131313);' +
        'background:var(--dds-win-bg,#f1f3ea);color:var(--dds-win-fg,#23261f);' +
        'box-shadow:var(--dds-surface-sunken,none);outline:none;font:inherit;font-size:13px;border-radius:0}',
      '.dds-gate-body hr{border:0;border-top:1px solid var(--dds-face-light,#565656);margin:2px 0;width:100%}',
      '.dds-gate-err{margin:0;min-height:16px;font-size:12px;color:#c0392b}',
      '.dds-gate-skip{align-self:flex-end}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ==================================================================== */
  /*  방명록 — 스킨이 우리 조각을 창 안으로 옮기므로, 버튼은 여기서 붙인다        */
  /* ==================================================================== */
  function initGuestbook() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      var login = t.closest('.gb-login');
      if (login) {
        try { localStorage.removeItem(SKIP); } catch (err) {}
        if (!document.querySelector('.dds-gate')) openGate();
        return;
      }

      var send = t.closest('.gb-send');
      if (send) {
        var box = send.closest('.gb-write');
        var ta = box && box.querySelector('.gb-input');
        var msg = box && box.querySelector('.gb-msg');
        if (!ta || !ta.value.trim()) { if (msg) msg.textContent = '내용을 적어줘'; return; }
        send.disabled = true;
        if (msg) msg.textContent = '';
        fetch('/api/guestbook', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: ta.value }),
          credentials: 'same-origin'
        })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
          .then(function () { location.href = '/guestbook'; })
          .catch(function (err) { send.disabled = false; if (msg) msg.textContent = err.message; });
        return;
      }

      var del = t.closest('.gb-del');
      if (del) {
        if (!confirm('이 방명록을 지울까?')) return;
        fetch('/api/guestbook/' + del.dataset.gbdel, { method: 'DELETE', credentials: 'same-origin' })
          .then(function () { location.href = '/guestbook'; })
          .catch(function () { note('못 지웠어'); });
      }
    });
  }

  function guestbookStyle() {
    if (document.getElementById('dds-gb-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-gb-style';
    s.textContent = [
      '.gb-write{margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid var(--dds-face-light,#565656)}',
      '.gb-who{margin:0 0 6px;font-size:var(--dds-text-caption,12px);opacity:.75}',
      '.gb-input{width:100%;padding:8px 9px;border:1px solid var(--dds-face-dark,#131313);' +
        'background:var(--dds-win-bg,#f1f3ea);color:inherit;font:inherit;font-size:13px;' +
        'resize:vertical;border-radius:0;outline:none}',
      '.gb-actions{display:flex;align-items:center;gap:8px;margin-top:6px}',
      '.gb-msg{font-size:12px;color:#c0392b}',
      '.guest-item{padding:8px 0;border-bottom:1px solid var(--dds-face-light,#565656)}',
      '.guest-item p{margin:4px 0 0;white-space:pre-wrap}',
      '.gb-del{float:right;font-size:11px}',
      '.guest-empty{opacity:.7}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── 시작 ────────────────────────────────────────────────────────────── */
  function start() {
    guestbookStyle();
    initGuestbook();
    baseStyle();
    gateStyle();
    initIcons();
    loginGate();
    loginButton();
    if (isOwner()) initOwner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
