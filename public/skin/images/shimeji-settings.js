/* ==========================================================================
   시메지 설정 창 for DDSWindowSkin  (shimeji-settings.js)
   - shimeji.js 가 "시메지 설정…" 을 누를 때만 불러온다 → 방문자 기본 로드에 없음
   - 스킨의 디자인 토큰(--dds-*)만 참조하므로 테마 색을 바꾸면 같이 따라간다
   ========================================================================== */
(function () {
  'use strict';
  if (window.SMJ_SETTINGS) return;
  var S = window.SMJ;
  if (!S) { console.warn('[shimeji] 설정 창: shimeji.js 가 먼저 로드돼야 해'); return; }

  var win = null, tab = 'char', lineChar = 'a', openGroups = { 0: true };

  /* ─────────────────────────── 스타일 ─────────────────────────── */
  function injectStyle() {
    if (document.getElementById('smjs-style')) return;
    var css = [
      '.smjs{position:fixed;z-index:9100;display:none;flex-direction:column;padding:3px;color:var(--dds-win-fg,#e4e4e2);',
      '  background:repeating-linear-gradient(90deg,rgba(255,255,255,.06) 0,rgba(255,255,255,.06) 1px,rgba(0,0,0,.16) 1px,rgba(0,0,0,.16) 2px,rgba(0,0,0,0) 2px,rgba(0,0,0,0) 4px),var(--dds-face,#3a3a3a);',
      '  border:1px solid var(--dds-accent-dark,var(--dds-face-dark,#131313));border-radius:var(--dds-win-radius,0);',
      '  box-shadow:var(--dds-surface-raised,inset 1px 1px 0 #565656,inset -1px -1px 0 #1e1e1e),var(--dds-shadow-win,4px 4px 0 rgba(0,0,0,.45),8px 10px 22px rgba(0,0,0,.4));',
      '  font-family:var(--dds-font-body,system-ui,sans-serif);width:420px;max-width:calc(100vw - 24px);max-height:calc(100vh - 90px)}',
      '.smjs-tb{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;user-select:none;',
      '  padding:5px 6px 5px 9px;color:var(--dds-win-fg,#e4e4e2);font-family:var(--dds-font-pixel,monospace);',
      '  font-size:var(--dds-text-ui,16px);letter-spacing:var(--dds-pixel-tracking,.5px);',
      '  background:linear-gradient(180deg,var(--dds-accent-dark,#545454) 0%,color-mix(in srgb,var(--dds-accent-dark,#424242) 86%,#000) 100%)}',
      '.smjs-x{width:20px;height:18px;padding:0;line-height:1;display:grid;place-items:center;cursor:pointer;',
      '  background:var(--dds-face,#3a3a3a);border:var(--dds-surface-border,1px solid #131313);border-radius:0;',
      '  box-shadow:var(--dds-surface-raised,inset 1px 1px 0 #565656,inset -1px -1px 0 #1e1e1e);',
      '  font-family:var(--dds-font-pixel,monospace);font-size:var(--dds-text-ui,16px);color:#23261f}',
      '.smjs-tabs{display:flex;gap:3px;padding:8px 10px 0}',
      '.smjs-body{padding:10px;overflow:auto;flex:1;min-height:0;',
      '  background:var(--dds-win-bg,#2f2f2f)}',
      '.smjs-b{background:var(--dds-face,#3a3a3a);border:1px solid var(--dds-face-dark,#131313);border-radius:0;cursor:pointer;',
      '  box-shadow:var(--dds-surface-raised,inset 1px 1px 0 #565656,inset -1px -1px 0 #1e1e1e);',
      '  color:var(--dds-win-fg,#e4e4e2);font-family:var(--dds-font-pixel,monospace);font-size:11px;',
      '  letter-spacing:var(--dds-pixel-tracking,.5px);padding:4px 9px;line-height:1.5}',
      '.smjs-b:active{box-shadow:var(--dds-surface-sunken,inset -1px -1px 0 #565656,inset 1px 1px 0 #1e1e1e)}',
      '.smjs-b.on{background:var(--dds-accent,#c37822);box-shadow:inset -1px -1px 0 rgba(255,255,255,.25),inset 1px 1px 0 rgba(0,0,0,.35)}',
      '.smjs-b.mini{padding:2px 6px;min-width:22px}',
      '.smjs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;font-size:12.5px}',
      '.smjs-row>label{color:#b9b9b4;flex:1}',
      '.smjs-in{background:var(--dds-win-bg,#2f2f2f);border:1px solid var(--dds-face-dark,#131313);border-radius:0;',
      '  box-shadow:var(--dds-surface-sunken,inset -1px -1px 0 #565656,inset 1px 1px 0 #1e1e1e);',
      '  color:var(--dds-win-fg,#e4e4e2);font-family:var(--dds-font-pixel,monospace);font-size:11px;',
      '  padding:4px 6px;outline:none;width:100%}',
      '.smjs-in:focus{outline:1px dotted var(--dds-accent,#c37822);outline-offset:-3px}',
      'textarea.smjs-in{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;line-height:1.6;resize:vertical}',
      '.smjs-sec{border:1px solid var(--dds-face-dark,#131313);margin-bottom:8px}',
      '.smjs-sec>h4{margin:0;padding:6px 9px;font-family:var(--dds-font-pixel,monospace);font-size:12px;font-weight:400;',
      '  letter-spacing:var(--dds-pixel-tracking,.5px);background:var(--dds-face,#3a3a3a);cursor:pointer;',
      '  display:flex;justify-content:space-between;gap:8px;color:var(--dds-win-fg,#e4e4e2)}',
      '.smjs-sec>div{padding:9px;display:none}',
      '.smjs-sec.open>div{display:block}',
      '.smjs-ln{display:flex;gap:3px;margin-bottom:3px}',
      '.smjs-ln .smjs-in{flex:1;min-width:0}',
      '.smjs-hint{color:#9a9a95;font-size:11px;line-height:1.6;margin-top:7px}',
      '.smjs-none{color:#9a9a95;font-size:11px;padding:2px 0 4px}',
      '.smjs-sw{position:relative;width:34px;height:19px;flex:none}',
      '.smjs-sw input{opacity:0;width:100%;height:100%;margin:0;cursor:pointer}',
      '.smjs-sw i{position:absolute;inset:0;background:var(--dds-face-dark,#131313);pointer-events:none;',
      '  box-shadow:var(--dds-surface-sunken,inset -1px -1px 0 #565656,inset 1px 1px 0 #1e1e1e)}',
      '.smjs-sw i:after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;transition:.15s;',
      '  background:var(--dds-face,#3a3a3a);box-shadow:var(--dds-surface-raised,inset 1px 1px 0 #565656)}',
      '.smjs-sw input:checked+i:after{left:18px;background:var(--dds-accent,#c37822)}',
      '.smjs-mini-lbl{width:56px;flex:none;color:#9a9a95;font-size:11px}',
      '.smjs input[type=range]{-webkit-appearance:none;appearance:none;height:18px;background:transparent;flex:none}',
      '.smjs input[type=range]::-webkit-slider-runnable-track{height:6px;background:var(--dds-win-bg,#2f2f2f);',
      '  border:1px solid var(--dds-face-dark,#131313);box-shadow:inset 1px 1px 0 rgba(0,0,0,.5)}',
      '.smjs input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:17px;margin-top:-7px;',
      '  background:var(--dds-face,#3a3a3a);border:1px solid var(--dds-face-dark,#131313);',
      '  box-shadow:var(--dds-surface-raised,inset 1px 1px 0 #565656,inset -1px -1px 0 #1e1e1e)}',
      '.smjs input[type=range]::-moz-range-track{height:6px;background:var(--dds-win-bg,#2f2f2f);border:1px solid var(--dds-face-dark,#131313)}',
      '.smjs input[type=range]::-moz-range-thumb{width:9px;height:15px;border-radius:0;background:var(--dds-face,#3a3a3a);border:1px solid var(--dds-face-dark,#131313)}',
      '.smjs select.smjs-in{-webkit-appearance:none;appearance:none;cursor:pointer}'
    ].join('\n');
    var el = document.createElement('style');
    el.id = 'smjs-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function charById(id) { for (var i = 0; i < S.CHARS.length; i++) if (S.CHARS[i].id === id) return S.CHARS[i]; return S.CHARS[0]; }
  var PREF = { 2: '좋아함', 1: '보통', 0: '싫어함' };
  /* 창 컨트롤 아이콘 — 스킨 번들의 실제 경로 데이터를 그대로 사용
     출처: Pixel Icon Library (CC BY 4.0) / Pixelarticons (MIT) */
  function closeIcon() {
    return '<svg viewBox="0 0 24 24" width="12" height="12" class="dds-icon" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M14 13L15 13L15 14L16 14L16 15L17 15L17 16L18 16L18 17L19 17L19 18L20 18L20 19L21 19L21 20L22 20L22 21L21 21L21 22L20 22L20 21L19 21L19 20L18 20L18 19L17 19L17 18L16 18L16 17L15 17L15 16L14 16L14 15L13 15L13 14L11 14L11 15L10 15L10 16L9 16L9 17L8 17L8 18L7 18L7 19L6 19L6 20L5 20L5 21L4 21L4 22L3 22L3 21L2 21L2 20L3 20L3 19L4 19L4 18L5 18L5 17L6 17L6 16L7 16L7 15L8 15L8 14L9 14L9 13L10 13L10 11L9 11L9 10L8 10L8 9L7 9L7 8L6 8L6 7L5 7L5 6L4 6L4 5L3 5L3 4L2 4L2 3L3 3L3 2L4 2L4 3L5 3L5 4L6 4L6 5L7 5L7 6L8 6L8 7L9 7L9 8L10 8L10 9L11 9L11 10L13 10L13 9L14 9L14 8L15 8L15 7L16 7L16 6L17 6L17 5L18 5L18 4L19 4L19 3L20 3L20 2L21 2L21 3L22 3L22 4L21 4L21 5L20 5L20 6L19 6L19 7L18 7L18 8L17 8L17 9L16 9L16 10L15 10L15 11L14 11L14 13z"/></svg>';
  }

  /* ───────────────── 이미지 업로드 (파일 → 축소 → 데이터 주소) ─────────────────
     티스토리에는 우리가 쓸 업로드 서버가 없어서, 고른 파일을 그림 데이터 자체로
     설정에 담는다. 파일을 따로 올릴 필요가 없고 설정만 옮기면 캐릭터가 따라간다.
     대신 용량이 곧 설정 크기라서 자동으로 줄여 넣는다. */
  var MAX_SIDE = 256;
  function fileToImage(file, maxSide) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('파일을 읽지 못했어')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { rej(new Error('이미지 형식이 아니야')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, maxSide / Math.max(w, h));   // 키우지는 않는다
          var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var cx = cv.getContext('2d');
          cx.imageSmoothingEnabled = k < 1;                 // 축소할 때만 보간
          cx.drawImage(img, 0, 0, cw, ch);
          var out = fr.result;                              // 원본
          try {
            var webp = cv.toDataURL('image/webp', 0.92);
            var png = cv.toDataURL('image/png');
            var best = (webp.indexOf('data:image/webp') === 0 && webp.length < png.length) ? webp : png;
            if (best.length < out.length) out = best;       // 원본이 더 작으면 원본 유지
          } catch (e) { /* 캔버스가 막히면 원본 그대로 */ }
          res({ url: out, w: cw, h: ch, bytes: Math.round(out.length * 0.75) });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function kb(n) { return n < 1024 ? n + 'B' : (n / 1024).toFixed(1) + 'KB'; }

  var picker = null, pickTarget = null;
  function ensurePicker() {
    if (picker) return picker;
    picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.style.display = 'none';
    picker.addEventListener('change', function () {
      var files = Array.prototype.slice.call(picker.files || []);
      picker.value = '';
      if (!files.length || !pickTarget) return;
      var t = pickTarget; pickTarget = null;
      Promise.all(files.map(function (f) { return fileToImage(f, MAX_SIDE); }))
        .then(function (list) {
          var urls = list.map(function (x) { return x.url; });
          var total = list.reduce(function (a, x) { return a + x.bytes; }, 0);
          if (t.kind === 'char') {
            var c = charById(t.id);
            if (t.state) c.sprites[t.state] = urls;
            else S.STATES.forEach(function (s) { c.sprites[s] = urls.slice(); });
            S.applyChars();
          } else if (t.kind === 'food') {
            S.FOODS[t.index].image = urls[0];
            S.refreshFoods();
          }
          render();
          toast(list.length + '장 넣었어 · ' + list[0].w + '×' + list[0].h + ' · ' + kb(total) +
                (total > 200 * 1024 ? ' — 좀 큰 편이야, 더 작은 그림을 권해' : ''));
        })
        .catch(function (e) { toast('실패: ' + e.message); });
    });
    document.body.appendChild(picker);
    return picker;
  }
  function pick(target) { pickTarget = target; ensurePicker().click(); }

  var toastEl = null;
  function toast(msg) {
    if (!win) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:absolute;left:10px;right:10px;bottom:8px;padding:6px 9px;font-size:11.5px;' +
        'background:var(--dds-accent,#c37822);color:#fff;pointer-events:none;opacity:0;transition:.2s;z-index:5';
      win.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 3200);
  }
  function isData(u) { return typeof u === 'string' && u.indexOf('data:') === 0; }
  function shortSrc(u) { return isData(u) ? '(넣은 그림 ' + kb(Math.round(u.length * 0.75)) + ')' : u; }

  /* ─────────────────────────── 창 뼈대 ─────────────────────────── */
  function build() {
    injectStyle();
    win = document.createElement('div');
    win.className = 'smjs';
    win.innerHTML =
      '<div class="smjs-tb"><span>시메지 설정</span><button class="smjs-x" title="닫기">' + closeIcon() + '</button></div>' +
      '<div class="smjs-tabs">' +
        '<button class="smjs-b" data-t="char">캐릭터</button>' +
        '<button class="smjs-b" data-t="lines">대사</button>' +
        '<button class="smjs-b" data-t="food">밥</button>' +
        '<button class="smjs-b" data-t="move">동작</button>' +
        '<button class="smjs-b" data-t="save">저장</button>' +
      '</div>' +
      '<div class="smjs-body"></div>';
    document.body.appendChild(win);

    var r = { x: Math.max(12, innerWidth / 2 - 210), y: Math.max(12, innerHeight / 2 - 250) };
    win.style.left = r.x + 'px'; win.style.top = r.y + 'px';

    win.querySelector('.smjs-x').onclick = close;
    win.querySelector('.smjs-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      tab = b.dataset.t; render();
    });
    dragBy(win.querySelector('.smjs-tb'));
    wireBody();
    render();
  }

  function dragBy(bar) {
    var g = null;
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY,
            ox: parseFloat(win.style.left) || 0, oy: parseFloat(win.style.top) || 0 };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      win.style.left = Math.max(0, Math.min(innerWidth - 80, g.ox + e.clientX - g.x)) + 'px';
      win.style.top = Math.max(0, Math.min(innerHeight - 60, g.oy + e.clientY - g.y)) + 'px';
    });
    bar.addEventListener('pointerup', function () { g = null; });
  }

  function open() { if (!win) build(); win.style.display = 'flex'; render(); }
  function close() { if (win) win.style.display = 'none'; }

  /* ─────────────────────────── 탭 그리기 ─────────────────────────── */
  function render() {
    if (!win) return;
    win.querySelectorAll('[data-t]').forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); });
    var host = win.querySelector('.smjs-body');
    host.innerHTML =
      tab === 'char' ? charTab() :
      tab === 'lines' ? linesTab() :
      tab === 'food' ? foodTab() :
      tab === 'move' ? moveTab() : saveTab();
  }

  function sw(id, label, on) {
    return '<div class="smjs-row"><label>' + label + '</label>' +
      '<span class="smjs-sw"><input type="checkbox" data-sw="' + id + '"' + (on ? ' checked' : '') + '><i></i></span></div>';
  }
  function rng(id, label, val, min, max, step, disp) {
    return '<div class="smjs-row"><label>' + label + ' <b data-v="' + id + '">' + disp + '</b></label>' +
      '<input type="range" data-rg="' + id + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + val + '" style="width:118px"></div>';
  }

  function charTab() {
    return S.CHARS.map(function (c, i) {
      var sprites = S.STATES.map(function (s) {
        var arr = c.sprites[s] || [];
        var val = arr.length && isData(arr[0]) ? '(넣은 그림 ' + arr.length + '장)' : arr.join(', ');
        return '<div class="smjs-ln"><span class="smjs-mini-lbl">' + S.STATE_LABEL[s] + '</span>' +
          '<input class="smjs-in" data-sp="' + c.id + '|' + s + '" placeholder="비우면 기본 이미지" value="' + esc(val) + '"' +
          (arr.length && isData(arr[0]) ? ' readonly' : '') + '>' +
          '<button class="smjs-b mini" data-act="pick|' + c.id + '|' + s + '" title="파일 고르기">📁</button></div>';
      }).join('');
      var cur = (c.sprites.stand || [])[0] || '';
      var prefs = (S.FOODS || []).map(function (f) {
        var v = c.pref[f.id] == null ? 1 : c.pref[f.id];
        return '<div class="smjs-ln"><span class="smjs-mini-lbl">' + esc(f.name) + '</span>' +
          '<select class="smjs-in" data-pf="' + c.id + '|' + f.id + '">' +
          [2, 1, 0].map(function (n) { return '<option value="' + n + '"' + (n === v ? ' selected' : '') + '>' + PREF[n] + '</option>'; }).join('') +
          '</select></div>';
      }).join('');
      return '<div class="smjs-sec' + (i === 0 ? ' open' : '') + '"><h4><span>' + esc(c.name) + '</span><span>' + (c.on ? '켜짐' : '꺼짐') + '</span></h4><div>' +
        sw('char|' + c.id + '|on', '이 캐릭터 사용', c.on) +
        '<div class="smjs-row"><label>이름</label><input class="smjs-in" style="width:130px" data-nm="' + c.id + '" value="' + esc(c.name) + '"></div>' +
        rng('size|' + c.id, '크기', c.size, 48, 220, 1, c.size + 'px') +
        rng('speed|' + c.id, '속도', Math.round(c.speed * 10), 3, 40, 1, c.speed.toFixed(1)) +
        '<div class="smjs-row" style="display:block">' +
        '<label style="display:block;margin-bottom:4px">캐릭터 그림 (한 장이면 충분)</label>' +
        (isData(cur)
          ? '<div style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--dds-win-bg,#2f2f2f);' +
            'border:1px solid var(--dds-face-dark,#131313);box-shadow:var(--dds-surface-sunken,inset 1px 1px 0 #1e1e1e)">' +
            '<img src="' + cur + '" alt="" style="width:48px;height:48px;object-fit:contain;image-rendering:pixelated">' +
            '<span style="font-size:11px;color:#b9b9b4">' + shortSrc(cur) + '</span></div>'
          : '<input class="smjs-in" data-img="' + c.id + '" placeholder="비우면 도형 캐릭터" value="' + esc(cur) + '">') +
        '</div>' +
        '<div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">' +
        '<button class="smjs-b on" data-act="pick|' + c.id + '|">컴퓨터에서 고르기…</button>' +
        (isData(cur) ? '' : '<button class="smjs-b" data-act="img|' + c.id + '">주소 적용</button>') +
        '<button class="smjs-b" data-act="imgclear|' + c.id + '">도형으로</button></div>' +
        '<div class="smjs-hint">고른 그림은 긴 쪽 ' + MAX_SIDE + 'px 로 줄여서 설정에 담겨. 파일을 따로 올릴 필요 없어.</div>' +
        '<div class="smjs-sec" style="margin-top:9px"><h4><span>상태별 이미지 (선택)</span><span>▸</span></h4><div>' + sprites +
        '<button class="smjs-b" data-act="sprites|' + c.id + '" style="margin-top:5px">상태별 적용</button></div></div>' +
        '<div class="smjs-sec"><h4><span>밥 취향</span><span>▸</span></h4><div>' + (prefs || '<div class="smjs-none">밥 종류가 없어</div>') + '</div></div>' +
        '</div></div>';
    }).join('');
  }

  function linesTab() {
    var c = charById(lineChar);
    var picker = '<div style="display:flex;gap:3px;margin-bottom:9px">' +
      S.CHARS.map(function (x) {
        return '<button class="smjs-b' + (x.id === lineChar ? ' on' : '') + '" data-lc="' + x.id + '">' + esc(x.name) + '</button>';
      }).join('') + '</div>';
    var body = S.LINE_GROUPS.map(function (g, gi) {
      var total = 0;
      g[1].forEach(function (s) { total += (c.lines[s[0]] || []).length; });
      var inner = g[1].map(function (s) {
        var key = s[0], arr = c.lines[key] || [];
        var rows = arr.map(function (v, i) {
          return '<div class="smjs-ln"><input class="smjs-in" data-li="' + key + '|' + i + '" value="' + esc(v) + '">' +
            '<button class="smjs-b mini" data-act="say|' + key + '|' + i + '" title="말해보기">▶</button>' +
            '<button class="smjs-b mini" data-act="del|' + key + '|' + i + '" title="삭제">×</button></div>';
        }).join('');
        return '<div style="margin-bottom:9px"><div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">' +
          '<b style="flex:1;font-size:11.5px">' + s[1] + '</b>' +
          '<span style="color:#9a9a95;font-size:10.5px">' + arr.length + '개</span>' +
          '<button class="smjs-b mini" data-act="add|' + key + '" title="추가">+</button>' +
          '<button class="smjs-b mini" data-act="paste|' + key + '" title="여러 줄 붙여넣기">≡</button></div>' +
          (rows || '<div class="smjs-none">대사 없음 — 이 상황에선 조용히 있어</div>') + '</div>';
      }).join('');
      return '<div class="smjs-sec' + (openGroups[gi] ? ' open' : '') + '"><h4 data-g="' + gi + '"><span>' + g[0] + '</span><span>' + total + '개</span></h4><div>' + inner + '</div></div>';
    }).join('');
    return picker + body + '<div class="smjs-hint">칸에 하나씩 적으면 바로 저장돼. ▶ 를 누르면 그 대사를 실제로 말해봐.</div>';
  }

  function foodTab() {
    var list = (S.FOODS || []).map(function (f, i) {
      return '<div class="smjs-sec open"><h4><span>' + esc(f.name) + '</span>' +
        '<span><button class="smjs-b mini" data-act="give|' + f.id + '">주기</button> ' +
        '<button class="smjs-b mini" data-act="fdel|' + i + '">×</button></span></h4><div>' +
        '<div class="smjs-ln"><span class="smjs-mini-lbl">이름</span><input class="smjs-in" data-fn="' + i + '" value="' + esc(f.name) + '"></div>' +
        '<div class="smjs-ln"><span class="smjs-mini-lbl">이미지</span>' +
        '<input class="smjs-in" data-fu="' + i + '" placeholder="비우면 기본 밥그릇" value="' + esc(isData(f.image) ? shortSrc(f.image) : f.image) + '"' + (isData(f.image) ? ' readonly' : '') + '>' +
        '<button class="smjs-b mini" data-act="fpick|' + i + '" title="파일 고르기">📁</button>' +
        (f.image ? '<button class="smjs-b mini" data-act="fclear|' + i + '" title="비우기">×</button>' : '') + '</div>' +
        rng('fsize|' + i, '크기', f.size, 24, 140, 1, f.size + 'px') +
        '</div></div>';
    }).join('');
    return list +
      '<div style="display:flex;gap:4px;margin:6px 0 10px"><button class="smjs-b" data-act="fadd">+ 종류 추가</button>' +
      '<button class="smjs-b" data-act="grand">랜덤으로 주기</button></div>' +
      sw('PET|on', '배고픔 사용', S.PET.on) +
      rng('hungerH', '배고파지는 시간', S.PET.hungerH, 1, 24, 1, S.PET.hungerH + '시간') +
      '<div class="smjs-hint">배고픔은 대사로 말하지 않고 자세·속도로만 드러나. 창을 닫아둔 동안은 ' +
      Math.round(S.PET.offlineRate * 100) + '% 속도로만 줄어들어.</div>';
  }

  function moveTab() {
    return sw('G|auto', '자율 행동', S.G.auto) +
      sw('G|talk', '대사 말풍선', S.G.talk) +
      sw('G|climb', '벽 타기', S.G.climb) +
      sw('G|walkOnWindows', '창 지붕 위 걷기', S.G.walkOnWindows) +
      sw('G|follow', '커서 따라오기', S.G.follow) +
      '<div class="smjs-sec open" style="margin-top:9px"><h4><span>두 마리 관계</span><span></span></h4><div>' +
      sw('SOCIAL|greet', '만나면 인사', S.SOCIAL.greet) +
      sw('SOCIAL|fight', '티격태격 싸움', S.SOCIAL.fight) +
      rng('fightChance', '마주쳤을 때 싸울 확률', Math.round(S.SOCIAL.fightChance * 100), 0, 100, 5, Math.round(S.SOCIAL.fightChance * 100) + '%') +
      sw('SOCIAL|makeUp', '싸운 뒤 화해', S.SOCIAL.makeUp) +
      sw('SOCIAL|sleepTogether', '같이 자기', S.SOCIAL.sleepTogether) +
      '</div></div>' +
      '<div class="smjs-sec open"><h4><span>물리</span><span></span></h4><div>' +
      rng('gravity', '중력', Math.round(S.G.gravity * 100), 10, 200, 5, S.G.gravity.toFixed(2)) +
      rng('bounce', '튕김', Math.round(S.G.bounce * 100), 0, 90, 5, S.G.bounce.toFixed(2)) +
      '</div></div>' +
      '<div class="smjs-sec open"><h4><span>스티커</span><span></span></h4><div>' +
      sw('lock', '스티커 잠금 (실수로 안 밀리게)', S.isLocked()) +
      '<div class="smjs-hint">부유·숨쉬기 애니메이션은 shimeji.css 에서 이미 꺼져 있어.</div>' +
      '</div></div>';
  }

  function saveTab() {
    var size = 0;
    try { size = new Blob([JSON.stringify(snapshot())]).size; } catch (e) { size = JSON.stringify(snapshot()).length; }
    var heavy = size > 300 * 1024;
    return '<div class="smjs-row"><label>지금 설정 크기</label><b>' + kb(size) + '</b></div>' +
      (heavy ? '<div class="smjs-hint" style="color:#ffcf8a">그림이 커서 설정이 무거워. 캐릭터 그림을 더 작게 넣으면 줄어들어.</div>' : '') +
      '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">' +
      '<button class="smjs-b on" data-act="store">' + (isOwner() ? '저장' : '이 브라우저에 저장') + '</button>' +
      '<button class="smjs-b" data-act="forget">저장한 것 지우기</button>' +
      '<button class="smjs-b" data-act="export">설정 코드 만들기</button>' +
      '</div>' +
      (isOwner()
        ? '<div class="smjs-hint"><b>저장하면 손님 화면에도 그대로 보여.</b> 서버에 보관되니까 ' +
          '다른 기기에서 들어와도 똑같아.<br>' +
          '뭐든 바꾸면 <b>자동으로도 저장</b>되니까 이 버튼은 확인용이야. ' +
          '<b>설정 코드 만들기</b>는 백업이나 다른 사람에게 넘겨줄 때만 쓰면 돼.</div>'
        : '<div class="smjs-hint"><b>이 브라우저에 저장</b>은 네 화면에서만 적용돼. ' +
          '다른 사람에게는 주인이 정해둔 설정이 보여.</div>') +
      '<textarea class="smjs-in" id="smjs-out" rows="12" spellcheck="false" style="margin-top:9px" placeholder="설정 코드 만들기를 누르면 여기에 나와"></textarea>' +
      '<div style="display:flex;gap:4px;margin-top:5px"><button class="smjs-b" data-act="copy">복사</button></div>';
  }

  /* ─────────────────────────── 이벤트 ─────────────────────────── */
  function wireBody() {
    var host = win.querySelector('.smjs-body');

    host.addEventListener('click', function (e) {
      var h = e.target.closest('h4[data-g], .smjs-sec>h4');
      var b = e.target.closest('button');
      /* 대사 탭의 캐릭터 고르기 버튼 — 버튼은 change 를 안 쏘니 여기서 처리한다 */
      if (b && b.dataset.lc != null) { lineChar = b.dataset.lc; render(); return; }
      if (b) { doAction(b); return; }
      if (h) {
        if (h.hasAttribute('data-g')) openGroups[+h.dataset.g] = !openGroups[+h.dataset.g];
        h.parentNode.classList.toggle('open');
      }
    });

    host.addEventListener('input', function (e) {
      var t = e.target, d = t.dataset;
      if (d.li != null) {
        var p = d.li.split('|'), c = charById(lineChar);
        (c.lines[p[0]] = c.lines[p[0]] || [])[+p[1]] = t.value;
      } else if (d.nm != null) {
        charById(d.nm).name = t.value || d.nm; render();
      } else if (d.fn != null) {
        S.FOODS[+d.fn].name = t.value;
      } else if (d.fu != null) {
        S.FOODS[+d.fu].image = t.value.trim(); S.refreshFoods();
      } else if (d.rg != null) {
        applyRange(d.rg, +t.value, t);
      }
    });

    host.addEventListener('change', function (e) {
      var t = e.target, d = t.dataset;
      if (d.sw != null) applySwitch(d.sw, t.checked);
      else if (d.pf != null) {
        var p = d.pf.split('|');
        charById(p[0]).pref[p[1]] = +t.value;
      }
      else if (d.lc != null) { lineChar = d.lc; render(); }
    });

    /* 바뀔 때마다 자동 저장 (위 핸들러들이 먼저 값을 반영한 뒤에 돈다) */
    host.addEventListener('input', autoSave);
    host.addEventListener('change', autoSave);
    host.addEventListener('click', function (e) { if (e.target.closest('button')) autoSave(); });
  }

  function applySwitch(key, on) {
    var p = key.split('|');
    if (p[0] === 'char') { charById(p[1]).on = on; S.applyChars(); render(); }
    else if (p[0] === 'G') { S.G[p[1]] = on; }
    else if (p[0] === 'SOCIAL') { S.SOCIAL[p[1]] = on; }
    else if (p[0] === 'PET') { S.PET[p[1]] = on; }
    else if (key === 'lock') { S.setLock(on); }
  }

  function applyRange(key, v, el) {
    var p = key.split('|'), disp = v, out = win.querySelector('[data-v="' + key + '"]');
    if (p[0] === 'size') { charById(p[1]).size = v; disp = v + 'px'; S.applyChars(); }
    else if (p[0] === 'speed') { charById(p[1]).speed = v / 10; disp = (v / 10).toFixed(1); }
    else if (p[0] === 'fsize') { S.FOODS[+p[1]].size = v; disp = v + 'px'; S.refreshFoods(); }
    else if (key === 'gravity') { S.G.gravity = v / 100; disp = (v / 100).toFixed(2); }
    else if (key === 'bounce') { S.G.bounce = v / 100; disp = (v / 100).toFixed(2); }
    else if (key === 'fightChance') { S.SOCIAL.fightChance = v / 100; disp = v + '%'; }
    else if (key === 'hungerH') { S.PET.hungerH = v; disp = v + '시간'; }
    if (out) out.textContent = disp;
  }

  function doAction(b) {
    var a = b.dataset.act;
    if (!a) return;
    var p = a.split('|'), c;

    if (p[0] === 'pick') { pick({ kind: 'char', id: p[1], state: p[2] || null }); return; }
    if (p[0] === 'fpick') { pick({ kind: 'food', index: +p[1] }); return; }
    if (p[0] === 'fclear') { S.FOODS[+p[1]].image = ''; S.refreshFoods(); render(); return; }

    if (p[0] === 'img') {
      c = charById(p[1]);
      var el0 = win.querySelector('[data-img="' + p[1] + '"]');
      if (!el0) return;
      var v = el0.value.trim();
      S.STATES.forEach(function (s) { c.sprites[s] = v ? [v] : []; });
      S.applyChars(); render();
    }
    else if (p[0] === 'imgclear') {
      c = charById(p[1]);
      S.STATES.forEach(function (s) { c.sprites[s] = []; });
      S.applyChars(); render();
    }
    else if (p[0] === 'sprites') {
      c = charById(p[1]);
      S.STATES.forEach(function (s) {
        var el = win.querySelector('[data-sp="' + p[1] + '|' + s + '"]');
        if (!el || el.readOnly) return;          // 파일로 넣은 그림은 건드리지 않는다
        var v = el.value.trim();
        c.sprites[s] = v ? v.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      });
      S.applyChars(); render();
    }
    else if (p[0] === 'add') {
      c = charById(lineChar);
      (c.lines[p[1]] = c.lines[p[1]] || []).push('');
      render();
      var ins = win.querySelectorAll('[data-li^="' + p[1] + '|"]');
      if (ins.length) ins[ins.length - 1].focus();
    }
    else if (p[0] === 'del') {
      c = charById(lineChar);
      c.lines[p[1]].splice(+p[2], 1); render();
    }
    else if (p[0] === 'say') {
      c = charById(lineChar);
      var txt = (c.lines[p[1]] || [])[+p[2]] || '(빈 대사)';
      var m = null;
      S.mascots.forEach(function (x) { if (x.c === c) m = x; });
      if (!m) { alert('이 캐릭터가 꺼져 있어. 캐릭터 탭에서 켜줘.'); return; }
      m.bubble.textContent = txt;
      m.bubble.classList.remove('angry');
      m.bubble.classList.add('on');
      clearTimeout(m.bubbleTimer);
      m.bubbleTimer = setTimeout(function () { m.bubble.classList.remove('on'); }, S.G.bubbleMs || 2600);
    }
    else if (p[0] === 'paste') {
      c = charById(lineChar);
      var cur = (c.lines[p[1]] || []).join('\n');
      var v2 = prompt('한 줄에 대사 하나씩 붙여넣어. 확인하면 이 상황의 대사가 통째로 바뀌어.', cur);
      if (v2 == null) return;
      c.lines[p[1]] = v2.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      render();
    }
    else if (p[0] === 'give') { S.dropFood(p[1]); }
    else if (p[0] === 'grand') { S.dropFood(); }
    else if (p[0] === 'fadd') {
      var id = 'food' + (Date.now() % 100000);
      S.FOODS.push({ id: id, name: '새 밥', image: '', size: 50 });
      S.CHARS.forEach(function (x) { x.pref[id] = 1; });
      render();
    }
    else if (p[0] === 'fdel') {
      if (S.FOODS.length <= 1) return;
      var gone = S.FOODS.splice(+p[1], 1)[0];
      S.foods.slice().forEach(function (f) { if (f.type === gone) f.kill(); });
      S.CHARS.forEach(function (x) { delete x.pref[gone.id]; });
      render();
    }
    else if (p[0] === 'store') {
      storeConfig();
      b.textContent = isOwner() ? '저장했어 · 손님에게도 반영' : '저장됨!';
      setTimeout(function () { b.textContent = isOwner() ? '저장' : '이 브라우저에 저장'; }, 1800);
    }
    else if (p[0] === 'forget') {
      noAuto = true;                                  // 지운 걸 자동저장이 되살리지 않게
      try { localStorage.removeItem('smj:config'); } catch (e) {}
      b.textContent = '지웠어 (새로고침하면 기본값)';
      setTimeout(function () { b.textContent = '저장한 것 지우기'; }, 1800);
    }
    else if (p[0] === 'export') {
      var out = win.querySelector('#smjs-out');
      out.value = exportCode(); out.select();
    }
    else if (p[0] === 'copy') {
      var o2 = win.querySelector('#smjs-out');
      o2.select();
      try { document.execCommand('copy'); b.textContent = '복사됨!'; setTimeout(function () { b.textContent = '복사'; }, 1400); } catch (e) {}
    }
  }

  /* ─────────────────────────── 저장 / 내보내기 ─────────────────────────── */
  function snapshot() {
    return {
      G: S.G, SOCIAL: S.SOCIAL, PET: S.PET, STICKER: S.STICKER, FOODS: S.FOODS,
      CHARS: S.CHARS.map(function (c) {
        return { id: c.id, name: c.name, on: c.on, size: c.size, speed: c.speed,
                 pref: c.pref, sprites: c.sprites, lines: c.lines };
      })
    };
  }
  function storeConfig(quiet) {
    var snap = snapshot();
    try { localStorage.setItem('smj:config', JSON.stringify(snap)); }
    catch (e) { if (!quiet) alert('저장 실패: ' + e.message); return; }
    /* 주인이면 서버에도 보내둔다 — 다른 기기나 손님 화면에도 같은 설정이 뜨도록 */
    pushToServer(snap);
  }

  /* 주인인지 — 주인이 저장하면 서버에 올라가서 손님 화면에도 반영된다 */
  function isOwner() {
    try {
      var r = window.tiara && window.tiara.customProps && window.tiara.customProps.role;
      return typeof r === 'string' && /^(owner|manager|editor)$/i.test(r);
    } catch (e) { return false; }
  }

  var pushT = null;
  function pushToServer(snap) {
    if (!isOwner()) return;
    clearTimeout(pushT);
    pushT = setTimeout(function () {
      fetch('/api/shimeji', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snap),
        credentials: 'same-origin'
      }).catch(function () {});
    }, 600);
  }

  /* 뭐라도 바꾸면 바로 저장한다 — "새로고침하니 날아갔다"가 없도록 */
  var autoT = null, noAuto = false;
  function autoSave() {
    if (noAuto) return;
    clearTimeout(autoT);
    autoT = setTimeout(function () { storeConfig(true); }, 350);
  }

  function exportCode() {
    var j = JSON.stringify, G = S.G, SO = S.SOCIAL, P = S.PET;
    var keys = [];
    S.LINE_GROUPS.forEach(function (g) { g[1].forEach(function (s) { keys.push(s[0]); }); });
    function charCode(c) {
      return '    {\n      id: ' + j(c.id) + ', name: ' + j(c.name) + ', on: ' + c.on +
        ', size: ' + c.size + ', speed: ' + c.speed + ',\n' +
        '      pref: ' + j(c.pref) + ',\n' +
        '      sprites: {\n' + S.STATES.map(function (s) { return '        ' + s + ': ' + j(c.sprites[s] || []); }).join(',\n') + '\n      },\n' +
        '      lines: {\n' + keys.map(function (k) { return '        ' + k + ': ' + j((c.lines[k] || []).filter(Boolean)); }).join(',\n') + '\n      }\n    }';
    }
    var blob = JSON.stringify(S.CHARS) + JSON.stringify(S.FOODS);
    return 'var G = {\n' +
      '    gravity: ' + G.gravity + ', bounce: ' + G.bounce + ', airDrag: 0.995, groundDrag: 0.86,\n' +
      '    climbChance: 0.55, sleepAfter: ' + G.sleepAfter + ', bubbleMs: ' + G.bubbleMs + ',\n' +
      '    auto: ' + G.auto + ', talk: ' + G.talk + ', climb: ' + G.climb + ', follow: ' + G.follow +
      ', walkOnWindows: ' + G.walkOnWindows + '\n  };\n\n' +
      '  var SOCIAL = { greet: ' + SO.greet + ', fight: ' + SO.fight + ', fightChance: ' + SO.fightChance +
      ', makeUp: ' + SO.makeUp + ', sleepTogether: ' + SO.sleepTogether + ' };\n\n' +
      '  var PET = {\n    on: ' + P.on + ', ownerOnly: ' + P.ownerOnly + ', save: ' + P.save +
      ',\n    hungerH: ' + P.hungerH + ', moodH: ' + P.moodH + ', offlineRate: ' + P.offlineRate +
      ', offlineCapH: ' + P.offlineCapH + ',\n    hungryAt: ' + P.hungryAt + ', starvingAt: ' + P.starvingAt +
      ', grumpyAt: ' + P.grumpyAt + ', closeAt: ' + P.closeAt + ',\n    bondPerDay: ' + P.bondPerDay +
      ', bondDecayPerDay: ' + P.bondDecayPerDay + ', awayHours: ' + P.awayHours + '\n  };\n\n' +
      '  var STICKER = { lock: ' + S.STICKER.lock + ', alwaysShowLock: ' + S.STICKER.alwaysShowLock + ' };\n\n' +
      '  var FOODS = [\n' + S.FOODS.map(function (f) {
        return '    { id: ' + j(f.id) + ', name: ' + j(f.name) +
          ', image: ' + j(f.image.indexOf('blob:') === 0 ? './images/' + f.id + '.png' : f.image) + ', size: ' + f.size + ' }';
      }).join(',\n') + '\n  ];\n' +
      '  var FOODCFG = { autoDropMs: 0 };\n\n' +
      '  var CHARS = [\n' + S.CHARS.map(charCode).join(',\n') + '\n  ];' +
      (blob.indexOf('blob:') >= 0 ? '\n\n  /* ⚠ blob: 로 시작하는 이미지 주소는 이 브라우저에서만 유효해.\n     ./images/파일명.png 처럼 실제 경로로 바꿔줘. */' : '');
  }

  window.SMJ_SETTINGS = { open: open, close: close, exportCode: exportCode };
})();
