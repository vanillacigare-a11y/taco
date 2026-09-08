/* ==========================================================================
   슬롯 저장 다리 (주인으로 로그인했을 때만 페이지에 들어감)

   스킨의 「게시글에 반영」은 꾸미기 설정을 클립보드로 복사한다.
   티스토리에서는 그걸 손으로 글에 붙여넣어야 했는데, 여기서는 우리가 서버라서
   복사되는 순간 가로채 저장해준다. 클립보드 복사도 그대로 되니 동작은 안 바뀐다.

   설정처럼 생긴 텍스트일 때만 저장한다 (다른 복사는 건드리지 않음).
   ========================================================================== */
(function () {
  'use strict';
  if (!navigator.clipboard || !navigator.clipboard.writeText) return;

  var MARK = /\[DDS-ACTIVE\]|────────────────────────/;
  var orig = navigator.clipboard.writeText.bind(navigator.clipboard);

  function toast(msg, bad) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;bottom:56px;transform:translateX(-50%);z-index:2147483600;' +
      'padding:8px 15px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo",sans-serif;' +
      'color:#fff;background:' + (bad ? '#c0392b' : '#2f9e63') + ';box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:0;transition:.2s';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 300); }, 2600);
  }

  navigator.clipboard.writeText = function (text) {
    var p = orig(text);
    try {
      if (typeof text === 'string' && text.length > 40 && MARK.test(text)) {
        fetch('/api/slot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (r) {
            if (r.ok) toast('꾸미기 설정을 서버에 저장했어 — 붙여넣기 안 해도 돼');
            else toast('저장 실패: ' + (r.d && r.d.message || '알 수 없음'), true);
          })
          .catch(function (e) { toast('저장 실패: ' + e.message, true); });
      }
    } catch (e) { /* 저장이 실패해도 복사 자체는 방해하지 않는다 */ }
    return p;
  };
})();
