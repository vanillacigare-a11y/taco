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

  /* 지금 도는 게 어느 판인지 바로 알 수 있게. 콘솔에 찍히고, 로그인 표시에 마우스를 올리면 보인다. */
  var BRIDGE_VERSION = 'v0.20.0';
  try { console.log('[블로그] 편집 도구 ' + BRIDGE_VERSION); } catch (e) {}

  /* 한 군데가 터져도 나머지가 같이 죽지 않게 감싼다.
     (작업표시줄 버튼이 사라지거나 카테고리가 안 보이던 것들이 이런 사고였다) */
  var failed = {};
  function safe(name, fn) {
    return function () {
      try { return fn.apply(null, arguments); }
      catch (e) {
        if (!failed[name]) {
          failed[name] = String(e && e.message || e);
          try { console.error('[블로그] ' + name + ' 실패:', e); } catch (x) {}
        }
      }
    };
  }
  function watch(name, fn, target, opts) {
    var f = safe(name, fn);
    f();
    try {
      new MutationObserver(f).observe(target || document.body, opts || { childList: true, subtree: true });
    } catch (e) {}
    return f;
  }

  var P = 'dds:';
  var GAP = 8;                 // 아이콘 격자 간격
  var DRAG_SLOP = 4;           // 이만큼 움직여야 "끌기"로 본다

  /* 저장하지 않는 값들 — 캐시거나 잠깐 쓰는 것들.
     layoutSlot 은 「지금 어느 화면을 입고 있나」를 적어두는 칸인데,
     이걸 서버에 담아 모두에게 뿌리면 손님이 고른 것도, 주인이 정한 기본값도
     전부 이 값에 눌린다. 화면 고르기는 board:slot(주인) 과
     그 사람 브라우저(손님)가 맡으니 여기서는 뺀다. */
  function skip(k) {
    return k === 'booted' ||
      k === 'layoutSlot' ||
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

        /* 스티커·위젯 배치가 바뀌었으면 거기까지 마저 저장한다.
           (그쪽은 저장이 끝나면 화면을 다시 불러온다) */
        if (decoDirty) {
          note('화면까지 저장하는 중…');
          saveDecoration(function (told) {
            decoDirty = false;
            if (!told) note('화면은 못 저장했어 — 슬롯 창에서 다시 해봐');
          });
          return;
        }
        note('저장했어. 이제 손님 화면에도 이렇게 보여');
      })
      .catch(function (e) { paint(); note('저장 실패 — ' + e.message); });
  }

  /* ── 꾸미기(스티커·위젯 배치)까지 「저장」 하나로 ──────────────────────
     스킨은 꾸미기를 「슬롯」에 담는데, 그 담기는 편집 모드에서 저장을 눌러야만 일어난다.
     그래서 갤러리에서 사진을 스티커로 붙여 놓고 작업표시줄 저장을 눌러도
     스티커는 아무 데도 안 들어가고, 새로고침하면 사라졌다.

     이제 화면이 바뀌면 저장 버튼이 켜지고, 누르면 편집 모드를 거쳐
     지금 적용 중인 슬롯에 덮어쓴다 (사람이 하던 순서를 그대로 대신 밟는다). */
  var decoDirty = false;
  var decoBase = null;

  function inEditMode() { return !!document.querySelector('.dds-editbar'); }

  /* 화면이 바뀌었는지 보는 지문 — 스티커 자리·그림, 창 자리·크기.
     스킨도 이 둘을 슬롯에 담는다. */
  function decoSig() {
    var out = [];
    try {
      var st = document.querySelectorAll('.sticker-global');
      for (var i = 0; i < st.length; i++) {
        var e = st[i];
        var im = e.querySelector('img');
        out.push('s|' + e.style.left + ',' + e.style.top + ',' + (e.style.width || '') +
                 ',' + (im ? im.getAttribute('src') : '') +
                 ',' + (e.textContent || '').trim().slice(0, 24));
      }
      var wins = document.querySelectorAll('.win');
      for (var k = 0; k < wins.length; k++) {
        var w = wins[k];
        if (w.classList.contains('dds-tt-win')) continue;      /* 우리가 띄운 쪽지창은 뺀다 */
        var t = w.querySelector('.win-title');
        var name = ((t && t.textContent) || '').trim();
        if (name === '슬롯' || name === '꾸미기 저장') continue;
        out.push('w|' + name + ',' + w.style.left + ',' + w.style.top +
                 ',' + w.style.width + ',' + w.style.height);
      }
    } catch (e) {}
    return out.sort().join('\n');
  }

  function watchDeco() {
    /* 들어올 때 스킨이 화면을 그리는 것까지 「바뀐 것」으로 세면
       아무것도 안 했는데 저장 버튼이 켜진다. 자리잡은 뒤부터 본다. */
    setTimeout(function () {
      decoBase = decoSig();
      setInterval(function () {
        if (inEditMode()) return;          /* 편집 모드에선 스킨이 알아서 챙긴다 */
        var now = decoSig();
        if (now === decoBase) return;
        decoBase = now;
        decoDirty = true;
        markDirty();
      }, 1500);
    }, 3000);
  }

  /* 한 단계씩 기다렸다 누르는 작은 도우미.
     seen=true 면 「보이는 것」까지 기다리고, false 면 있기만 하면 된다
     (편집 바의 저장 버튼은 우리가 일부러 숨겨놨으니 보이지 않는다). */
  function waitFor(sel, ms, ok, fail, seen) {
    var end = Date.now() + (ms || 6000);
    (function look() {
      var el = document.querySelector(sel);
      if (el && (seen === false || el.offsetParent !== null)) { ok(el); return; }
      if (Date.now() > end) { fail && fail(); return; }
      setTimeout(look, 120);
    })();
  }

  /* 슬롯 창 → 편집 모드 → 저장, 을 대신 눌러준다.
     저장이 끝나면 slotReflect() 가 서버로 보내고 화면을 다시 불러온다. */
  function saveDecoration(giveUp) {
    document.documentElement.classList.add('dds-quiet-slot');   /* 그 사이 창들은 안 보이게 */
    var stop = function (told) {
      document.documentElement.classList.remove('dds-quiet-slot');
      giveUp(told);
    };
    if (inEditMode()) {
      waitFor('.dds-editbar-apply', 4000, function (b) { b.click(); }, stop, false);
      return;
    }
    var bar = document.getElementById('taskbar');
    var slotBtn = null;
    var qs = bar ? bar.querySelectorAll('.taskbar-quick') : [];
    for (var i = 0; i < qs.length; i++) {
      if (/슬롯/.test(qs[i].getAttribute('title') || '')) { slotBtn = qs[i]; break; }
    }
    if (!slotBtn) { stop(); return; }
    slotBtn.click();

    waitFor('.slot-gallery', 5000, function (g) {
      /* 슬롯이 하나도 없으면 담을 데가 없다 — 만들어 달라고 하고 창은 열어둔다 */
      if (!g.querySelector('.dds-card[data-slot-name]')) {
        document.documentElement.classList.remove('dds-quiet-slot');
        note('화면을 저장하려면 슬롯이 하나 필요해 — ＋ 로 하나 만들어줘');
        giveUp(true);
        return;
      }
      var edit = null;
      var bs = g.querySelectorAll('button');
      for (var k = 0; k < bs.length; k++) {
        if (/슬롯 편집하기|화면 만들기/.test(bs[k].textContent || '')) { edit = bs[k]; break; }
      }
      if (!edit) { stop(); return; }
      edit.click();
      waitFor('.dds-editbar-apply', 6000, function (b) { b.click(); }, stop, false);
    }, stop);
  }

  /* 아직 저장 안 한 바탕화면 상태(아이콘 자리 등)가 있으면 먼저 보내고 나서 다음 일을 한다.
     꾸미기를 저장하고 화면을 다시 불러올 때, 그 사이에 아이콘 자리가 날아가지 않게. */
  function saveDesktopThen(cb) {
    if (!dirty) { cb(); return; }
    fetch('/api/desktop', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot()),
      credentials: 'same-origin'
    }).then(cb, cb);
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

  /* 작업표시줄에서 우리 버튼이 들어갈 자리.
     .taskbar-quick 은 연필(새 글쓰기) 「버튼」이라 그 안에 넣으면 버튼 속에 버튼이 박혀 안 보인다.
     제대로 된 자리는 .taskbar-quick-slot 이라는 「칸」이다. */
  function quickSlot() {
    var bar = document.getElementById('taskbar');
    if (!bar) return null;
    return bar.querySelector('.taskbar-quick-slot') ||
           bar.querySelector('.taskbar-right') || bar;
  }

  function initSaveButton() {
    /* 스킨이 작업표시줄을 다시 그리면 우리 버튼이 같이 지워진다.
       한 번만 넣지 말고, 없어질 때마다 다시 넣는다. */
    watch('저장 버튼', function () {
      var slot = quickSlot();
      if (!slot) return;
      if (slot.querySelector('#dds-save')) return;
      makeSaveButtons(slot);
    });
  }

  function makeSaveButtons(quick) {
      var old = document.getElementById('dds-save');
      if (old) old.remove();
      var oldU = document.getElementById('dds-undo');
      if (oldU) oldU.remove();
      btns = [];

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

      /* 연필(새 글쓰기) 왼쪽에 몰아둔다 */
      var pencil = quick.querySelector('.taskbar-quick');
      if (pencil) { quick.insertBefore(u, pencil); quick.insertBefore(b, pencil); }
      else { quick.appendChild(u); quick.appendChild(b); }
      undoBtn = u;
      btns.push(b);
      paint();
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
      onEach(node, '.dds-editbar', editBar);
      onEach(node, '.slot-reflect', slotReflect);
      onEach(node, '.slot-gallery', slotWording);
      slotWordsAround();
    };
    scan(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var add = ms[i].addedNodes;
        for (var j = 0; j < add.length; j++) scan(add[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* 편집 모드 위쪽 줄 — 저장은 작업표시줄 하나로 몰았으니 여기선 감춘다.
     (감추기만 하고 지우지는 않는다 — 우리가 대신 눌러야 하니까.)
     「임시 저장」은 아예 없앤다. 이게 남아 있으면 새로고침할 때
     저장한 화면이 아니라 임시본이 되살아난다. */
  function editBar(bar) {
    if (bar.dataset.ddsBar) return;
    bar.dataset.ddsBar = '1';
    var bs = bar.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var t = (bs[i].textContent || '').trim();
      if (bs[i].classList.contains('dds-editbar-apply')) {
        bs[i].classList.add('dds-hidden-save');       /* 우리가 눌러야 해서 남겨둔다 */
      } else if (t === '임시 저장') {
        bs[i].hidden = true;
      }
    }
  }

  /* ── 슬롯(꾸미기) 저장 ─────────────────────────────────────────────────
     스킨은 티스토리 시절 방식이라, 저장을 누르면 「게시글에 반영」 창이 뜨고
     거기 나온 코드를 손으로 복사해서 슬롯 게시글에 붙여넣으라고 안내한다.

     우리 서버에는 그 글을 대신 고쳐주는 길(/api/slot)이 있으니,
     창에 코드가 만들어지는 순간 우리가 받아서 그대로 보내버린다.
     사람이 할 일은 「저장」을 누르는 것뿐이고, 손님 화면에도 바로 반영된다. */
  function slotReflect(box) {
    if (box.dataset.ddsSlot) return;

    var code = box.querySelector('.slot-reflect-code');
    if (!code) {                       /* 아직 코드가 안 만들어졌으면 생길 때까지 본다 */
      if (box.dataset.ddsSlotWait) return;
      box.dataset.ddsSlotWait = '1';
      try {
        new MutationObserver(function () { slotReflect(box); })
          .observe(box, { childList: true, subtree: true });
      } catch (e) {}
      return;
    }
    box.dataset.ddsSlot = '1';
    slotWords(box);

    /* 손으로 붙여넣으라는 안내는 이제 필요 없다 */
    var steps = box.querySelector('.slot-reflect-steps');
    if (steps) steps.remove();
    var copy = box.querySelector('.slot-reflect-copy, .slot-reflect-actions');
    if (copy) copy.remove();
    code.hidden = true;

    var say = document.createElement('p');
    say.className = 'dds-slot-msg';
    say.style.cssText = 'margin:12px 0 0;font-size:12.5px;line-height:1.7';
    say.textContent = '저장하는 중…';
    box.appendChild(say);

    var text = code.value || '';
    if (!text.trim() || text === '(본문 비우기)') {
      say.textContent = '저장할 꾸미기가 없어. 슬롯을 하나 만들고 다시 눌러줘.';
      return;
    }

    fetch('/api/slot', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text }),
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
      .then(function () {
        say.textContent = '저장했어. 화면을 다시 불러올게 — 슬롯 카드에도 바로 반영돼.';
        note('꾸미기를 저장했어');

        /* 스킨은 원래 「코드를 붙여넣고 → 새로고침」 하는 흐름이라,
           저장했다고 해서 자기 안에 들고 있던 편집본을 지우지 않는다.
           그래서 그냥 두면 카드는 계속 「아직 저장 안 함」이고, 카드를 눌러도
           서버에 저장된 게 아니라 편집본이 나오고, 새로고침하면 임시본이 되살아난다.

           저장이 끝났으면 임시본을 지우고 화면을 다시 불러온다 —
           그러면 카드도 슬롯 내용도 전부 방금 저장한 것에서 다시 읽힌다. */
        try { localStorage.removeItem('dds:slot-draft'); } catch (e) {}

        saveDesktopThen(function () {
          dirty = false;                       /* 나갈 때 「저장 안 했는데?」 안 뜨게 */
          try { sessionStorage.removeItem(DIRTY_KEY); } catch (e) {}
          setTimeout(function () { location.reload(); }, 900);
        });
      })
      .catch(function (e) {
        say.textContent = '못 저장했어 — ' + e.message + '\n아래 코드를 슬롯 게시글에 붙여넣으면 손으로도 돼.';
        code.hidden = false;
      });
  }

  /* 슬롯 안내문 — 티스토리 시절 문구를 우리 방식으로 바꾼다.
     스킨은 "코드를 게시글 본문에 붙여넣어라"를 전제로 쓰여 있는데,
     이제 저장이 자동이라 그대로 두면 헷갈린다.
     긴 문장부터 먼저 바꿔야 짧은 조각(「게시글에 반영」)에 먼저 걸려 안 망가진다. */
  var SLOT_WORDS = [
    ['카드를 누르면 그 슬롯이 바로 적용됩니다. 바꾼 것은 이 탭에서만 유지되고 새로고침하면 원래대로 돌아옵니다.',
     '카드를 누르면 그 화면으로 갈아입어. 네 화면에서만 바뀌고, 다음에 와도 고른 대로 떠.'],
    ['카드를 누르면 그 슬롯이 바로 적용됩니다.',
     '카드를 누르면 그 화면으로 갈아입어.'],
    ['바꾼 것은 이 탭에서만 유지되고 새로고침하면 원래대로 돌아옵니다.',
     '네 화면에서만 바뀌고, 다음에 와도 고른 대로 떠.'],
    ['추가·갱신·삭제는 화면에서만 쌓이고 「게시글에 반영」 한 번으로 들어갑니다.',
     '추가·갱신·삭제는 화면에서만 쌓이고, 「저장」 한 번으로 서버에 들어가.'],
    ['슬롯은 2023년 이후 브라우저에서만 읽힙니다 — 그 이전 브라우저로 방문하면 꾸미기 없이 기본 상태로 보입니다.',
     '저장하면 손님 화면에도 그대로 보여.'],
    ['지금은 보기와 전환만 됩니다. 삭제·새 슬롯·저장은 「슬롯 편집하기」를 눌러야 열립니다.',
     '지금은 보기와 전환만 돼. 삭제·새 슬롯·저장은 「슬롯 편집하기」를 눌러야 열려.'],
    ['저장된 슬롯이 없습니다. 슬롯 게시글에 코드를 저장한 뒤 새로고침해주세요.',
     '저장된 꾸미기가 없어. 「슬롯 편집하기」로 화면을 꾸미고 저장하면 여기 쌓여.'],
    ['본문을 통째로 교체하므로 슬롯 이름을 직접 적을 일이 없습니다.',
     '슬롯 이름은 저장할 때 알아서 들어가.'],
    ['카드의 번호가 본문에 적히는 순서와 같습니다.', '카드에 붙은 번호 순서대로 저장돼.'],
    ['변경됨 — 게시글 업데이트 필요', '변경됨 — 아직 저장 안 함'],
    ['새 슬롯 — 아직 게시글에 없음', '새 슬롯 — 아직 저장 안 함'],
    ['게시글 저장 필요', '아직 저장 안 함'],
    ['게시글과 같음', '저장돼 있음'],
    ['바뀐 것이 없습니다 — 게시글과 같은 내용입니다.', '바뀐 것이 없어 — 저장된 것과 같아.'],
    ['게시글에 반영', '꾸미기 저장']
  ];

  function slotWords(root) {
    if (!root) return;
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var hits = [], n;
    while ((n = walk.nextNode())) hits.push(n);
    for (var i = 0; i < hits.length; i++) {
      var t = hits[i].nodeValue;
      if (!/게시글|본문|슬롯은 2023|보기와 전환만|이 탭에서만|카드를 누르면 그 슬롯/.test(t)) continue;
      for (var k = 0; k < SLOT_WORDS.length; k++) {
        if (t.indexOf(SLOT_WORDS[k][0]) !== -1) t = t.split(SLOT_WORDS[k][0]).join(SLOT_WORDS[k][1]);
      }
      if (t !== hits[i].nodeValue) hits[i].nodeValue = t;
    }
  }

  function slotWording(g) {
    if (g.dataset.ddsWord) return;
    g.dataset.ddsWord = '1';
    var fix = function () { slotWords(g); slotShape(g); };
    fix();
    try { new MutationObserver(fix).observe(g, { childList: true, subtree: true }); } catch (e) {}
  }

  /* 슬롯 창을 「찍어둔 화면 보관함」으로 손본다.
     저장은 작업표시줄 하나로 몰았으니, 여기 있던 저장 버튼과
     「아직 저장 안 함」 같은 표시는 이제 뜻이 없다. */
  function slotShape(g) {
    /* 창 아래 저장 버튼 — 작업표시줄 저장이 대신한다 */
    var foot = g.querySelector('.slot-gallery-foot');
    if (foot) {
      var bs = foot.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) {
        if (/저장/.test(bs[i].textContent || '')) bs[i].hidden = true;
      }
    }
    /* 저장 상태 범례 — 항상 저장된 상태라 볼 것이 없다 */
    var leg = g.querySelector('.slot-legend');
    if (leg) leg.hidden = true;

    /* 「슬롯 편집하기」는 이제 저장이랑 상관없다 — 만들고 지우는 곳이다 */
    var mk = g.querySelectorAll('button');
    for (var m = 0; m < mk.length; m++) {
      if ((mk[m].textContent || '').trim() === '슬롯 편집하기') {
        mk[m].textContent = '＋ 화면 만들기 · 지우기';
        mk[m].title = '지금 화면을 새 슬롯으로 담거나, 안 쓰는 걸 지워';
      }
    }

    /* 손님한테는 만들기·지우기가 필요 없다 */
    if (!isOwner()) {
      var all = g.querySelectorAll('button');
      for (var k = 0; k < all.length; k++) {
        if (/슬롯 편집하기|화면 만들기/.test(all[k].textContent || '')) all[k].hidden = true;
      }
      var add = g.querySelector('.dds-card-add');
      if (add) add.hidden = true;
    }

    /* 손님이 자기가 고른 걸 물리고 주인이 정한 화면으로 돌아오는 길 */
    if (!isOwner()) {
      var mine = '';
      try { mine = localStorage.getItem(SLOT_PICK) || ''; } catch (e) {}
      var back = g.querySelector('.dds-slot-reset');
      if (mine && !back) {
        back = document.createElement('button');
        back.type = 'button';
        back.className = 'dds-btn dds-slot-reset';
        back.textContent = '기본 화면으로';
        back.title = '주인이 정해둔 화면으로 되돌려';
        back.style.cssText = 'margin-top:8px';
        back.addEventListener('click', function () {
          try { localStorage.removeItem(SLOT_PICK); } catch (e) {}
          location.reload();
        });
        var gd0 = g.querySelector('.dds-guide');
        if (gd0 && gd0.parentNode) gd0.parentNode.insertBefore(back, gd0.nextSibling);
        else g.appendChild(back);
      } else if (!mine && back) {
        back.remove();
      }
    }

    /* 안내문을 한 줄로 다시 쓴다 */
    var gd = g.querySelector('.dds-guide');
    if (gd && !gd.dataset.ddsSaid) {
      gd.dataset.ddsSaid = '1';
      gd.textContent = isOwner()
        ? '카드를 누르면 그 화면으로 갈아입어. 손님도 여기서 갈아입을 수 있고, 지금 고른 게 손님이 처음 볼 화면이야. 꾸민 걸 담을 땐 작업표시줄의 「저장」을 눌러.'
        : '카드를 누르면 그 화면으로 갈아입어. 네 화면에서만 바뀌고, 다음에 와도 고른 대로 떠.';
    }
  }

  /* ── 화면 갈아입기 ────────────────────────────────────────────────────
     주인이 고른 슬롯 = 손님이 처음 들어왔을 때 보는 화면 (서버에 남긴다).
     손님이 고른 슬롯 = 그 사람 브라우저에만 남는다 (다음에 와도 그대로 뜬다).
     스킨은 원래 «바꿔봐도 새로고침하면 원래대로» 였다. */
  var SLOT_PICK = 'bridge:slot';

  /* 슬롯 창 손질은 손님한테도 해야 한다 —
     주인 도구(watchWindows) 안에만 두면 손님은 스킨 원래 문구를 그대로 본다. */
  function initSlotWindow() {
    watch('슬롯 창', function () {
      var g = document.querySelector('.slot-gallery');
      if (g) slotWording(g);
      slotWordsAround();
    });
  }

  function initSlotPick() {
    /* 카드를 누르는 걸 가로채지 않고, 눌린 「뒤에」 무엇이 골라졌는지 본다 */
    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.slot-gallery-cards .dds-card') : null;
      if (!card) return;
      var name = card.dataset.slotName;
      if (!name) return;
      if (card.dataset.ddsQuiet) { delete card.dataset.ddsQuiet; return; }   /* 우리가 누른 것 */
      setTimeout(function () {
        /* 정말 갈아입었는지 보고 나서 기억한다 (카드 빈 곳을 눌렀을 수도 있다) */
        if (!card.classList.contains('dds-card--active')) return;
        keepPick(name);
      }, 400);
    }, true);

    /* 들어올 때 입을 화면을 입혀준다 (손님은 자기 것, 주인은 정해둔 기본값) */
    setTimeout(wearPick, 2600);
  }

  function keepPick(name) {
    if (isOwner()) {
      /* 스킨 안의 「지금 이게 기본」 표시를 고치려면 편집 모드를 거쳐야 하는데,
         그러면 갈아입을 때마다 화면이 다시 뜨고, 자칫 지금 화면이 엉뚱한 슬롯에
         덮여 쓰일 수도 있다. 그래서 우리 쪽에 따로 적어둔다. */
      fetch('/api/board/slot', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name }), credentials: 'same-origin'
      })
        .then(function (r) { if (!r.ok) throw new Error('실패'); })
        .then(function () {
          try { window.DDS_SLOT = name; } catch (e) {}
          note('「' + name + '」 화면으로 갈아입었어. 손님도 여기부터 봐');
        })
        .catch(function () { note('갈아입긴 했는데 기본 화면으로는 못 정했어'); });
      return;
    }
    try { localStorage.setItem(SLOT_PICK, name); } catch (e) {}
  }

  /* 들어올 때 입을 화면 — 손님은 자기가 골라둔 것, 없으면 주인이 정한 기본값 */
  function wantSlot() {
    if (!isOwner()) {
      try {
        var mine = localStorage.getItem(SLOT_PICK);
        if (mine) return mine;
      } catch (e) {}
    }
    try { return window.DDS_SLOT || ''; } catch (e) { return ''; }
  }

  /* 슬롯 창을 안 보이게 열어서 그 카드를 눌러준다.
     카드를 누르면 화면이 입혀질 뿐 아니라 스킨의 「지금 슬롯」도 그걸로 맞춰져서,
     나중에 저장할 때 엉뚱한 슬롯에 덮어쓰는 일이 없다. */
  function wearPick(tries) {
    var want = wantSlot();
    if (!want) return;
    /* 주인이 고른 기본 화면은 서버가 게시글 표시까지 옮겨놔서
       들어오자마자 이미 입혀져 있다 — 슬롯 창을 열 이유가 없다.
       손님이 그것과 다른 걸 골라뒀을 때만 갈아입힌다. */
    if (!tries) {
      var base = '';
      try { base = window.DDS_SLOT || ''; } catch (e) {}
      if (want === base) return;
    }

    var g = document.querySelector('.slot-gallery');
    /* 창은 떴는데 카드가 아직 안 그려졌을 수 있다 — 그때는 더 기다린다 */
    if (g && !g.querySelector('.dds-card[data-slot-name]') && (tries || 0) < 24) g = null;
    if (g) {
      var cur = g.querySelector('.dds-card--active');
      if (cur && cur.dataset.slotName === want) { unquiet(); return; }   /* 이미 그거면 끝 */
      var cards = g.querySelectorAll('.dds-card[data-slot-name]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].dataset.slotName === want) {
          cards[i].dataset.ddsQuiet = '1';        /* 이 클릭은 「고름」으로 세지 않는다 */
          /* 카드는 겉껍데기고, 실제로 눌리는 건 안쪽 버튼이다 */
          var hit = cards[i].querySelector('button') || cards[i];
          hit.click();
          setTimeout(unquiet, 800);
          return;
        }
      }
      unquiet();                       /* 그 슬롯이 없어졌으면 그냥 둔다 */
      if (!isOwner()) { try { localStorage.removeItem(SLOT_PICK); } catch (e) {} }
      return;
    }

    if ((tries || 0) > 24) { unquiet(); return; }
    if (!tries) {
      document.documentElement.classList.add('dds-quiet-slot');
      startHush();
      var bar = document.getElementById('taskbar');
      var qs = bar ? bar.querySelectorAll('.taskbar-quick') : [];
      for (var k = 0; k < qs.length; k++) {
        if (/슬롯/.test(qs[k].getAttribute('title') || '')) { qs[k].click(); break; }
      }
    }
    setTimeout(function () { wearPick((tries || 0) + 1); }, 250);
  }

  /* 창이 뜨자마자 바로 치워야 눈에 안 띈다 — 아주 자주 확인한다 */
  var quietTimer = null;
  function startHush() {
    hushSlotWindow();
    if (quietTimer) return;
    quietTimer = setInterval(hushSlotWindow, 30);
  }
  function stopHush() {
    if (quietTimer) { clearInterval(quietTimer); quietTimer = null; }
  }

  /* 몰래 여는 동안 뜬 슬롯 창과 작업표시줄 칸에 표시를 붙인다 (:has 안 되는 곳 대비) */
  function hushSlotWindow() {
    try {
      var g = document.querySelector('.slot-gallery');
      var win = g && g.closest ? g.closest('.win') : null;
      if (win) win.classList.add('dds-quiet-win');
      var tabs = document.querySelectorAll('.taskbar-tabs button');
      for (var i = 0; i < tabs.length; i++) {
        if ((tabs[i].textContent || '').trim() === '슬롯') tabs[i].classList.add('dds-quiet-tab');
      }
    } catch (e) {}
  }

  function unquiet() {
    /* 몰래 열었던 슬롯 창은 닫는다. 닫히는 동안에도 계속 치워둬야
       사라지는 모습이 눈에 걸리지 않는다. */
    var g = document.querySelector('.slot-gallery');
    var win = g && g.closest ? g.closest('.win') : null;
    var x = win && win.querySelector('.win-close');
    if (x) x.click();

    var end = Date.now() + 1500;
    (function done() {
      var still = document.querySelector('.slot-gallery');
      if (still && Date.now() < end) { setTimeout(done, 40); return; }
      stopHush();
      document.documentElement.classList.remove('dds-quiet-slot');
      var hid = document.querySelectorAll('.dds-quiet-win,.dds-quiet-tab');
      for (var i = 0; i < hid.length; i++) {
        hid[i].classList.remove('dds-quiet-win');
        hid[i].classList.remove('dds-quiet-tab');
      }
      /* 여기서부터 화면이 「지금 저장된 모습」이다 — 이걸 기준으로 삼는다 */
      decoBase = decoSig();
      decoDirty = false;
    })();
  }

  /* 편집 바·창 제목·작업표시줄 탭에도 같은 말이 남아 있다 */
  function slotWordsAround() {
    var spots = document.querySelectorAll(
      '.dds-editbar, .slot-reflect, .win-titlebar, .taskbar-tabs, .slot-confirm');
    for (var i = 0; i < spots.length; i++) slotWords(spots[i]);
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

  /* 이미 올라간 사진들의 제목을 한 화면에서 고친다.
     사진 목록은 화면에 떠 있는 갤러리 칸에서 그대로 읽는다. */
  function editTitles(g) {
    titleStyle();
    var cards = g.querySelectorAll('.gallery-card');
    var items = [];
    var map = {};
    try { map = window.DDS_GALLERY_TITLES || {}; } catch (e) {}
    for (var i = 0; i < cards.length; i++) {
      var im = cards[i].querySelector('img');
      if (!im || !im.getAttribute('src')) continue;
      var path = '';
      try { path = new URL(im.src, location.href).pathname; } catch (e) { continue; }
      items.push({ path: path, src: im.src, was: map[path] || '' });
    }
    if (!items.length) { note('고칠 사진이 없어'); return; }

    var back = document.createElement('div');
    back.className = 'dds-tt';
    var win = document.createElement('div');
    win.className = 'win dds-tt-win';
    var bar = document.createElement('div');
    bar.className = 'win-titlebar';
    bar.innerHTML = '<span class="win-title">사진 제목 고치기</span>';
    var body = document.createElement('div');
    body.className = 'win-body dds-tt-body';

    var head = document.createElement('p');
    head.className = 'dds-tt-head';
    head.textContent = '크게 봤을 때 사진 아래에 뜨는 이름이야. 비우면 아무것도 안 떠.';
    body.appendChild(head);

    var ins = [];
    items.forEach(function (it) {
      var row = document.createElement('label');
      row.className = 'dds-tt-row';
      var th = document.createElement('img');
      th.className = 'dds-tt-thumb';
      th.src = it.src;
      var box = document.createElement('span');
      box.className = 'dds-tt-box';
      var inp = document.createElement('input');
      inp.className = 'dds-tt-in';
      inp.type = 'text';
      inp.maxLength = 120;
      inp.placeholder = '제목 (없어도 됨)';
      inp.value = it.was;
      box.appendChild(inp);
      ins.push(inp);
      row.append(th, box);
      body.appendChild(row);
    });

    var msg = document.createElement('p');
    msg.className = 'dds-tt-head';
    msg.style.margin = '4px 0 0';

    var foot = document.createElement('div');
    foot.className = 'dds-tt-foot';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'dds-btn'; cancel.textContent = '닫기';
    var ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'dds-btn dds-tt-save'; ok.textContent = '저장';
    foot.append(cancel, ok);
    body.append(msg, foot);

    function shut() {
      back.remove();
      document.removeEventListener('keydown', key, true);
    }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); shut(); } }
    cancel.addEventListener('click', shut);
    back.addEventListener('mousedown', function (e) { if (e.target === back) shut(); });
    document.addEventListener('keydown', key, true);

    ok.addEventListener('click', function () {
      var jobs = [];
      items.forEach(function (it, k) {
        var v = ins[k].value.trim();
        if (v === it.was) return;                  /* 안 바꾼 건 건너뛴다 */
        jobs.push(fetch('/api/uploads/title', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: it.path, title: v }),
          credentials: 'same-origin'
        }).then(function (r) {
          if (!r.ok) throw new Error(it.path);
          try {
            var m = window.DDS_GALLERY_TITLES || (window.DDS_GALLERY_TITLES = {});
            if (v) m[it.path] = v; else delete m[it.path];
          } catch (e) {}
        }));
      });
      if (!jobs.length) { shut(); return; }
      ok.disabled = true; msg.textContent = '저장하는 중…';
      Promise.all(jobs)
        .then(function () {
          shut();
          note(jobs.length + '개 제목을 고쳤어');
          placeCaption();
        })
        .catch(function (e) { ok.disabled = false; msg.textContent = '못 저장했어 — ' + e.message; });
    });

    win.append(bar, body);
    back.appendChild(win);
    document.body.appendChild(back);
    setTimeout(function () { try { ins[0].focus(); } catch (e) {} }, 50);
  }

  function galleryPanel(g) {
    if (g.querySelector('.dds-gal-upload')) return;

    var picking = !!g.querySelector('.gallery-pick-banner');

    var row = document.createElement('div');
    row.className = 'dds-gal-upload';

    /* 평소엔 사진만 깔끔하게 보이도록, 도구는 ⋯ 안에 숨긴다 */
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'dds-btn dds-gal-more';
    more.textContent = '⋯';
    more.title = '사진 올리기 · 지우기';
    var tools = document.createElement('span');
    tools.className = 'dds-gal-tools';
    tools.hidden = true;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-btn';
    b.textContent = '＋ 컴퓨터에서 올리기';
    /* 이미 올린 사진의 제목을 나중에 고칠 수 있게 —
       올릴 때 안 적었거나, 제목 기능이 생기기 전에 올린 사진도 여기서 붙인다 */
    var ren = document.createElement('button');
    ren.type = 'button';
    ren.className = 'dds-btn dds-gal-rename';
    ren.textContent = '제목 고치기';
    ren.title = '크게 봤을 때 사진 밑에 뜨는 이름';
    ren.addEventListener('click', function () { editTitles(g); });

    var hint = document.createElement('span');
    hint.className = 'dds-gal-hint';
    hint.textContent = picking ? '올리면 목록 맨 앞에 뜨고, 누르면 바로 적용돼' : '여러 장 한 번에 올려도 돼';
    tools.append(b, ren, hint);
    row.append(more, tools);

    more.addEventListener('click', function () {
      tools.hidden = !tools.hidden;
      more.classList.toggle('is-open', !tools.hidden);
      row.classList.toggle('is-open', !tools.hidden);
    });
    /* 고르러 들어온 창에서는 처음부터 펼쳐둔다 (그때는 올리는 게 목적이니까) */
    if (picking) { tools.hidden = false; more.classList.add('is-open'); row.classList.add('is-open'); }

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
              /* 방금 붙인 제목을 이 화면에도 바로 반영한다 —
                 새로고침해야 제목이 뜨는 일이 없게. */
              try {
                var m = window.DDS_GALLERY_TITLES || (window.DDS_GALLERY_TITLES = {});
                var it = j.items || [];
                for (var k = 0; k < it.length; k++) {
                  var pth = it[k] && (it[k].path || it[k].url);
                  if (pth && titles[k]) m[pth] = titles[k];
                }
              } catch (e) {}
              refreshGallery(g);
              b.textContent = ((j.items || []).length) + '장 올렸어';
              setTimeout(function () { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; }, 1600);
            })
            .catch(function (e) { b.disabled = false; b.textContent = '＋ 컴퓨터에서 올리기'; note('올리기 실패 — ' + e.message); });
        });
      }, !picking);
    });

    /* 줄을 먼저 붙인 뒤에 삭제 도구를 단다 —
       안내 띠가 이 줄 바로 아래로 들어가야 해서 부모가 있어야 한다 */
    var first = g.firstChild;
    if (first) g.insertBefore(row, first); else g.appendChild(row);

    if (!picking) galleryDelete(g, row);

    /* ⋯ 는 갤러리 제목줄(「갤러리 ⟳」)의 새로고침 옆으로 옮긴다.
       위에 따로 한 줄을 차지하지 않아서 사진만 깔끔하게 남는다. */
    moveMoreToHead(g, row, more);
  }

  /* ⋯ 버튼을 갤러리 제목줄로 옮긴다 (새로고침 아이콘 옆).
     제목줄은 스킨이 나중에 그릴 수도 있어서, 생길 때까지 잠깐 기다린다. */
  function moveMoreToHead(g, row, more, tries) {
    var head = g.querySelector('.gallery-section-headrow');
    if (!head) {
      if ((tries || 0) > 20) return;
      setTimeout(function () { moveMoreToHead(g, row, more, (tries || 0) + 1); }, 200);
      return;
    }
    if (head.contains(more)) return;
    more.classList.add('dds-gal-more-inhead');
    head.appendChild(more);
    /* 도구가 접혀 있으면 윗줄은 자리만 차지하니 숨긴다 */
    row.classList.add('dds-gal-row-slim');
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

    var tools = row.querySelector('.dds-gal-tools') || row;
    tools.append(del, doIt, cancel);

    /* 지금이 삭제 모드라는 걸 알려주는 띠 — 갤러리 맨 위에 붙는다 */
    var bar = document.createElement('div');
    bar.className = 'dds-gal-bar';
    bar.innerHTML = '<span>🗑 <b>삭제 모드</b> — 지울 사진을 눌러서 골라</span>' +
      '<span class="dds-gal-cnt" style="margin-left:auto"></span>';
    var after = row.nextSibling;
    if (after) row.parentNode.insertBefore(bar, after); else row.parentNode.appendChild(bar);

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
      doIt.textContent = count() ? '🗑 ' + count() + '장 지우기' : '지울 걸 골라줘';
      doIt.disabled = !count();
      del.textContent = '삭제하기';
      var cnt = bar.querySelector('.dds-gal-cnt');
      if (cnt) cnt.textContent = count() ? count() + '장 골랐어' : '아직 안 골랐어';
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

    del.addEventListener('click', function () {
      on = true; picked = {};
      var t = row.querySelector('.dds-gal-tools'); if (t) t.hidden = false;
      row.classList.add('is-open');
      paint();
    });
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
      /* ── 삭제 모드 — 지금이 삭제 모드라는 걸 한눈에 알 수 있게 ── */
      /* 갤러리 전체에 빨간 테두리와 옅은 빨간 바탕 */
      '.dds-gal-picking{outline:2px solid #c0392b;outline-offset:-2px;',
      '  background:rgba(192,57,43,.06)}',
      /* 맨 위에 띠 하나 */
      '.dds-gal-upload{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px}',
      '.dds-gal-more{padding:1px 9px;line-height:1.5;opacity:.55}',
      /* 제목줄로 옮겨간 ⋯ — 새로고침 아이콘 옆에 같은 크기로 */
      '.gallery-section-headrow{display:flex;align-items:center;gap:6px}',
      '.dds-gal-more-inhead{margin-left:auto;order:9}',
      '.gallery-section-headrow .gallery-section-refresh{order:8}',
      /* 도구가 접혀 있을 때는 윗줄이 자리를 안 차지하게 */
      '.dds-gal-row-slim{margin:0}',
      '.dds-gal-row-slim:not(.is-open){display:none}',
      '.dds-gal-more:hover,.dds-gal-more.is-open{opacity:1}',
      '.dds-gal-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dds-gal-tools[hidden]{display:none}',
      /* 스킨의 .dds-btn 이 display 를 정해버려서 hidden 이 안 먹는다. 우리 칸 안에서만 되돌린다 */
      '.dds-gal-upload [hidden],.dds-gal-tools [hidden]{display:none!important}',
      /* 지울 것을 고르는 중에는 도구가 접히면 안 된다 */
      '.dds-gal-picking .dds-gal-more{display:none}',
      '.dds-gal-bar{display:none;align-items:center;gap:8px;margin:0 0 8px;padding:6px 10px;',
      '  background:#c0392b;color:#fff;font-size:12px;line-height:1.4}',
      '.dds-gal-picking .dds-gal-bar{display:flex}',
      '.dds-gal-bar b{font-weight:600}',
      /* 고를 수 있는 칸 — 점선 + 살짝 흐리게, 왼쪽 위에 빈 네모 */
      '.dds-gal-picking .gallery-card{outline:1px dashed #c0392b;outline-offset:-2px;cursor:pointer;',
      '  opacity:.72;transition:opacity .1s}',
      '.dds-gal-picking .gallery-card:hover{opacity:1}',
      '.dds-gal-picking .gallery-card:before{content:"";position:absolute;left:4px;top:4px;',
      '  width:15px;height:15px;background:#fff;border:1px solid #c0392b;z-index:2}',
      '.dds-gal-picking .gallery-card.dds-gal-on:before{content:"✓";color:#fff;background:#c0392b;',
      '  font-size:11px;line-height:15px;text-align:center}',
      /* 삭제 모드일 때 버튼도 빨갛게 */
      '.dds-gal-doit{background:#c0392b!important;color:#fff!important;border-color:#8d2b20!important}',
      '.dds-gal-doit:disabled{opacity:.5}',
      '.dds-gal-picking .gallery-card.dds-gal-on{outline:3px solid #c0392b;outline-offset:-2px;opacity:1}',
      '.dds-gal-picking .gallery-card.dds-gal-on:after{content:"지울 것";position:absolute;right:3px;top:3px;' +
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
      '.dds-gate-skip{align-self:flex-end}',
      /* 편집 바의 저장 버튼 — 작업표시줄 저장이 대신 눌러줄 뿐, 사람 눈엔 안 보인다 */
      '.dds-editbar .dds-hidden-save{display:none!important}',
      /* 우리가 대신 눌러주는 동안 슬롯 창·편집 바가 깜빡이지 않게 */
      'html.dds-quiet-slot .dds-editbar{opacity:0;pointer-events:none}',
      /* 슬롯 창을 몰래 열어야 할 때 — 창도 작업표시줄 칸도 통째로 안 보이게.
         :has 를 못 읽는 브라우저를 대비해 .dds-quiet-win 도 같이 붙인다 */
      /* 화면 밖으로 치워버린다 — display:none 이면 스킨이 크기를 못 재서 탈이 날 수 있다 */
      'html.dds-quiet-slot .win:has(.slot-gallery),html.dds-quiet-slot .dds-quiet-win{',
      '  position:fixed!important;left:-99999px!important;top:0!important;',
      '  opacity:0!important;pointer-events:none!important}',
      '.dds-quiet-tab{display:none!important}'
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

  /* 손님한테는 위젯 안의 「등록·추가」 버튼도 안 보여야 한다.
     시계 위젯의 「＋ 알람 추가」가 그동안 남아 있었다 — 시계를 바탕화면에
     올려두기 전에는 손님 화면에 뜰 일이 없어서 안 보였던 것뿐이다. */
  function guestWidgetStyle() {
    if (isOwner()) return;
    if (document.getElementById('dds-guestw-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-guestw-style';
    s.textContent = '.clock-alarm-add{display:none!important}';
    document.head.appendChild(s);
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
      /* 「수정」은 <a href="/manage/newpost/…"> 라 그냥 두면 관리 화면으로 튕긴다.
         목록에서 연 글이든 어디서든, 그 자리에서 편집창이 열리게 가로챈다. */
      var edit = e.target.closest ? e.target.closest('a[href*="/manage/newpost/"]') : null;
      if (edit) {
        var em = edit.getAttribute('href').match(/\/manage\/newpost\/(\d+)/);
        if (em) {
          e.preventDefault();
          e.stopPropagation();
          openPostEditor(em[1], edit);
          return;
        }
      }

      var bar = e.target.closest ? e.target.closest('.t-manage-bar') : null;
      if (!bar) return;
      var btn = e.target.closest('button');
      if (!btn) return;

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

  /* ── 갤러리 사진 제목을 「사진 바로 밑」에 ────────────────────────────
     전에는 스킨의 설명 칸을 라이트박스 맨 아래(확대·축소 줄 위)로 옮겼는데,
     사진이 화면보다 작으면 사진과 글자 사이가 300px 넘게 벌어져서
     사진 밑이 아니라 화면 맨 아래에 떠 있는 것처럼 보였다.

     그래서 우리 글자 칸을 따로 만들어 사진 칸 안에 띄우고,
     사진이 실제로 끝나는 높이를 재서 그 8px 아래에 붙인다.
     사진을 넘기거나 확대·축소해도 매번 다시 잰다.
     주인·손님 모두에게 똑같이 보인다. */
  var CAP_H = 30;                    /* 사진 밑에 비워 둘 글자 자리 높이 */

  function captionStyle() {
    if (document.getElementById('dds-cap-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-cap-style';
    s.textContent = [
      /* 스킨이 맨 위 제목줄에 붙이는 설명글은 우리가 아래에서 다시 그린다 */
      '.lightbox-head .lightbox-caption{display:none!important}',
      /* 올린 사진을 내려받는 버튼 — 쓸 일이 없어서 뺐다 */
      '.lightbox-save{display:none!important}',
      /* 제목이 달린 사진일 때만 사진 칸 아래를 글자 높이만큼 비운다.
         사진은 그 좁아진 칸에 맞춰 저절로 조금 작아진다 —
         그래서 글자가 사진을 가리는 일이 없고, 사진 크기와 상관없이
         글자가 늘 같은 자리에 온다. 제목이 없으면 칸은 그대로 다 쓴다. */
      /* overflow 까지 잘라줘야 한다 — 확대해서 사진이 칸보다 커지면
         잘리는 자리가 원래 사진 칸 맨 아래라서, 글자 자리로 넘어 들어온다 */
      '.lightbox-stage.dds-has-cap .lightbox-slide{bottom:' + CAP_H + 'px;overflow:hidden}',
      '.dds-cap{position:absolute;left:0;right:0;height:24px;',
      '  margin:0;padding:0 16px;z-index:5;box-sizing:border-box;',
      '  display:flex;align-items:center;justify-content:center;',
      '  font-size:12.5px;line-height:1.4;pointer-events:none}',
      /* 검은 띠 + 흰 글씨 — 어떤 사진 밑에서도 눈에 들어오게 */
      '.dds-cap span{display:inline-block;max-width:100%;padding:3px 12px;',
      '  background:#111;color:#fff;border-radius:12px;',
      '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dds-cap[hidden]{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* 페이지에 실려 온 제목표가 낡았을 수 있다 (제목을 붙인 뒤 그 화면을 계속 쓰거나,
     예전 판이 캐시에 남아 있거나). 크게 보기에서 제목이 비어 있으면
     서버에 한 번 물어서 채운다 — 10초에 한 번만. */
  var capAsked = 0;
  function refreshTitles() {
    var now = Date.now();
    if (now - capAsked < 10000) return;
    capAsked = now;
    fetch('/api/board/state', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.galleryTitles) return;
        window.DDS_GALLERY_TITLES = j.galleryTitles;
        placeCaption();
      })
      .catch(function () {});
  }

  /* 지금 크게 보고 있는 사진에 달린 제목 */
  function capText(box) {
    var img = box.querySelector('.lightbox-slide img, .lightbox-img');
    if (!img || !img.getAttribute('src')) return '';
    var path = '';
    try { path = new URL(img.src, location.href).pathname; } catch (e) { return ''; }
    var m = null;
    try { m = window.DDS_GALLERY_TITLES || null; } catch (e) {}
    if (!m) { refreshTitles(); return ''; }
    var t = m[path] || m[img.src] || '';
    /* 이 사진이 표에 아예 없으면 표가 낡은 것일 수 있다 — 한 번 다시 받아본다 */
    if (!t && !Object.prototype.hasOwnProperty.call(m, path)) refreshTitles();
    return t;
  }

  function placeCaption() {
    var boxes = document.querySelectorAll('.lightbox');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var stage = box.querySelector('.lightbox-stage');
      if (!stage) continue;

      var el = stage.querySelector('.dds-cap');
      if (!el) {
        el = document.createElement('p');
        el.className = 'dds-cap';
        el.appendChild(document.createElement('span'));
        stage.appendChild(el);
      }
      var sp = el.firstChild;

      var t = capText(box);
      if (sp.textContent !== t) sp.textContent = t;      /* 같으면 안 건드린다 (되풀이 방지) */
      if (el.hidden !== !t) el.hidden = !t;

      /* 제목이 있는 사진에서만 칸 아래를 비운다 */
      if (stage.classList.contains('dds-has-cap') !== !!t) {
        stage.classList.toggle('dds-has-cap', !!t);
      }
      if (!t) continue;

      /* 글자는 사진 바로 밑에 붙인다. 사진이 커서 밑이 비워둔 자리까지
         내려오면 거기서 멈춘다 — 위에서 칸을 미리 좁혀 놨으니 사진을 안 가린다. */
      var img = box.querySelector('.lightbox-slide img, .lightbox-img');
      if (!img) continue;
      var a = img.getBoundingClientRect();
      var s = stage.getBoundingClientRect();
      if (!a.height || !s.height) continue;
      var top = Math.max(0, Math.min(a.bottom - s.top + 6, s.height - 26));
      var v = Math.round(top) + 'px';
      if (el.style.top !== v) el.style.top = v;

      /* 사진을 넘기거나 확대·축소하면 다시 잰다 */
      if (!img.dataset.ddsCapOn) {
        img.dataset.ddsCapOn = '1';
        img.addEventListener('load', function () { placeCaption(); });
      }
      if (!stage.dataset.ddsCapObs) {
        stage.dataset.ddsCapObs = '1';
        try {
          new MutationObserver(function () { placeCaption(); }).observe(stage, {
            attributes: true, subtree: true, childList: true,
            attributeFilter: ['src', 'class', 'style', 'width', 'height']
          });
        } catch (e) {}
      }
    }
  }

  function initCaption() {
    captionStyle();
    var f = watch('사진 설명', placeCaption);
    try { window.addEventListener('resize', f); } catch (e) {}
  }

  /* ── 옆줄 Tag 딱지 ────────────────────────────────────────────────────
     스킨에는 태그로 찾아가는 길이 두 갈래인데, 하나가 지름길이라 어설프다.

       검색칸에 「#블로그」        → 길이 「태그: 블로그」로 바뀌고,
                                   카테고리 선택이 풀리고, 보던 방식 그대로
       옆줄 Tag 딱지를 누르면     → 목록만 슬쩍 갈아끼운다. 길은 「블로그」인 채,
                                   카테고리도 골라진 채, 보기 방식은 갤러리형으로 고정

     지름길 쪽은 지금 어디인지 화면에 안 남아서, 태그 결과인데도 첫 화면처럼
     보인다 (맨 위 고정글도 같이 떠 버린다). 그래서 딱지를 누르면
     검색칸을 대신 눌러주는 것으로 돌린다 — 결과는 같고 길만 제대로 남는다. */
  function initTagChips() {
    document.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.pb-tag-box .dds-tag-chip') : null;
      if (!chip) return;

      var win = chip.closest ? chip.closest('.win') : null;
      var input = (win || document).querySelector('.post-browser-search-input');
      if (!input) return;                       /* 검색칸이 없으면 스킨 방식 그대로 */

      e.preventDefault();
      e.stopPropagation();                      /* 스킨의 지름길을 막는다 */

      var word = (chip.textContent || '').trim();
      if (word.charAt(0) !== '#') word = '#' + word;
      input.value = word;
      try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) {}
      try {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
      } catch (x) {}
      var form = input.form || (input.closest ? input.closest('form') : null);
      if (form) { try { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch (x) {} }
    }, true);                                   /* 잡는 단계 — 스킨보다 먼저 */
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
  function atRoot(view) {
    var main = view.closest ? view.closest('.post-browser-main') : null;

    /* 글 하나를 펼쳐 보고 있으면 첫 화면이 아니다 (길에 › 가 들어간다) */
    var path = main && main.querySelector('.post-browser-path');
    var txt = path ? (path.textContent || '').trim() : '';
    if (txt.indexOf('›') !== -1) return false;

    /* 카테고리 나무에서 맨 처음 칸(「블로그」= 전체)이 골라져 있어야 첫 화면.

       전에는 「뒤로」 버튼이 살아 있는지로 판단했는데, 그건 다녀온 자취라서
       첫 화면으로 돌아와도 계속 살아 있다. 그래서 글을 고치고 목록으로
       돌아오면 맨 위 고정글이 사라졌다. */
    var win = main && main.closest ? main.closest('.win') : null;
    var tree = (win || document).querySelector('.cat-tree-list');
    if (!tree) return true;
    var labels = tree.querySelectorAll('.cat-tree-label:not(.cat-tree-settings)');
    if (!labels.length) return true;
    var root = labels[0];
    return root.classList.contains('is-selected') ||
           root.getAttribute('aria-current') === 'true';
  }

  function buildFeature(f) {
    var art = document.createElement('article');
    art.className = 'dds-feature';

    /* 제목은 링크가 아니다. 본문이 이미 아래에 통째로 펼쳐져 있어서 눌러 갈 데가 없고,
       누르면 페이지가 그 글 주소로 넘어가 버려서 새로고침해도 계속 그 글만 뜬다. */
    var h = document.createElement('p');
    h.className = 'dds-feature-title';
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
        var a = document.createElement('span');
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
    /* 보기 방식마다 그리는 칸이 다르다. 넷 다 챙긴다 —
       전에는 목록형(.category-explorer)만 봐서, 갤러리형을 쓰면 고정글이 아예 안 보였다.
         본문형 .post-feed / 갤러리형 .category-gallery /
         목록형 .category-explorer / 폴더형 .category-folder-grid */
    var exps = document.querySelectorAll(
      '.category-explorer, .category-gallery, .post-feed, .category-folder-grid');
    for (var i = 0; i < exps.length; i++) {
      var ex = exps[i];
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
      /* 마우스를 올리면 창 제목줄과 같은 색이 깔린다 */
      '.dds-row .category-list-link:hover{background:linear-gradient(180deg,',
      '  var(--dds-win-titlebar-active-top,#c7ddd0),var(--dds-win-titlebar-bottom,#b0b6af))}',
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
      /* 갤러리형·폴더형은 칸이 격자라, 맨 위 글이 한 칸에 끼어 세로로 눌린다.
         한 줄을 통째로 쓰게 해서 첫 화면답게 펼친다. */
      '.category-gallery>.dds-feature,.category-folder-grid>.dds-feature{',
      '  grid-column:1/-1;grid-row:auto}',
      '.dds-feature-title{display:block;font-size:21px;font-weight:600;line-height:1.45;',
      '  margin:0 0 7px}',
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
      '.dds-feature-tags span{opacity:.7}',
      '.dds-feature-sep{display:flex;align-items:center;gap:10px;margin:26px 0 2px}',
      '.dds-feature-sep span{font-size:11.5px;opacity:.5;letter-spacing:.04em}',
      '.dds-feature-sep i{flex:1;height:1px;background:var(--dds-face-shadow,#d9dcd1);opacity:.6}',
      /* 줄 오른쪽 ⋯ — 평소엔 숨어 있다가 그 줄에 마우스를 올리면 나온다.
         (네이버 블로그처럼, 목록이 버튼으로 지저분해지지 않게) */
      /* opacity 만 0 으로 둔다 — pointer-events:none 로 막으면 첫 클릭이
         밑에 깔린 글 링크로 새어 나가서 글이 열려 버린다 */
      '.category-list-row .dds-dots{opacity:0;transition:opacity .12s;z-index:3;',
      '  font-size:12px;line-height:1}',
      '.category-list-row:hover .dds-dots,.category-list-row .dds-dots:focus{opacity:1}',
      '.category-list-row .dds-dotmenu{z-index:40}',
      '.dds-row .category-list-link{padding-right:40px}',
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

  /* ── 「전체 글 보기」 → 「블로그」 ─────────────────────────────────────
     스킨 파일에서 이미 이름을 바꿨지만, 예전에 저장해둔 설정이나 캐시가 남아 있으면
     옛 이름이 다시 나올 수 있다. 화면에 보이는 것도 한 번 더 갈아준다.
     아이콘 위치는 이름으로 기억하니까, 옛 이름으로 저장된 자리도 같이 옮겨준다. */
  var OLD_NAME = '전체 글 보기', NEW_NAME = '블로그';
  function renameBlog() {
    if (pos[OLD_NAME] && !pos[NEW_NAME]) { pos[NEW_NAME] = pos[OLD_NAME]; delete pos[OLD_NAME]; }
    var sel = ['.desktop-icon-label', '.win-title', '#taskbar button', '.post-browser-path',
               '.cat-tree-list a', '.cat-tree-list button', '.link_tit'];
    for (var i = 0; i < sel.length; i++) {
      var els = document.querySelectorAll(sel[i]);
      for (var j = 0; j < els.length; j++) {
        var e = els[j];
        if (e.children.length) continue;               // 글자만 든 것만 건드린다
        var t = e.textContent;
        if (t && t.indexOf(OLD_NAME) !== -1) e.textContent = t.split(OLD_NAME).join(NEW_NAME);
      }
    }
  }

  function initList() {
    listStyle();
    watch('글 목록 꾸미기', function () { hideCatSettings(); renameBlog(); dressList(); });
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
      /* 본문이 이미 통째로 있으니 「글로 보기」 링크는 없앤다.
         누르면 페이지가 그 글 주소로 넘어가서 새로고침해도 계속 그 글만 뜬다. */
      box.append(h, d, bd);

      body.textContent = '';
      body.appendChild(box);
    }
  }

  function initProfile() {
    profileStyle();
    watch('프로필 창', fillProfile);
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
      '.dds-write{margin-left:8px;white-space:nowrap;flex:none;padding:3px 9px;font-size:12px}',
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
          msg.textContent = '저장했어';
          refreshBoard(function () { shut(); });
        })
        .catch(function (e) { save.disabled = false; msg.textContent = '못 저장했어 — ' + e.message; });
    });

    wrap.append(head, body, foot);
    host.appendChild(wrap);
    setTimeout(function () { try { title.focus(); } catch (e) {} }, 60);
  }

  /* post() 는 이미 있는 이름이라 겹치지 않게 하나 더 둔다 */
  function post0(url, form) { return post(url, form); }

  /* 글을 쓰거나 고친 뒤 — 페이지를 통째로 새로 고치지 않고 목록만 다시 그린다.
     새 값을 서버에서 받아 window.DDS_* 를 갈아끼우고, 스킨이 보고 있던 화면을
     같은 자리로 다시 불러오게 한다. 스크롤도 창 위치도 그대로 남는다. */
  function refreshBoard(done) {
    /* 지금 글 하나를 펼쳐 보고 있었나? (길에 › 가 있으면 안으로 들어와 있는 것)
       글을 보다가 고친 거라면 목록 첫 화면으로 돌아와야 한다 —
       안 그러면 그 글이 속한 카테고리 안에 남아서 맨 위 고정글이 안 보였다. */
    var wasInside = false;
    try {
      var pe = document.querySelector('.post-browser-path');
      wasInside = pe ? (pe.textContent || '').indexOf('›') !== -1 : false;
    } catch (e) {}

    fetch('/api/board/state', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        window.DDS_POST_META = j.meta || {};
        window.DDS_FEATURED = j.featured || null;
        if (j.galleryTitles) window.DDS_GALLERY_TITLES = j.galleryTitles;

        /* 이미 그려둔 것들을 지운다 — 다시 그릴 수 있게 */
        var olds = document.querySelectorAll('.dds-feature');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
        var rows = document.querySelectorAll('.category-list-row');
        for (var k = 0; k < rows.length; k++) {
          rows[k].hidden = false;
          delete rows[k].dataset.ddsRow;
        }

        /* 스킨한테 화면을 다시 불러오라고 시킨다.
           글 안에 들어와 있었으면 맨 처음 칸(「블로그」 = 전체)으로,
           카테고리를 보고 있었으면 그 카테고리 그대로. */
        var tree = document.querySelector('.cat-tree-list');
        var here = null;
        if (tree) {
          var root = tree.querySelector('.cat-tree-label:not(.cat-tree-settings)');
          here = wasInside ? root
            : (tree.querySelector('.cat-tree-label.is-selected') ||
               tree.querySelector('[aria-current]') || root);
        }
        if (here) here.click();
        setTimeout(function () {
          dressList();
          addFeatureMenu();
          addRowMenus();
          if (done) done();
        }, 700);
      })
      .catch(function () {
        /* 못 받아오면 어쩔 수 없이 예전 방식으로 */
        location.reload();
      });
  }

  /* 글 창(목록에서 연 글)의 「수정」 — 관리 화면으로 나가지 않고 그 자리에서 편집창.
     편집창을 띄울 자리는 블로그 창 안쪽이 제일 좋지만, 글을 딴 창으로 열었으면
     그 창 몸통에 띄운다. */
  function editorHost(from) {
    var w = from && from.closest ? from.closest('.win') : null;
    var inner = w && (w.querySelector('.post-browser-main') || w.querySelector('.win-body'));
    if (inner) return inner;
    return document.querySelector('.post-browser-main') ||
           document.querySelector('.win-body') || document.body;
  }

  function openPostEditor(id, from) {
    var host = editorHost(from);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    fetch('/api/posts/' + id, { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || '실패'); return j; }); })
      .then(function (p) { openEditor(host, p); })
      .catch(function (e) { note('글을 못 불러왔어 — ' + e.message); });
  }

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

  /* ── 글 하나짜리 ⋯ 메뉴 ───────────────────────────────────────────────
     수정 / 맨 위에 고정 / 비공개 / 삭제. 맨 위에 펼친 글에도 붙이고,
     목록의 줄마다도 붙인다. 전에는 펼친 글에만 있어서 「맨 위에 고정」이
     이미 맨 위에 있는 글에만 걸렸다 — 다른 글을 고를 방법이 아예 없었다. */
  function dotMenu(host, id, place) {
    if (!id || host.querySelector('.dds-dots')) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    var dots = document.createElement('button');
    dots.type = 'button';
    dots.className = 'dds-btn dds-dots';
    dots.textContent = '⋯';
    dots.title = '이 글 다루기';
    dots.style.cssText = place.dots;

    var menu = document.createElement('div');
    menu.className = 'dds-dotmenu';
    menu.hidden = true;
    menu.style.cssText = place.menu + ';z-index:40;min-width:150px;' +
      'background:var(--dds-face-light,#fff);border:1px solid var(--dds-face-dark,#131313);' +
      'box-shadow:3px 3px 0 rgba(0,0,0,.18)';

    var f = null;
    try { f = window.DDS_FEATURED || null; } catch (e) {}
    var pinnedId = f ? Number(f.pinnedId || 0) : 0;
    var pinned = pinnedId === id;

    var items = [
      ['수정', function () { openPostEditor(id, host); }],
      [pinned ? '맨 위에서 내리기' : '맨 위에 고정', function () {
        fetch('/api/board/pinned', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: pinned ? 0 : id }), credentials: 'same-origin'
        }).then(function () {
          note(pinned ? '맨 위에서 내렸어' : '이 글을 맨 위에 고정했어');
          refreshBoard();
        });
      }],
      ['비공개로 전환', function () {
        fetch('/api/posts/' + id + '/visibility', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}), credentials: 'same-origin'
        }).then(function () { note('공개 상태를 바꿨어'); refreshBoard(); });
      }],
      ['삭제', function () {
        if (!window.confirm('이 글을 지울까? 되돌릴 수 없어.')) return;
        fetch('/api/posts/' + id, { method: 'DELETE', credentials: 'same-origin' })
          .then(function () { note('글을 지웠어'); refreshBoard(); });
      }]
    ];
    items.forEach(function (it) {
      var x = document.createElement('button');
      x.type = 'button';
      x.textContent = it[0];
      x.style.cssText = 'display:block;width:100%;text-align:left;padding:7px 11px;border:0;' +
        'background:transparent;font:inherit;font-size:12.5px;color:inherit;cursor:pointer';
      x.addEventListener('click', function (ev) {
        /* 목록 줄 위에 얹혀 있어서, 안 막으면 글이 열려 버린다 */
        ev.preventDefault(); ev.stopPropagation();
        menu.hidden = true;
        it[1]();
      });
      menu.appendChild(x);
    });

    dots.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      /* 다른 줄에서 열어둔 메뉴는 닫는다 */
      var open = document.querySelectorAll('.dds-dotmenu');
      for (var i = 0; i < open.length; i++) if (open[i] !== menu) open[i].hidden = true;
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', function () { menu.hidden = true; });

    host.append(dots, menu);
  }

  /* 글 주소(/12)에서 글 번호만 뽑는다 */
  function postId(href) {
    try {
      var m = new URL(href || '', location.href).pathname.match(/^\/(\d+)\/?$/);
      return m ? Number(m[1]) : 0;
    } catch (e) { return 0; }
  }

  /* 맨 위에 펼쳐 놓은 글 */
  function addFeatureMenu() {
    var f = null;
    try { f = window.DDS_FEATURED || null; } catch (e) {}
    if (!f) return;
    var id = postId(f.link);
    var arts = document.querySelectorAll('.dds-feature');
    for (var i = 0; i < arts.length; i++) {
      dotMenu(arts[i], id, {
        dots: 'position:absolute;right:0;top:0;padding:2px 8px',
        menu: 'position:absolute;right:0;top:26px'
      });
    }
  }

  /* 목록의 줄마다 — 여기서 아무 글이나 골라 맨 위에 고정할 수 있다 */
  function addRowMenus() {
    var rows = document.querySelectorAll('.category-list-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.hidden) continue;
      var link = row.querySelector('.category-list-link');
      if (!link) continue;
      dotMenu(row, postId(link.getAttribute('href')), {
        dots: 'position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:1px 7px',
        menu: 'position:absolute;right:8px;top:calc(50% + 14px)'
      });
    }
  }

  function initWrite() {
    watch('글쓰기 버튼', function () { addWriteButton(); addFeatureMenu(); addRowMenus(); });
  }

  /* ── 지금 누구로 들어와 있는지 ─────────────────────────────────────────
     작업표시줄 오른쪽에 늘 붙어 있는 표시. 주인 버튼들이 깜빡이거나 안 보일 때
     내가 무슨 상태인지 여기만 보면 알 수 있다. 누르면 로그인/로그아웃. */
  function whoStyle() {
    if (document.getElementById('dds-who-style')) return;
    var s = document.createElement('style');
    s.id = 'dds-who-style';
    s.textContent = [
      '.dds-who{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;',
      '  font-size:11.5px;line-height:1.2;white-space:nowrap;cursor:pointer;',
      '  border:1px solid var(--dds-face-dark,#131313);background:var(--dds-face,#dce1d4);',
      '  box-shadow:var(--dds-surface-raised,none);color:inherit;font-family:inherit}',
      '.dds-who i{width:7px;height:7px;flex:none;background:#9aa093;border-radius:0}',
      '.dds-who.is-owner i{background:var(--dds-accent,#4fa87b)}',
      '.dds-who.is-guest i{background:#c9a227}',
      '.dds-who b{font-weight:600}',
      '.dds-who.has-trouble{outline:2px solid #c0392b}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function whoAmI() {
    var me = {};
    try { me = window.DDS_ME || {}; } catch (e) {}
    /* 닉네임을 따로 정해두지 않았으면 「주인 · 주인」 처럼 두 번 나오니 이름은 뺀다 */
    if (me.owner) {
      var n = me.name || '';
      return { kind: 'owner', label: '주인', name: n === '주인' ? '' : n };
    }
    if (me.guest) return { kind: 'guest', label: '손님', name: me.guest };
    return { kind: 'none', label: '로그인 안 함', name: '' };
  }

  function addWhoBadge() {
    var bar = document.getElementById('taskbar');
    if (!bar || bar.querySelector('.dds-who')) return;
    /* 스킨이 작업표시줄을 다 그리기 전에 끼워 넣으면 맨 앞으로 밀린다.
       오른쪽 묶음이 생긴 뒤에 붙인다 (옵저버가 다시 불러준다) */
    var right = bar.querySelector('.taskbar-right');
    if (!right) return;
    whoStyle();
    var w = whoAmI();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dds-who is-' + w.kind;
    b.innerHTML = '<i></i><span></span>';
    b.querySelector('span').innerHTML = w.name
      ? w.label + ' · <b></b>'
      : w.label;
    var nb = b.querySelector('b');
    if (nb) nb.textContent = w.name;
    var bad = [];
    for (var k in failed) bad.push(k + ': ' + failed[k]);
    b.title = (w.kind === 'owner' ? '주인으로 들어와 있어. 누르면 로그아웃'
      : w.kind === 'guest' ? '손님 이름으로 들어와 있어. 누르면 바꾸기'
      : '누르면 로그인 창이 떠') +
      '\n편집 도구 ' + BRIDGE_VERSION +
      (bad.length ? '\n⚠ 문제: ' + bad.join(' / ') : '');
    if (bad.length) b.classList.add('has-trouble');

    b.addEventListener('click', function () {
      if (w.kind === 'owner') {
        if (!window.confirm('로그아웃할까?')) return;
        fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
          .then(function () { location.reload(); });
        return;
      }
      try { localStorage.removeItem(SKIP); } catch (e) {}
      if (!document.querySelector('.dds-gate')) openGate();
    });

    /* 작업표시줄 오른쪽, 시계 바로 왼쪽에 붙인다 */
    var clock = right.querySelector('.taskbar-clock, [class*="clock"]');
    if (clock) right.insertBefore(b, clock); else right.appendChild(b);
  }

  function initWho() {
    watch('로그인 표시', addWhoBadge);
  }

  /* ── 블로그 창 자동으로 열기 ─────────────────────────────────────────── */
  /* 들어오면 블로그 창이 늘 떠 있게 한다. 새로고침해도, 글 주소로 바로 들어와도.
     (글 주소로 들어오면 그 글 창만 뜨고 블로그가 없어서 갇힌 것처럼 보였다) */
  function autoOpenBlog(tries) {
    if (document.querySelector('.win-post-browser')) return;   // 이미 블로그 창이 있으면 끝
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
        icons[i].click();
        setTimeout(shapeBlog, 300);
        return;
      }
    }
    if ((tries || 0) <= 40) setTimeout(function () { autoOpenBlog((tries || 0) + 1); }, 250);
  }

  /* 블로그 창을 5:3 으로 띄운다.
     스킨이 정한 크기를 그대로 두면 창마다 비율이 제각각이라, 처음 뜰 때 한 번만 맞춘다.
     사람이 직접 크기를 바꾼 뒤에는 다시 안 건드린다. */
  function shapeBlog(tries) {
    var win = document.querySelector('.win-post-browser');
    if (!win) {
      if ((tries || 0) > 20) return;
      setTimeout(function () { shapeBlog((tries || 0) + 1); }, 200);
      return;
    }
    if (win.dataset.ddsShaped) return;
    win.dataset.ddsShaped = '1';

    /* 5:3 로, 가로의 34% 쯤 — 화면 한구석에 얌전히 뜨는 크기 */
    var bar = document.getElementById('taskbar');
    var barH = bar ? bar.getBoundingClientRect().height : 40;
    var roomW = Math.max(320, window.innerWidth - 32);
    var roomH = Math.max(240, window.innerHeight - barH - 32);

    var w = Math.round(window.innerWidth * 0.34);
    w = Math.max(420, Math.min(w, roomW));       /* 너무 작아도 못 쓰니 아래로 한계를 둔다 */
    var h = Math.round(w * 3 / 5);
    if (h > roomH) { h = roomH; w = Math.round(h * 5 / 3); }

    win.style.width = w + 'px';
    win.style.height = h + 'px';

    /* style 로 준 값과 실제로 그려진 크기가 테두리만큼 어긋난다 — 한 번 재서 맞춘다.
       목표는 「그려진」 크기가 w × w*3/5 인 것 */
    var r = win.getBoundingClientRect();
    var dw = r.width - w, dh = r.height - h;
    win.style.width = (w - dw) + 'px';
    win.style.height = (Math.round(w * 3 / 5) - dh) + 'px';

    /* 가운데로 */
    r = win.getBoundingClientRect();
    win.style.left = Math.max(0, Math.round((window.innerWidth - r.width) / 2)) + 'px';
    win.style.top = Math.max(0, Math.round((window.innerHeight - barH - r.height) / 2)) + 'px';
  }

  /* ── 시작 ────────────────────────────────────────────────────────────── */
  function start() {
    /* 로그인 창이 제일 중요하니 먼저, 그리고 각 단계를 따로 감싼다.
       한 단계가 실패해도 나머지는 그대로 뜬다. */
    safe('기본 모양', baseStyle)();
    safe('로그인 창 모양', gateStyle)();
    safe('로그인 창', loginGate)();
    safe('로그인 버튼', loginButton)();
    safe('로그인 표시', initWho)();
    safe('아이콘', initIcons)();
    safe('방명록 모양', guestbookStyle)();
    safe('손님 위젯', guestWidgetStyle)();
    safe('방명록', initGuestbook)();
    safe('글 목록', initList)();
    safe('프로필 창', initProfile)();
    safe('사진 크게 보기', initCaption)();
    safe('태그 딱지', initTagChips)();
    /* 스킨의 「임시 저장」은 없앴다. 예전에 남겨둔 임시본이 있으면
       새로고침할 때 저장한 화면 대신 그게 되살아나니 여기서 치운다. */
    try { localStorage.removeItem('dds:slot-draft'); } catch (e) {}
    safe('슬롯 창', initSlotWindow)();
    safe('화면 고르기', initSlotPick)();
    safe('블로그 자동 열기', autoOpenBlog)();
    if (isOwner()) {
      safe('글 관리', initPostManage)();
      safe('주인 도구', initOwner)();
      safe('꾸미기 지켜보기', watchDeco)();
      safe('글쓰기', initWrite)();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
