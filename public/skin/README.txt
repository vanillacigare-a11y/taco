여기에 스킨 파일을 넣어줘 (이 폴더는 저장소에 커밋해도 되고, 비공개 저장소니 문제없어)

  public/skin/skin.html
  public/skin/style.css
  public/skin/images/script.js
  public/skin/images/*.mp3
  public/skin/images/shimeji.css, shimeji.js, shimeji-settings.js

DDSWindowSkin — 제작: 돌딤섬 (https://doldimseom.tistory.com/21)
개인 사용만 허용, 재배포 금지. 원본의 저작권 주석과 크레딧을 지우지 말 것.


─────────────────────────────────────────────────────────────────────────
스킨 원본은 손대지 않는다

skin.html / style.css / images/script.js 는 받은 그대로 둔다.
바꿔야 할 게 있으면 내보낼 때만 메모리에서 바꾼다 (src/skinassets.js, src/render.js).
그래서 스킨 업데이트가 나오면 파일만 덮어쓰면 된다.

지금 내보낼 때 바꾸는 것 — 전부 티스토리 시절 흔적이라 여기선 필요 없거나 우리가 대신할 수 있다:

  1. jQuery <script> 를 뺀다                                 (render.js)
     티스토리 기본 스킨이 늘 넣어주던 것. 이 스킨은 안 쓴다.
     script.js 안의 $ 는 압축기가 만든 자기 함수지 jQuery 가 아니다.

  2. 갈무리 픽셀 폰트 주소를 우리 것으로                       (skinassets.js)
     cdn.jsdelivr.net/npm/galmuri@2.40.3/… → /skin/images/vendor/…

  3. 아이콘 주소를 우리 것으로                                (skinassets.js)
     api.iconify.design/pixelarticons/ → /skin/images/icons/pixelarticons/
     서버가 vendor/pixelarticons.json 에서 같은 SVG 를 만들어 낸다.

Pretendard 는 한글 조각이 92개(3.1MB)라 통째로 갖고 있기엔 커서 CDN 에 그대로 둔다.

스킨이 바뀌어서 위 문자열을 못 찾으면 원본을 그대로 내보내고 시작할 때 한 줄 알려준다
(동작은 예전과 같아진다 — 다시 바깥 CDN 을 쓰게 될 뿐).


images/vendor/ 안의 것들 (스킨 원본 아님, 우리가 갖다 놓은 것)

  Galmuri11-Condensed.woff2   갈무리 픽셀 폰트   OFL-1.1  → Galmuri-OFL-1.1.txt
  pixelarticons.json          픽셀아트 아이콘    MIT      → pixelarticons-MIT.txt

둘 다 라이선스가 자체 호스팅을 허용한다. 라이선스 파일을 같이 두는 게 조건이라 같이 넣어뒀다.
