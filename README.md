# DDS 블로그 서버

DDSWindowSkin 을 그대로 쓰면서, 글·이미지·계정을 직접 관리하는 개인 블로그 서버.
Railway 에 올리는 걸 전제로 만들었어.

**스킨 코드는 한 줄도 안 고쳤어.** 서버가 스킨이 기대하는 모양(`#tistory-data`)으로 응답해주기 때문에,
스킨의 창·갤러리 위젯·카테고리 트리·태그·페이징이 전부 원래대로 동작해.

---

## 뭐가 되나

- **글쓰기** — 마크다운 + 실시간 미리보기. 이미지는 버튼·끌어놓기·붙여넣기 셋 다
- **이미지 업로드** — 볼륨에 저장, 자동으로 WebP 변환·리사이즈
- **갤러리** — 업로드한 이미지가 스킨의 갤러리 위젯에 그대로 뜸 (글을 쓸 필요 없음)
- **로그인** — 아이디/비밀번호, bcrypt 해시, 로그인 시도 제한
- **게스트** — 닉네임만으로 입장, 방명록 작성 가능
- **카테고리 / 태그 / 페이징 / 방명록**

## 준비물

- Node 20 이상
- Railway 계정 (Hobby 플랜이면 볼륨 5GB)

## 설치

1. 스킨 파일을 `public/skin/` 에 넣어줘.

```
public/skin/skin.html
public/skin/style.css
public/skin/images/script.js
public/skin/images/*.mp3
public/skin/images/shimeji.css        (시메지 쓸 때)
public/skin/images/shimeji.js
public/skin/images/shimeji-settings.js
```

2. 의존성 설치하고 실행.

```bash
npm install
npm start
```

3. `http://localhost:3000/manage` 로 들어가면 **첫 계정 만들기** 화면이 떠.
   아이디와 8자 이상 비밀번호를 정하면 바로 관리 화면으로 들어가.

샘플 글을 넣어보고 싶으면 `npm run seed`.

## Railway 배포

**순서가 중요해. 볼륨을 먼저 붙여야 해.**

1. 비공개 저장소에 이 폴더를 올린다
2. Railway 에서 New Project → 그 저장소 선택
3. **배포되기 전에 서비스에 Volume 을 붙인다** (마운트 경로는 아무거나, 예: `/data`)
   - 볼륨 없이 배포하면 재배포할 때마다 글과 이미지가 **전부 사라져**
   - 볼륨을 붙이면 `RAILWAY_VOLUME_MOUNT_PATH` 가 자동으로 들어오고 서버가 알아서 거기 저장해
   - 볼륨이 없으면 서버가 시작할 때 경고를 크게 찍어줘. 로그를 한 번 봐줘
4. 환경변수는 `.env.example` 참고. 없어도 기본값으로 돌아가
5. 배포 후 `https://내주소/manage` 에서 첫 계정 생성

### 주의

- 볼륨을 붙이면 **replica 는 1개**만 가능해 (Railway 제약). 개인 블로그엔 상관없어
- 볼륨이 붙은 서비스는 재배포할 때 짧은 다운타임이 있어
- 백업은 Railway 볼륨 백업 기능을 켜두는 걸 권해

## 꾸미기(색상·배경화면·위젯) 는 어떻게 저장되나

스킨의 꾸미기 기능은 **주인으로 로그인했을 때만** 열린다. 서버가 로그인 여부를 알고 있어서
페이지에 `window.tiara = {customProps:{role:"owner"}}` 를 넣어주기 때문 — 티스토리가 쓰던 신호와 같다.
방문자에게는 이 스크립트가 안 들어가므로 편집 메뉴 자체가 안 보인다.

저장은 자동이다. 스킨의 「게시글에 반영」은 설정을 클립보드로 복사하는데
(티스토리에서는 그걸 손으로 글에 붙여넣어야 했다), `/bridge/slot-bridge.js` 가
복사되는 순간을 가로채 `PUT /api/slot` 으로 보내 저장한다. 클립보드 복사도 그대로 되므로
스킨 동작은 달라지지 않는다. 설정처럼 생긴 텍스트(`[DDS-ACTIVE]` 표식)일 때만 저장한다.

설정은 `system_kind='slot'` 인 글 하나에 담기고, `configPostUrl` 이 그 글을 가리킨다.
스킨은 그 글을 읽어 슬롯을 복원한다. 갤러리 이미지들도 같은 글에 들어가서
배경화면·스티커가 참조하는 이미지를 찾을 수 있다.

## 구조

```
src/config.js     경로·기본값. 볼륨 유무를 판단하고 경고
src/db.js         SQLite 스키마와 쿼리 (볼륨 위에 blog.db)
src/auth.js       세션·비밀번호·로그인 제한·게스트
src/markdown.js   마크다운 → HTML, 썸네일 추출
src/render.js     ★ 스킨이 읽는 #tistory-data 를 만드는 곳
src/gallery.js    업로드 목록을 갤러리 카테고리 글로 동기화
src/slot.js       꾸미기 설정(슬롯) 저장·복원
public/bridge/    슬롯 저장 다리 (주인일 때만 페이지에 들어감)
src/server.js     라우트 전부
public/admin/     관리 화면 (스킨 창 모양)
public/skin/      스킨 원본 (여기 넣어줘)
```

### 서버가 제공하는 주소

스킨이 자기 사이트를 크롤링하는 구조라 이 규칙을 지켜야 해.

| 주소 | 내용 |
|---|---|
| `/` | 글 목록 (`?page=N`) |
| `/{번호}` | 글 하나 |
| `/category/{상위}/{하위}` | 카테고리 목록 (`?page=N`) |
| `/tag/{태그}` | 태그 목록 (`?page=N`) |
| `/guestbook` | 방명록 |
| `/manage` | 관리 화면 |
| `/uploads/...` | 업로드한 이미지 |
| `/skin/...` | 스킨 파일 |

`data-no-next` 는 **빈 문자열일 때 "다음 페이지 있음"** 이야 (스킨의 판정 규칙).
`src/render.js` 의 `pagingHtml()` 을 고칠 일이 있으면 이걸 기억해줘.

## 라이선스

- 이 서버 코드: 자유롭게 써도 됨
- **DDSWindowSkin (제작: 돌딤섬, https://doldimseom.tistory.com/21)**
  개인 사용만 허용 · 재배포 금지 · 출처 삭제 금지.
  저장소를 **비공개로** 유지하고, `skin.html` 과 `style.css` 상단의 저작권 주석,
  크레딧 드로어 링크를 지우지 마.
- 폰트/아이콘: Galmuri11 (OFL), Pretendard (OFL), Pixel Icon Library (CC BY 4.0),
  Pixelarticons (MIT) — 스킨 크레딧에 이미 고지돼 있어
