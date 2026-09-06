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
  /* 올릴 사진마다 제목을 받는 작은 창.
     제목은 갤러리 격자에는 안 나오고, 사진을 눌러 크게 봤을 때 아래에만 뜬다.
     비워두면 제목 없이 올라간다. */
  function askTitles(files, done) {
    titleStyle();
    var back = document.createElement('div');
    back.className = 'dds-tt';

    var win = document.createElement('div');
    win.className = 'win dds-tt-win';

    var bar = document.createElement('div');
    bar.className = 'win-titlebar';
    bar.innerHTML = '<span class="win-title">사진 제목</span>';

    var body = document.createElement('div');
    body.className = 'win-body dds-tt-body';

    var head = document.createElement('p');
    head.className = 'dds-tt-head';
    head.textContent = '크게 봤을 때 사진 아래에 뜨는 이름이야. 비워둬도 돼.';
    body.appendChild(head);

    var ins = [];
    for (var i = 0; i < files.length; i++) {
      var row = document.createElement('label');
      row.className = 'dds-tt-row';

      var thumb = document.createElement('img');
      thumb.className = 'dds-tt-thumb';
      try { thumb.src = URL.createObjectURL(files[i]); } catch (e) {}

      var box = document.createElement('span');
      box.className = 'dds-tt-box';
      var nm = document.createElement('span');
      nm.className = 'dds-tt-file';
      nm.textContent = files[i].name;
      var inp = document.createElement('input');
      inp.className = 'dds-tt-in';
      inp.type = 'text';
      inp.maxLength = 120;
      inp.placeholder = '제목 (없어도 됨)';
      box.append(nm, inp);
      ins.push(inp);

      row.append(thumb, box);
      body.appendChild(row);
    }

    var foot = document.createElement('div');
    foot.className = 'dds-tt-foot';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'dds-btn'; cancel.textContent = '취소';
    var ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'dds-btn dds-tt-ok'; ok.textContent = '올리기';
    foot.append(cancel, ok);
    body.appendChild(foot);

    function close(v) {
      ins.forEach(function (x) { try { URL.revokeObjectURL(x.src); } catch (e) {} });
      back.remove();
      document.removeEventListener('keydown', key, true);
      done(v);
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    }
    function go() { close(ins.map(function (x) { return x.value.trim(); })); }

    cancel.addEventListener('click', function () { close(null); });
    ok.addEventListener('click', go);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
    document.addEventListener('keydown', key, true);

    win.append(bar, body);
    back.appendChild(win);
    document.body.appendChild(back);
    setTimeout(function () { try { ins[0].focus(); } catch (e) {} }, 50);
  }

  function titleStyle() {
    if (document.getElementById('dds-tt-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-tt-style';
    s.textContent = [
      '.dds-tt{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;',
      '  justify-content:center;background:rgba(0,0,0,.45);padding:16px}',
      '.dds-tt-win{width:min(420px,100%);max-height:80vh;display:flex;flex-direction:column}',
      '.dds-tt-body{overflow:auto;display:flex;flex-direction:column;gap:9px}',
      '.dds-tt-head{margin:0 0 2px;font-size:12px;opacity:.75;line-height:1.6}',
      '.dds-tt-row{display:flex;gap:10px;align-items:center}',
      '.dds-tt-thumb{width:52px;height:40px;flex:none;object-fit:cover;',
      '  border:1px solid var(--dds-face-dark,#131313)}',
      '.dds-tt-box{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.dds-tt-file{font-size:10.5px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dds-tt-in{width:100%;padding:5px 8px;border:1px solid var(--dds-face-dark,#131313);',
      '  background:var(--dds-win-bg,#f1f3ea);color:var(--dds-win-fg,#23261f);',
      '  box-shadow:var(--dds-surface-sunken,none);outline:none;font:inherit;font-size:12.5px;border-radius:0}',
      '.dds-tt-foot{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}'
    ].join('\n');
    document.head.appendChild(s);
  }

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

        /* 올리기 전에 사진마다 제목을 받는다.
           제목은 격자에는 안 나오고, 눌러서 크게 봤을 때 아래에만 작게 뜬다. */
        b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기';
        askTitles(files, function (titles) {
          if (!titles) return;                       // 취소
          b.disabled = true; b.textContent = '올리는 중…';
          var fd = new FormData();
          for (var i = 0; i < files.length; i++) {
            fd.append('files', files[i]);
            fd.append('titles', titles[i] || '');
          }
          post('/api/uploads', fd)
            .then(function (j) {
              refreshGallery(g);
              b.textContent = ((j.items || []).length) + '장 올렸어';
              setTimeout(function () { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; }, 1600);
            })
            .catch(function (e) { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; note('올리기 실패 — ' + e.message); });
        });
      }, !picking);
    });

    if (!picking) galleryDelete(g, row);

    var first = g.firstChild;
    if (first) g.insertBefore(row, first); else g.appendChild(row);
  }

  /* 갤러리 창에서 이미지 지우기 —
     평소엔 아무 표시도 없고, 「삭제하기」를 눌렀을 때만 고를 수 있게 된다 */
  function galleryDelete(g, row) {
    var on = false, picked = {};

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'dds-btn dds-gal-delmode';
    del.textContent = '삭제하기';

    var doIt = document.createElement('button');
    doIt.type = 'button';
    doIt.className = 'dds-btn dds-gal-doit';
    doIt.hidden = true;

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dds-btn dds-gal-cancel';
    cancel.textContent = '취소';
    cancel.hidden = true;

    row.append(del, doIt, cancel);

    function count() { var n = 0; for (var k in picked) if (picked[k]) n++; return n; }
    var painting = false;
    function paint() {
      /* 고쳐 그리는 것 자체가 목록 변화를 일으켜서, 그 신호로 또 부르면 끝없이 돈다 */
      if (painting) return;
      painting = true;
      try { draw(); } finally { setTimeout(function () { painting = false; }, 0); }
    }
    function draw() {
      g.classList.toggle('dds-gal-picking', on);
      del.hidden = on;
      doIt.hidden = !on;
      cancel.hidden = !on;
      doIt.textContent = count() ? count() + '장 지우기' : '지울 걸 골라줘';
      doIt.disabled = !count();
      var cards = g.querySelectorAll('.gallery-card');
      for (var i = 0; i < cards.length; i++) {
        var src = srcOf(cards[i]);
        cards[i].classList.toggle('dds-gal-on', !!(src && picked[src]));
      }
    }
    function srcOf(card) {
      var img = card.querySelector('img');
      var m = img && (img.getAttribute('src') || '').match(/\/uploads\/[^?#]+/);
      return m ? m[0] : null;
    }

    del.addEventListener('click', function () { on = true; picked = {}; paint(); });
    cancel.addEventListener('click', function () { on = false; picked = {}; paint(); });

    /* 고르는 중에는 카드 클릭이 확대가 아니라 선택이 되게 가로챈다 */
    g.addEventListener('click', function (e) {
      if (!on) return;
      var card = e.target.closest ? e.target.closest('.gallery-card') : null;
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      var src = srcOf(card);
      if (!src) { note('이 이미지는 갤러리에서 지울 수 없어'); return; }
      picked[src] = !picked[src];
      paint();
    }, true);

    doIt.addEventListener('click', function () {
      var list = [];
      for (var k in picked) if (picked[k]) list.push(k);
      if (!list.length) return;
      if (!confirm(list.length + '장을 지울까? 쓰고 있던 곳이 있으면 그 자리는 깨져.')) return;
      doIt.disabled = true; doIt.textContent = '지우는 중…';
      var left = list.length, failed = 0;
      list.forEach(function (p) {
        fetch('/api/uploads/remove', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: p }),
          credentials: 'same-origin'
        })
          .then(function (r) { if (!r.ok) failed++; })
          .catch(function () { failed++; })
          .then(function () {
            if (--left > 0) return;
            on = false; picked = {}; paint();
            clearGalleryCache();
            refreshGallery(g);
            if (failed) note(failed + '장은 못 지웠어');
          });
      });
    });

    new MutationObserver(paint).observe(g, { childList: true, subtree: true });
    paint();
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
      /* 삭제 고르는 중일 때만 카드에 표시가 붙는다 */
      '.dds-gal-picking .gallery-card{outline:1px dashed var(--dds-face-light,#565656);outline-offset:-2px;cursor:pointer}',
      '.dds-gal-picking .gallery-card.dds-gal-on{outline:2px solid var(--dds-accent,#e2901d);outline-offset:-2px}',
      '.dds-gal-picking .gallery-card.dds-gal-on:after{content:"지움";position:absolute;right:3px;top:3px;' +
        'padding:1px 5px;font-size:11px;background:var(--dds-accent,#e2901d);color:#23261f}',
      '.dds-gal-picking .gallery-card{position:relative}',
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

  /* ==================================================================== */
  /*  글 창의 「비공개로 전환 · 삭제」 — 원래는 티스토리로 요청을 보낸다.        */
  /*  우리 서버로 돌려서 실제로 동작하게 한다.                                 */
  /* ==================================================================== */
  function initPostManage() {
    document.addEventListener('click', function (e) {
      var bar = e.target.closest ? e.target.closest('.t-manage-bar') : null;
      if (!bar) return;
      var btn = e.target.closest('button');
      if (!btn) return;                       // 「수정」은 <a> 라 그대로 둔다

      var link = bar.querySelector('a[href*="/manage/newpost/"]');
      var m = link && link.getAttribute('href').match(/\/manage\/newpost\/(\d+)/);
      if (!m) return;
      var id = m[1];
      var txt = (btn.textContent || '').trim();

      e.preventDefault();
      e.stopPropagation();

      if (/삭제/.test(txt)) {
        if (!confirm('이 글을 지울까? 되돌릴 수 없어.')) return;
        btn.disabled = true;
        fetch('/api/posts/' + id, { method: 'DELETE', credentials: 'same-origin' })
          .then(function (r) { if (!r.ok) throw new Error('실패'); })
          .then(function () { note('글을 지웠어'); setTimeout(function () { location.href = '/'; }, 700); })
          .catch(function () { btn.disabled = false; note('못 지웠어'); });
        return;
      }

      if (/공개/.test(txt)) {
        btn.disabled = true;
        fetch('/api/posts/' + id + '/visibility', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
          credentials: 'same-origin'
        })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
          .then(function (j) {
            btn.disabled = false;
            btn.textContent = j.visibility === 'private' ? '공개로 전환' : '비공개로 전환';
            note(j.visibility === 'private' ? '비공개로 바꿨어' : '공개로 바꿨어');
          })
          .catch(function (err) { btn.disabled = false; note('못 바꿨어 — ' + err.message); });
      }
    }, true);
  }

  /* ── 갤러리 사진 제목을 사진 아래로 ───────────────────────────────────
     스킨은 설명글을 라이트박스 맨 위(제목줄 옆)에 붙인다. 우리는 사진 밑에
     작게 두고 싶으니, 그 칸을 사진과 아래 띠 사이로 한 번만 옮긴다.
     스킨이 글자를 다시 채울 때는 같은 요소를 그대로 쓰므로 옮겨도 계속 갱신된다.
     주인·손님 모두에게 적용된다. */
  function captionStyle() {
    if (document.getElementById('dds-cap-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-cap-style';
    s.textContent = [
      '.lightbox-caption.dds-cap{margin:10px 16px 0;text-align:center;font-size:12.5px;',
      '  line-height:1.6;opacity:.85;flex:none}',
      '.lightbox-caption.dds-cap[hidden]{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function moveCaption() {
    var boxes = document.querySelectorAll('.lightbox');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.dataset.ddsCap) continue;
      var cap = box.querySelector('.lightbox-caption');
      var foot = box.querySelector('.lightbox-foot');
      if (!cap || !foot) continue;
      box.dataset.ddsCap = '1';
      cap.classList.add('dds-cap');
      box.insertBefore(cap, foot);       // 사진 아래, 썸네일 띠 위
    }
  }
  function initCaption() {
    captionStyle();
    moveCaption();
    var mo = new MutationObserver(function () { moveCaption(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 글 목록을 블로그처럼 ─────────────────────────────────────────────
     스킨의 「목록형」은 파일 탐색기처럼 제목·날짜만 한 줄로 그린다.
     거기에 사진과 본문 앞부분을 채워 넣어서 블로그 글 목록으로 만든다.
     (사진·발췌는 render.js 가 window.DDS_POST_META 로 미리 넘겨준다)
     주인·손님 모두에게 똑같이 보인다. */
  function postMeta(href) {
    try {
      var m = window.DDS_POST_META || {};
      var p = new URL(href, location.href).pathname.replace(/\/$/, '');
      return m[p] || null;
    } catch (e) { return null; }
  }

  function dressRow(row) {
    if (row.dataset.ddsRow) return;
    var link = row.querySelector('.category-list-link');
    if (!link) return;
    row.dataset.ddsRow = '1';

    var meta = postMeta(link.getAttribute('href') || '');
    var name = row.querySelector('.category-list-name');
    var thumb = row.querySelector('.category-list-thumb');
    var title = row.querySelector('.category-list-title');
    var date = row.querySelector('.category-list-date');
    var type = row.querySelector('.category-list-type');
    if (!name || !title) return;

    /* 사진이 있으면 아이콘 자리를 진짜 사진으로 바꾼다 */
    if (thumb && meta && meta.t) {
      thumb.classList.remove('category-list-thumb-empty');
      thumb.classList.add('dds-row-thumb');
      thumb.style.backgroundImage = 'url("' + meta.t.replace(/"/g, '%22') + '")';
    } else if (thumb) {
      thumb.classList.add('dds-row-noimg');
    }

    /* 제목 아래에 본문 앞부분과 「카테고리 · 날짜」 한 줄을 넣는다 */
    var tx = document.createElement('span');
    tx.className = 'dds-row-tx';
    title.parentNode.insertBefore(tx, title);
    tx.appendChild(title);

    if (meta && meta.n) {
      var flag = document.createElement('span');
      flag.className = 'dds-row-notice';
      flag.textContent = '공지';
      title.insertBefore(flag, title.firstChild);
    }
    if (meta && meta.e) {
      var ex = document.createElement('span');
      ex.className = 'dds-row-ex';
      ex.textContent = meta.e;
      tx.appendChild(ex);
    }
    var foot = document.createElement('span');
    foot.className = 'dds-row-meta';
    var cat = (type && type.textContent.trim()) || (meta && meta.c) || '';
    var day = (date && date.textContent.trim()) || '';
    foot.textContent = cat ? cat + ' · ' + day : day;
    tx.appendChild(foot);

    /* 원래 있던 날짜·유형 칸은 우리가 옮겨 담았으니 감춘다 */
    if (date) date.hidden = true;
    if (type) type.hidden = true;
    row.classList.add('dds-row');
  }

  /* 전체 글 보기 맨 위 — 글 하나를 통째로 펼쳐 놓는다 (블로그 첫 화면처럼).
     어느 글인지는 render.js 가 window.DDS_FEATURED 로 정해서 넘겨준다.
     카테고리·태그·검색으로 들어갔을 때는 안 넣는다. */
  function atRoot(explorer) {
    var main = explorer.closest ? explorer.closest('.post-browser-main') : null;
    var back = main && main.querySelector('.post-browser-back');
    /* 뒤로 버튼이 살아 있으면 어딘가 들어와 있는 것 */
    if (back && !back.disabled && back.offsetParent !== null) return false;
    var path = main && main.querySelector('.post-browser-path');
    var txt = path ? (path.textContent || '').trim() : '';
    return !txt || txt.indexOf('›') === -1;
  }

  function buildFeature(f) {
    var art = document.createElement('article');
    art.className = 'dds-feature';

    var h = document.createElement('a');
    h.className = 'dds-feature-title';
    h.href = f.link;
    h.textContent = f.title || '';
    if (f.notice) {
      var flag = document.createElement('span');
      flag.className = 'dds-row-notice';
      flag.textContent = '공지';
      h.insertBefore(flag, h.firstChild);
    }

    var meta = document.createElement('div');
    meta.className = 'dds-feature-meta';
    meta.textContent = f.cat ? f.cat + ' · ' + f.date : f.date;

    var body = document.createElement('div');
    body.className = 'dds-feature-body';
    body.innerHTML = f.html || '';

    art.append(h, meta, body);

    if (f.tags && f.tags.length) {
      var tg = document.createElement('div');
      tg.className = 'dds-feature-tags';
      for (var i = 0; i < f.tags.length; i++) {
        var a = document.createElement('a');
        a.href = '/tag/' + encodeURIComponent(f.tags[i]);
        a.textContent = '#' + f.tags[i];
        tg.appendChild(a);
      }
      art.appendChild(tg);
    }

    var head = document.createElement('div');
    head.className = 'dds-feature-sep';
    head.innerHTML = '<span>이전 글</span><i></i>';
    art.appendChild(head);
    return art;
  }

  function addFeature() {
    var f = null;
    try { f = window.DDS_FEATURED || null; } catch (e) {}
    if (!f || !f.link) return;
    var exps = document.querySelectorAll('.category-explorer');
    for (var i = 0; i < exps.length; i++) {
      var ex = exps[i];
      var list = ex.querySelector('.category-list');
      if (!list) continue;
      var root = atRoot(ex);
      var old = ex.querySelector('.dds-feature');
      if (!root) { if (old) old.remove(); continue; }
      if (old) continue;
      ex.insertBefore(buildFeature(f), ex.firstChild);
    }
  }

  /* 맨 위에 펼쳐 놓은 글은 아래 목록에서 뺀다 (같은 글이 두 번 나오지 않게) */
  function hideFeatured(row) {
    var f = null;
    try { f = window.DDS_FEATURED || null; } catch (e) {}
    if (!f || !f.link) return false;
    var link = row.querySelector('.category-list-link');
    if (!link) return false;
    try {
      var a = new URL(link.getAttribute('href') || '', location.href).pathname.replace(/\/$/, '');
      var bq = new URL(f.link, location.href).pathname.replace(/\/$/, '');
      if (a !== bq) return false;
    } catch (e) { return false; }
    var ex = row.closest ? row.closest('.category-explorer') : null;
    if (!ex || !ex.querySelector('.dds-feature')) return false;   // 목록만 있는 화면이면 그냥 둔다
    row.hidden = true;
    return true;
  }

  function dressList() {
    addFeature();
    var rows = document.querySelectorAll('.category-list-row');
    for (var i = 0; i < rows.length; i++) {
      if (hideFeatured(rows[i])) continue;
      dressRow(rows[i]);
    }
  }

  function listStyle() {
    if (document.getElementById('dds-list-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-list-style';
    s.textContent = [
      /* 「이름 / 발행일자 / 유형」 머리줄 — 블로그 목록에는 필요 없다 */
      '.category-list-head{display:none!important}',
      /* 상자·테두리 없이 가로줄 하나로만 나눈다 */
      '.category-list{border:0!important;background:transparent!important}',
      '.category-list .dds-row{border:0;border-bottom:1px solid var(--dds-face-shadow,#d9dcd1)}',
      '.category-list .dds-row:last-child{border-bottom:0}',
      '.dds-row .category-list-link{display:flex;align-items:flex-start;gap:16px;',
      '  padding:15px 10px;text-decoration:none;background:transparent}',
      '.dds-row .category-list-link:hover{background:rgba(127,127,127,.10)}',
      '.dds-row .category-list-name{display:flex;align-items:flex-start;gap:16px;flex:1;min-width:0}',
      /* 사진 — 왼쪽에 3:2 로 줄 맞춰 */
      '.dds-row .dds-row-thumb{width:112px;height:75px;flex:none;background-size:cover;',
      '  background-position:center;border:1px solid var(--dds-face-dark,#45453f)}',
      /* 사진 없는 글 — 자리만 비워둔다 (제목 시작점이 위아래로 안 어긋나게) */
      /* 사진 없는 글 — 자리만 비워둔다 (제목 시작점이 위아래로 안 어긋나게) */
      '.dds-row .dds-row-noimg{width:112px;height:75px;flex:none;visibility:hidden}',
      '.dds-row-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;padding-top:1px}',
      '.dds-row .category-list-title{font-size:15px;font-weight:600;line-height:1.5;',
      '  white-space:normal;overflow:visible;text-overflow:clip}',
      '.dds-row-notice{font-size:11px;font-weight:400;opacity:.75;margin-right:6px;',
      '  border:1px solid currentColor;padding:0 4px}',
      '.dds-row-ex{font-size:12.5px;line-height:1.72;opacity:.62;',
      '  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dds-row-meta{font-size:11.5px;opacity:.5}',
      /* 맨 위에 통째로 펼쳐 놓는 글 */
      '.dds-feature{padding:6px 10px 0;margin-bottom:2px}',
      '.dds-feature-title{display:block;font-size:21px;font-weight:600;line-height:1.45;',
      '  text-decoration:none;color:inherit;margin-bottom:7px}',
      '.dds-feature-title:hover{text-decoration:underline}',
      '.dds-feature-meta{font-size:11.5px;opacity:.5;margin-bottom:16px}',
      '.dds-feature-body{font-size:14px;line-height:1.95}',
      '.dds-feature-body p{margin:0 0 14px}',
      /* 맨 위 글 사진이 너무 커서 아래 목록이 안 보이는 걸 막는다 */
      '.dds-feature-body img{max-width:100%;max-height:420px;width:auto;height:auto;',
      '  display:block;margin:0 0 14px;object-fit:contain}',
      '.dds-feature-body h1,.dds-feature-body h2,.dds-feature-body h3{line-height:1.45;margin:22px 0 10px}',
      '.dds-feature-body pre{overflow:auto;padding:10px 12px;background:rgba(127,127,127,.12)}',
      '.dds-feature-body blockquote{margin:0 0 14px;padding-left:12px;',
      '  border-left:3px solid rgba(127,127,127,.35);opacity:.85}',
      '.dds-feature-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;font-size:11.5px}',
      '.dds-feature-tags a{text-decoration:none;color:inherit;opacity:.7}',
      '.dds-feature-sep{display:flex;align-items:center;gap:10px;margin:26px 0 2px}',
      '.dds-feature-sep span{font-size:11.5px;opacity:.5;letter-spacing:.04em}',
      '.dds-feature-sep i{flex:1;height:1px;background:var(--dds-face-shadow,#d9dcd1);opacity:.6}',
      '@media (max-width:620px){',
      '  .dds-row .dds-row-thumb,.dds-row .dds-row-noimg{width:76px;height:56px}',
      '  .dds-row .category-list-link,.dds-row .category-list-name{gap:11px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* 손님에게는 「카테고리 설정」 줄을 아예 안 보여준다.
     눌러도 "관리자 권한이 없습니다" 만 나오는 죽은 메뉴라 있을 이유가 없다. */
  function hideCatSettings() {
    if (isOwner()) return;
    var rows = document.querySelectorAll('.cat-tree-list li, .cat-tree-list a, .cat-tree-list button');
    for (var i = 0; i < rows.length; i++) {
      var t = (rows[i].textContent || '').trim();
      if (t === '카테고리 설정' && !rows[i].hidden) rows[i].hidden = true;
    }
  }

  function initList() {
    listStyle();
    hideCatSettings();
    dressList();
    var mo = new MutationObserver(function () { hideCatSettings(); dressList(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 프로필 창 ────────────────────────────────────────────────────────
     스킨은 프로필 창에 공지 글들을 "제목 목록"으로 그린다. 눌러야 내용이 나온다.
     자기소개 페이지처럼 글 하나가 통째로 펼쳐지는 게 나아서, 목록 대신
     render.js 가 정해준 글(window.DDS_PROFILE)의 본문을 그대로 채운다.
     정해진 글이 없으면 스킨이 그린 목록을 그대로 둔다. */
  function profileStyle() {
    if (document.getElementById('dds-prof-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-prof-style';
    s.textContent = [
      '.dds-prof{padding:2px 2px 6px}',
      '.dds-prof-title{font-size:19px;font-weight:600;line-height:1.45;margin:0 0 6px}',
      '.dds-prof-date{font-size:11.5px;opacity:.5;margin:0 0 16px}',
      '.dds-prof-body{font-size:14px;line-height:1.95}',
      '.dds-prof-body p{margin:0 0 14px}',
      '.dds-prof-body img{max-width:100%;height:auto;display:block;margin:0 0 14px}',
      '.dds-prof-body h1,.dds-prof-body h2,.dds-prof-body h3{line-height:1.45;margin:20px 0 10px}',
      '.dds-prof-body pre{overflow:auto;padding:10px 12px;background:rgba(127,127,127,.12)}',
      '.dds-prof-body blockquote{margin:0 0 14px;padding-left:12px;',
      '  border-left:3px solid rgba(127,127,127,.35);opacity:.85}',
      '.dds-prof-more{display:inline-block;margin-top:8px;font-size:12px;opacity:.6}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function fillProfile() {
    var f = null;
    try { f = window.DDS_PROFILE || null; } catch (e) {}
    if (!f || !f.html) return;
    var wins = document.querySelectorAll('.win');
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i];
      var t = w.querySelector('.win-title');
      if (!t || (t.textContent || '').trim() !== '프로필') continue;
      var body = w.querySelector('.win-body');
      if (!body) continue;
      /* 스킨이 공지 목록을 다 불러온 뒤 우리 내용을 덮어쓰기 때문에,
         한 번만 바꾸지 않고 우리 내용이 없어졌을 때마다 다시 채운다.
         이미 있으면 아무것도 안 하므로 무한 반복되지 않는다. */
      if (body.querySelector('.dds-prof')) continue;

      var box = document.createElement('div');
      box.className = 'dds-prof';
      var h = document.createElement('p');
      h.className = 'dds-prof-title';
      h.textContent = f.title || '';
      var d = document.createElement('p');
      d.className = 'dds-prof-date';
      d.textContent = f.date || '';
      var bd = document.createElement('div');
      bd.className = 'dds-prof-body';
      bd.innerHTML = f.html;
      var more = document.createElement('a');
      more.className = 'dds-prof-more';
      more.href = f.link;
      more.textContent = '글로 보기 ▸';
      box.append(h, d, bd, more);

      body.textContent = '';
      body.appendChild(box);
    }
  }

  function initProfile() {
    profileStyle();
    fillProfile();
    var mo = new MutationObserver(function () { fillProfile(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ====================================================================== */
  /*  블로그 창 안에서 글쓰기 — 관리 화면으로 나가지 않아도 되게                  */
  /*  주인에게만 보인다. 손님 화면에는 버튼도 창도 안 만들어진다.                 */
  /* ====================================================================== */
  var edOpen = false;

  function editorStyle() {
    if (document.getElementById('dds-ed-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-ed-style';
    s.textContent = [
      '.dds-write{margin-left:8px}',
      '.dds-ed{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;',
      '  background:var(--dds-win-bg,#f1f3ea)}',
      '.dds-ed-head{display:flex;align-items:center;gap:8px;padding:9px 14px;',
      '  border-bottom:1px solid var(--dds-face-shadow,#d9dcd1);flex:none}',
      '.dds-ed-head .t{font-family:var(--dds-font-pixel,monospace);font-size:13px;margin-right:auto}',
      '.dds-ed-body{flex:1;min-height:0;overflow:auto;padding:14px 16px;display:flex;',
      '  flex-direction:column;gap:10px}',
      '.dds-ed-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.dds-ed-in{padding:7px 9px;border:1px solid var(--dds-face-dark,#131313);',
      '  background:var(--dds-face-light,#fff);color:var(--dds-win-fg,#23261f);',
      '  box-shadow:var(--dds-surface-sunken,none);font:inherit;font-size:13px;border-radius:0}',
      '.dds-ed-title{flex:1;min-width:220px;font-size:15px;font-weight:600}',
      '.dds-ed-cat{width:150px}',
      '.dds-ed-tags{width:190px}',
      '.dds-ed-text{flex:1;min-height:260px;resize:vertical;line-height:1.8;font-size:13.5px;',
      '  font-family:inherit}',
      '.dds-ed-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.dds-ed-hint{font-size:11.5px;opacity:.55;line-height:1.6}',
      '.dds-ed-foot{display:flex;align-items:center;gap:12px;padding:10px 16px;flex:none;',
      '  border-top:1px solid var(--dds-face-shadow,#d9dcd1)}',
      '.dds-ed-foot label{display:flex;align-items:center;gap:5px;font-size:12.5px}',
      '.dds-ed-msg{margin-left:auto;font-size:12px;opacity:.7}',
      '.dds-ed-save{font-weight:600}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function cats() {
    var out = [];
    try {
      var m = window.DDS_POST_META || {};
      for (var k in m) if (m[k].c && out.indexOf(m[k].c) === -1) out.push(m[k].c);
    } catch (e) {}
    out.sort();
    return out;
  }

  /* post = 고칠 글 (없으면 새 글) */
  function openEditor(host, post) {
    if (edOpen) return;
    edOpen = true;
    editorStyle();
    post = post || {};

    var wrap = document.createElement('div');
    wrap.className = 'dds-ed';

    var head = document.createElement('div');
    head.className = 'dds-ed-head';
    head.innerHTML = '<span class="t">' + (post.id ? '글 고치기' : '새 글 쓰기') + '</span>';
    var close = document.createElement('button');
    close.type = 'button'; close.className = 'dds-btn'; close.textContent = '닫기';
    head.appendChild(close);

    var body = document.createElement('div');
    body.className = 'dds-ed-body';

    var r1 = document.createElement('div'); r1.className = 'dds-ed-row';
    var title = document.createElement('input');
    title.className = 'dds-ed-in dds-ed-title'; title.placeholder = '제목';
    title.value = post.title || '';
    var cat = document.createElement('input');
    cat.className = 'dds-ed-in dds-ed-cat'; cat.placeholder = '카테고리';
    cat.value = post.category || '';
    cat.setAttribute('list', 'dds-ed-cats');
    var dl = document.createElement('datalist'); dl.id = 'dds-ed-cats';
    cats().forEach(function (c) { var o = document.createElement('option'); o.value = c; dl.appendChild(o); });
    var tags = document.createElement('input');
    tags.className = 'dds-ed-in dds-ed-tags'; tags.placeholder = '태그, 쉼표로';
    tags.value = (post.tags || []).join(', ');
    r1.append(title, cat, dl, tags);

    var tools = document.createElement('div');
    tools.className = 'dds-ed-tools';
    var mdBtns = [['## ', '제목'], ['**', '굵게'], ['> ', '인용'], ['- ', '목록']];
    var text = document.createElement('textarea');
    text.className = 'dds-ed-in dds-ed-text';
    text.placeholder = '내용을 적어. 마크다운으로 써도 되고 그냥 써도 돼.';
    text.value = post.body_md || '';

    function wrapSel(mark) {
      var a = text.selectionStart, b = text.selectionEnd;
      var sel = text.value.slice(a, b);
      var ins = mark === '**' ? '**' + (sel || '굵게') + '**' : mark + (sel || '');
      text.value = text.value.slice(0, a) + ins + text.value.slice(b);
      text.focus();
      text.selectionStart = text.selectionEnd = a + ins.length;
    }
    mdBtns.forEach(function (m) {
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'dds-btn'; x.textContent = m[1];
      x.addEventListener('click', function () { wrapSel(m[0]); });
      tools.appendChild(x);
    });
    var imgBtn = document.createElement('button');
    imgBtn.type = 'button'; imgBtn.className = 'dds-btn'; imgBtn.textContent = '🖼 사진 넣기';
    imgBtn.addEventListener('click', function () {
      pickFile(function (files) {
        var list = files && files.length !== undefined && !files.name ? files : [files];
        imgBtn.disabled = true; imgBtn.textContent = '올리는 중…';
        var fd = new FormData();
        for (var i = 0; i < list.length; i++) fd.append('files', list[i]);
        /* 글 본문 사진이라 갤러리에는 안 쌓인다 */
        post0('/api/uploads?purpose=post', fd)
          .then(function (j) {
            var ins = (j.items || []).map(function (x) {
              return '![' + String(x.orig_name || '').replace(/\.[^.]+$/, '') + '](' + x.path + ')';
            }).join('\n');
            var a = text.selectionStart;
            text.value = text.value.slice(0, a) + '\n' + ins + '\n' + text.value.slice(a);
            imgBtn.disabled = false; imgBtn.textContent = '🖼 사진 넣기';
          })
          .catch(function (e) {
            imgBtn.disabled = false; imgBtn.textContent = '🖼 사진 넣기';
            note('사진 못 넣었어 — ' + e.message);
          });
      }, true);
    });
    tools.appendChild(imgBtn);

    var hint = document.createElement('div');
    hint.className = 'dds-ed-hint';
    hint.textContent = '카테고리는 새로 적으면 그대로 생겨. 「기록/메모」처럼 슬래시를 쓰면 하위 카테고리가 돼.';

    body.append(r1, tools, text, hint);

    var foot = document.createElement('div');
    foot.className = 'dds-ed-foot';
    var lNotice = document.createElement('label');
    var cNotice = document.createElement('input'); cNotice.type = 'checkbox';
    cNotice.checked = !!post.is_notice;
    lNotice.append(cNotice, document.createTextNode('공지'));
    var lPriv = document.createElement('label');
    var cPriv = document.createElement('input'); cPriv.type = 'checkbox';
    cPriv.checked = post.visibility === 'private';
    lPriv.append(cPriv, document.createTextNode('비공개'));
    var msg = document.createElement('span'); msg.className = 'dds-ed-msg';
    var save = document.createElement('button');
    save.type = 'button'; save.className = 'dds-btn dds-ed-save';
    save.textContent = post.id ? '고치기' : '올리기';
    foot.append(lNotice, lPriv, msg, save);

    function shut() { edOpen = false; wrap.remove(); }
    close.addEventListener('click', function () {
      if (title.value.trim() || text.value.trim()) {
        if (!window.confirm('쓰던 걸 버리고 닫을까?')) return;
      }
      shut();
    });

    save.addEventListener('click', function () {
      if (!title.value.trim() && !text.value.trim()) { msg.textContent = '제목이나 내용을 적어줘'; return; }
      save.disabled = true; msg.textContent = '저장하는 중…';
      var data = {
        title: title.value,
        category: cat.value,
        body_md: text.value,
        tags: tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
        visibility: cPriv.checked ? 'private' : 'public',
        is_notice: cNotice.checked ? 1 : 0
      };
      fetch(post.id ? '/api/posts/' + post.id : '/api/posts', {
        method: post.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
        .then(function () {
          msg.textContent = '저장했어. 다시 그리는 중…';
          setTimeout(function () { location.reload(); }, 400);
        })
        .catch(function (e) { save.disabled = false; msg.textContent = '못 저장했어 — ' + e.message; });
    });

    wrap.append(head, body, foot);
    host.appendChild(wrap);
    setTimeout(function () { try { title.focus(); } catch (e) {} }, 60);
  }

  /* post() 는 이미 있는 이름이라 겹치지 않게 하나 더 둔다 */
  function post0(url, form) { return post(url, form); }

  /* 「＋ 새 글 쓰기」 버튼을 블로그 창 위쪽 줄에 붙인다 */
  function addWriteButton() {
    var bars = document.querySelectorAll('.post-browser-bar');
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      if (bar.querySelector('.dds-write')) continue;
      var main = bar.closest ? bar.closest('.post-browser-main') : null;
      if (!main) continue;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dds-btn dds-write';
      b.textContent = '＋ 새 글';
      b.title = '블로그 창 안에서 바로 글을 써';
      (function (host) {
        b.addEventListener('click', function () { openEditor(host, null); });
      })(main);
      var modes = bar.querySelector('.post-browser-modes');
      if (modes) bar.insertBefore(b, modes); else bar.appendChild(b);
    }
  }

  /* 맨 위에 펼쳐 놓은 글의 ⋯ 메뉴 — 수정 / 고정 / 비공개 / 삭제 */
  function addFeatureMenu() {
    var arts = document.querySelectorAll('.dds-feature');
    for (var i = 0; i < arts.length; i++) {
      var art = arts[i];
      if (art.querySelector('.dds-dots')) continue;
      var f = window.DDS_FEATURED || {};
      var id = Number(String(f.link || '').replace(/\D/g, ''));
      if (!id) continue;
      art.style.position = 'relative';

      var dots = document.createElement('button');
      dots.type = 'button'; dots.className = 'dds-btn dds-dots'; dots.textContent = '⋯';
      dots.style.cssText = 'position:absolute;right:0;top:0;padding:2px 8px';

      var menu = document.createElement('div');
      menu.className = 'dds-dotmenu';
      menu.hidden = true;
      menu.style.cssText = 'position:absolute;right:0;top:26px;z-index:40;min-width:140px;' +
        'background:var(--dds-face-light,#fff);border:1px solid var(--dds-face-dark,#131313);' +
        'box-shadow:3px 3px 0 rgba(0,0,0,.18)';

      var host = art.closest('.post-browser-main');
      var pinned = f.pinnedNow;
      var items = [
        ['수정', function () {
          menu.hidden = true;
          fetch('/api/posts/' + id, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (p) { openEditor(host, p); })
            .catch(function () { note('글을 못 불러왔어'); });
        }],
        [pinned ? '맨 위에서 내리기' : '맨 위에 고정', function () {
          menu.hidden = true;
          fetch('/api/board/pinned', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: pinned ? 0 : id }), credentials: 'same-origin'
          }).then(function () { location.reload(); });
        }],
        ['비공개로 전환', function () {
          menu.hidden = true;
          fetch('/api/posts/' + id + '/visibility', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}), credentials: 'same-origin'
          }).then(function () { location.reload(); });
        }],
        ['삭제', function () {
          menu.hidden = true;
          if (!window.confirm('이 글을 지울까? 되돌릴 수 없어.')) return;
          fetch('/api/posts/' + id, { method: 'DELETE', credentials: 'same-origin' })
            .then(function () { location.reload(); });
        }]
      ];
      items.forEach(function (it) {
        var x = document.createElement('button');
        x.type = 'button';
        x.textContent = it[0];
        x.style.cssText = 'display:block;width:100%;text-align:left;padding:7px 11px;border:0;' +
          'background:transparent;font:inherit;font-size:12.5px;color:inherit;cursor:pointer';
        x.addEventListener('click', it[1]);
        menu.appendChild(x);
      });

      dots.addEventListener('click', function (ev) {
        ev.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      document.addEventListener('click', function () { menu.hidden = true; });

      art.append(dots, menu);
    }
  }

  function initWrite() {
    addWriteButton();
    addFeatureMenu();
    var mo = new MutationObserver(function () { addWriteButton(); addFeatureMenu(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ── 블로그 창 자동으로 열기 ─────────────────────────────────────────── */
  function autoOpenBlog(tries) {
    try { if (sessionStorage.getItem('bridge:opened') === '1') return; } catch (e) {}
    var host = document.getElementById('desktop-icons');
    if (!host) {
      if ((tries || 0) > 40) return;
      setTimeout(function () { autoOpenBlog((tries || 0) + 1); }, 250);
      return;
    }
    var icons = host.querySelectorAll('.desktop-icon');
    for (var i = 0; i < icons.length; i++) {
      var l = icons[i].querySelector('.desktop-icon-label');
      if (l && (l.textContent || '').trim() === '블로그') {
        try { sessionStorage.setItem('bridge:opened', '1'); } catch (e) {}
        icons[i].click();
        return;
      }
    }
    if ((tries || 0) <= 40) setTimeout(function () { autoOpenBlog((tries || 0) + 1); }, 250);
  }

  /* ── 시작 ────────────────────────────────────────────────────────────── */
  function start() {
    initProfile();
    initList();
    initCaption();
    guestbookStyle();
    initGuestbook();
    if (isOwner()) initPostManage();
    baseStyle();
    gateStyle();
    initIcons();
    loginGate();
    loginButton();
    autoOpenBlog();
    if (isOwner()) initOwner();
    if (isOwner()) initWrite();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
