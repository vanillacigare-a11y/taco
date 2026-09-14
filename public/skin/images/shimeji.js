/* ==========================================================================
   시메지 + 다마고치 애드온 for DDSWindowSkin  (v1)
   - 스킨 원본(skin.html / style.css / script.js)은 수정하지 않음
   - 전역 오염 없음. window.SMJ 하나만 노출(디버그용)
   - 저장소 접두사는 "smj:" — 스킨의 "dds:" 키 청소에 걸리지 않음
   ========================================================================== */
(function () {
  'use strict';

  /* ── 실행 가드 ──────────────────────────────────────────────────────────
     스킨은 글을 ?dds_embed 로 iframe 안에 다시 렌더링한다. 거기서 또 돌면
     마스코트가 둘이 되므로 차단한다. */
  try {
    if (new URLSearchParams(location.search).has('dds_embed')) return;
    if (window.self !== window.top) return;
  } catch (e) { return; }

  /* ======================================================================
     ■ 설정 시작 — 데모에서 "설정 코드 내보내기" 한 걸 이 구간에 붙여넣으면 됨
     ====================================================================== */

  var G = {
    gravity: 0.65, bounce: 0.42, airDrag: 0.995, groundDrag: 0.86,
    climbChance: 0.55, sleepAfter: 120000, bubbleMs: 2600,
    auto: true, talk: true, climb: true, follow: false,
    walkOnWindows: true    // 열린 창의 지붕 위를 걸어다님 (끄면 바닥에서만)
  };

  var SOCIAL = {
    greet: true, fight: true, fightChance: 0.4, makeUp: true, sleepTogether: true
  };

  // 다마고치 계층
  var PET = {
    on: true,
    ownerOnly: false,      // true 로 두면 블로그 주인에게만 육성 모드가 돌아감
    save: true,            // localStorage 저장 (끄면 탭 닫으면 초기화)
    hungerH: 4,            // 보고 있는 동안 배부름 100 → 0 에 걸리는 시간(시간)
    moodH: 8,              // 보고 있는 동안 기분 100 → 0 에 걸리는 시간(시간)
    offlineRate: 0.1,      // 창을 닫아둔 동안은 이 비율로만 줄어듦
                           //   → 하루 방치 시 배고픔 -60, 기분 -30 / 사흘이면 바닥
    offlineCapH: 96,       // 오프라인 경과를 최대 몇 시간까지 반영할지
    hungryAt: 45, starvingAt: 18, grumpyAt: 40, closeAt: 60,
    bondPerDay: 12,        // 하루에 쌓을 수 있는 친밀도 상한
    bondDecayPerDay: 2,    // 방치 시 하루 감소량
    awayHours: 8           // 이만큼 만에 오면 반가워함
  };

  var STICKER = {
    lock: true,            // 스티커 잠금 기능 사용
    alwaysShowLock: false  // true 면 권한 판정 없이 잠금 버튼을 항상 표시
  };

  var FOODS = [
    { id: 'rice',  name: '밥',   image: '', size: 52 },
    { id: 'snack', name: '간식', image: '', size: 46 },
    { id: 'veg',   name: '야채', image: '', size: 46 }
  ];
  var FOODCFG = { autoDropMs: 0 };

  var CHARS = [
    {
      /* 체사레 — 명령받는 걸 싫어하고, 막히면 이유를 묻기보다 밀어붙인다.
         좋고 싫음이 분명하고 꾸밈이 없다. 중요한 순간에는 오히려 말이 짧아진다. */
      id: 'a', name: '체사레', on: true, size: 96, speed: 1.35,
      pref: { rice: 2, snack: 1, veg: 0 },
      sprites: { stand: [], walk: [], run: [], sit: [], sleep: [], hungry: [], eat: [], fight: [], drag: [], fall: [], climb: [] },
      lines: {
        click:      ['뭐.', '용건만 말해.', '명령하지 마라, 허접.', '불렀으면 이유가 있겠지.'],
        dblclick:   ['그만 흔들어.', '어지럽잖아.', '한 번만 더 해봐라.'],
        pet:        ['…나쁘지 않군.', '계속해도 된다.', '이런 건 싫지 않다.'],
        idle:       ['심심하군.', '누가 덤비기라도 했으면.', '이 정도면 볼 만하다.', '…'],
        grab:       ['놔라.', '지금 뭐 하는 거지.', '떨어뜨리기만 해봐.'],
        throw:      ['이 자식이!', '오냐, 해보자는 거지.', '으하하!'],
        landHard:   ['…아프다.', '방금 건 안 아팠다.', '큭.'],
        climb:      ['이 정도쯤이야.', '막지 마라.', '올라간다.'],
        sleep:      ['자는 거 아니다…', '깨우지 마라.', 'zzz…'],
        wake:       ['누구냐.', '…벌써.', '잤군.'],
        foodSpotted:['저건 내 거다.', '먹을 것이군.', '손대지 마라.'],
        eat:        ['우물.', '먹을 만하군.', '…'],
        full:       ['됐다.', '이만하면 충분해.'],
        favorite:   ['이거다.', '이건 인정하지.', '한 접시 더.'],
        hateFood:   ['치워라.', '이딴 걸 먹으라고?', '…먹어주는 거다.'],
        foodLost:   ['뭐?', '두고 보자.', '치사한 놈.'],
        greet:      ['왔군.', '어이.', '늦었잖아.'],
        reply:      ['그래.', '알았다.', '뭐 어쩌라고.'],
        fightStart: ['내 거다.', '비켜라.', '덤벼.'],
        fightTaunt: ['그게 다냐.', '놔라.', '아직 안 끝났다.'],
        fightWin:   ['당연한 결과다.', '허접.', '다음엔 좀 더 버텨봐라.'],
        fightLose:  ['…이번뿐이다.', '운이 좋았군.', '흥.'],
        makeUp:     ['아까 건 없던 걸로 하지.', '됐다. 신경 쓰지 마라.'],
        happy:      ['오늘은 봐줄 만하군.', '기분이 나쁘지 않다.', '나쁘지 않아.'],
        grumpy:     ['건드리지 마라.', '지금은 아니다.', '…'],
        welcome:    ['늦었군.', '어디 갔었지.', '…돌아왔군.'],
        bondUp:     ['너는… 나쁘지 않다.', '옆에 있어도 좋다.', '이 정도는 인정해주지.']
      }
    },
    {
      /* 라일리 — 밝고 솔직하고 의리 있다. 성질이 급해 말이 먼저 나가지만 뒤끝은 없다.
         힘든 건 티 안 내고 혼자 삼키는 편. */
      id: 'b', name: '라일리', on: false, size: 84, speed: 1.15,
      pref: { rice: 2, snack: 1, veg: 1 },
      sprites: { stand: [], walk: [], run: [], sit: [], sleep: [], hungry: [], eat: [], fight: [], drag: [], fall: [], climb: [] },
      lines: {
        click:      ['왜왜!', '뭐? 다시 말해봐!', '오 불렀어?', '나 여기 있어!'],
        dblclick:   ['우왓 뭐야!', '어지러워 죽겠네!', '한 번 더!'],
        pet:        ['헤헤 간지러워', '좋다…', '계속 해도 돼'],
        idle:       ['오늘 뭐부터 하지', '이거 이렇게 하는 게 맞나', '일단 해보면 되지', '할 거 없나'],
        grab:       ['어어 잠깐만!', '나 무거워!', '놓치지 마 진짜로'],
        throw:      ['우아아악!', '야!!', '재밌긴 한데!'],
        landHard:   ['아야! 아 진짜', '괜찮아 안 아파', '…조금 아팠어'],
        climb:      ['영차', '이쯤이야', '올라간다!'],
        sleep:      ['쿨… 쿨…', '잠깐만 눈 붙일게', 'zzz…'],
        wake:       ['어? 나 잤어?', '아 미안 미안', '벌써 이렇게 됐네'],
        foodSpotted:['오 밥이다!', '이거 먹어도 돼?', '배고팠는데 잘됐다'],
        eat:        ['냠냠', '맛있다 진짜', '우물우물'],
        full:       ['잘 먹었습니다!', '아 배불러', '고마워 진짜'],
        favorite:   ['헐 이거 내가 제일 좋아하는 건데!', '어떻게 알았어?', '이거지!'],
        hateFood:   ['으… 이건 좀', '남기면 아깝잖아', '먹을게 먹을게'],
        foodLost:   ['야! 그거 내 거!', '아 진짜 너…', '치사하다 진짜'],
        greet:      ['어 왔어?', '오랜만!', '뭐 해 뭐 해'],
        reply:      ['응 나도!', '그러게', '좋지'],
        fightStart: ['뭐? 다시 말해봐!', '참으려고 했는데', '한 판 붙자!'],
        fightTaunt: ['놔! 이거 놔!', '너 진짜 혼난다', '내가 먼저 봤거든?'],
        fightWin:   ['봤지! 봤지!', '이게 실력이야', '아 근데… 좀 세게 했나'],
        fightLose:  ['아 진짜 짜증나!', '한 번만 더 하자', '…봐준 거야'],
        makeUp:     ['아까는 내가 좀 심했어', '화해하자 우리', '미안 나 성질 급해서'],
        happy:      ['오늘 기분 완전 좋아!', '아 살 것 같다', '룰루랄라'],
        grumpy:     ['…아무것도 아니야', '괜찮아 진짜로', '신경 쓰지 마'],
        welcome:    ['어디 갔었어! 기다렸잖아', '왔다!', '보고 싶었어 진짜'],
        bondUp:     ['우리 이제 좀 친한 거지?', '너 있어서 좋다', '내가 잘할게']
      }
    }
  ];

  /* ======================================================================
     ■ 설정 끝
     ====================================================================== */

  /* ── 저장 어댑터 ────────────────────────────────────────────────────────
     개인 서버로 옮길 때는 이 객체만 fetch 기반으로 바꾸면 된다.
     (그러면 기기 간 동기화·방문자 상호작용까지 가능해짐) */
  var Store = {
    prefix: 'smj:',
    read: function (key, dflt) {
      if (!PET.save) return dflt;
      try {
        var raw = localStorage.getItem(this.prefix + key);
        return raw == null ? dflt : JSON.parse(raw);
      } catch (e) { return dflt; }
    },
    write: function (key, val) {
      if (!PET.save) return;
      try { localStorage.setItem(this.prefix + key, JSON.stringify(val)); } catch (e) {}
    }
  };

  var STATES = ['stand', 'walk', 'run', 'sit', 'sleep', 'hungry', 'eat', 'fight', 'drag', 'fall', 'climb'];
  var FRAME_MS = 220;

  /* 설정 창이 쓰는 메타데이터 (설정 창을 안 열면 이 상수만 메모리에 있음) */
  var STATE_LABEL = { stand: '가만히', walk: '걷기', run: '뛰기', sit: '앉기', sleep: '자기',
    hungry: '배고픔', eat: '먹기', fight: '싸움', drag: '들림', fall: '떨어짐', climb: '벽타기' };
  var LINE_GROUPS = [
    ['기본 반응', [['click', '클릭했을 때'], ['dblclick', '더블클릭했을 때'], ['pet', '쓰다듬어줄 때'], ['idle', '혼잣말']]],
    ['움직임', [['grab', '들어올릴 때'], ['throw', '던져질 때'], ['landHard', '아프게 착지'], ['climb', '벽 탈 때']]],
    ['잠', [['sleep', '잠들 때'], ['wake', '깰 때']]],
    ['밥', [['foodSpotted', '밥 발견'], ['eat', '먹는 중'], ['full', '다 먹고'], ['favorite', '좋아하는 밥'],
            ['hateFood', '싫어하는 밥'], ['foodLost', '밥 놓쳤을 때']]],
    ['친구', [['greet', '친구 만남'], ['reply', '친구 대답'], ['fightStart', '싸움 시작'], ['fightTaunt', '싸우는 중'],
              ['fightWin', '이겼을 때'], ['fightLose', '졌을 때'], ['makeUp', '화해']]],
    ['컨디션', [['happy', '기분 좋을 때'], ['grumpy', '기분 나쁠 때'], ['welcome', '오랜만에 왔을 때'], ['bondUp', '친해졌을 때']]]
  ];

  /* 이 스크립트의 형제 경로 — 설정 창 스크립트를 필요할 때만 불러오려고 기억해둔다 */
  var SELF_SRC = (function () {
    try { return (document.currentScript && document.currentScript.src) || ''; } catch (e) { return ''; }
  })();
  var MIN = 60000, HOUR = 3600000;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return performance.now(); }
  function stamp() { return Date.now(); }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function foodType(id) { for (var i = 0; i < FOODS.length; i++) if (FOODS[i].id === id) return FOODS[i]; return FOODS[0]; }

  function isOwner() {
    try {
      var r = window.tiara && window.tiara.customProps && window.tiara.customProps.role;
      if (typeof r === 'string' && ['owner', 'manager', 'editor'].indexOf(r.toLowerCase()) >= 0) return true;
    } catch (e) {}
    return false;
  }
  function canEditStickers() {
    if (STICKER.alwaysShowLock) return true;
    if (isOwner()) return true;
    var cfg = window.DDS_CONFIG || {};
    return cfg.visitorEditing === 'on';
  }

  /* 스킨 레이아웃에 맞춘 바닥/천장 — 작업표시줄 위가 바닥이다 */
  var barH = 40;
  function readBarH() {
    // 작업표시줄의 실제 높이(테두리 포함)를 우선 쓰고, 없으면 CSS 변수로 대체
    var el = document.getElementById('taskbar');
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.height > 0) { barH = Math.round(r.height); return; }
    }
    var n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dds-taskbar-height'));
    barH = isNaN(n) ? 40 : n;
  }
  function floorY() { return innerHeight - barH; }
  function ceilY() {
    // 슬롯 편집 모드에서는 상단에도 편집바가 40px 붙는다
    return document.documentElement.classList.contains('dds-slot-editing') ? barH : 0;
  }

  var mascots = [], foods = [], fight = null;
  var pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  addEventListener('pointermove', function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  /* ── 창 지붕(플랫폼) 캐시 — 5Hz 로만 갱신해서 레이아웃 강제 계산을 아낀다 ── */
  var plat = { list: [], at: -9999 };
  function refreshPlatforms(t) {
    if (!G.walkOnWindows) { plat.list.length = 0; return; }
    if (t - plat.at < 200) return;
    plat.at = t;
    var out = [], wins = document.querySelectorAll('#windows-layer .win'), top = ceilY(), bot = floorY();
    for (var i = 0; i < wins.length; i++) {
      var el = wins[i];
      if (el.hidden || el.classList.contains('win-exit')) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 40) continue;
      if (r.top < top + 24 || r.top > bot - 40) continue;   // 너무 높거나 바닥에 붙은 창은 제외
      out.push({ el: el, x1: r.left, x2: r.right, y: r.top });
    }
    plat.list = out;
  }
  function platOf(el) {
    for (var i = 0; i < plat.list.length; i++) if (plat.list[i].el === el) return plat.list[i];
    return null;
  }

  /* ==================================================================== */
  /*  마스코트                                                             */
  /* ==================================================================== */
  function Mascot(conf) {
    this.c = conf;
    this.size = conf.size;
    this.x = rand(60, Math.max(80, innerWidth - conf.size - 60));
    this.y = ceilY() + 10;
    this.vx = 0; this.vy = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.tilt = 0; this.frame = 0; this.frameAt = now();
    this.state = ''; this.stateAt = now();
    this.nextThink = now() + rand(900, 2200);
    this.lastTouch = now(); this.holdUntil = 0; this.sulkUntil = 0;
    this.wall = 0;
    this.platEl = null; this.platY = 0;
    this.eating = false; this.eatFood = null; this.eatTimer = null; this.targetFood = null;
    this.petDist = 0; this.petAt = 0; this.clickMoodAt = 0;
    this.bubbleTimer = null;
    this.loadPet();
    this.build();
    this.setState('fall');
  }

  /* ── 다마고치 상태 ─────────────────────────────────────────────────── */
  Mascot.prototype.loadPet = function () {
    var d = Store.read('pet:' + this.c.id, null);
    var t = stamp();
    if (!d || typeof d.t !== 'number') {
      this.hunger = 100; this.mood = 80; this.bond = 0;
      this.day = dayKey(t); this.gained = 0; this.savedAt = t; this.awayMs = 0;
      return;
    }
    var away = clamp(t - d.t, 0, PET.offlineCapH * HOUR) * PET.offlineRate;
    this.awayMs = t - d.t;
    this.hunger = clamp((d.hunger != null ? d.hunger : 100) - away / (PET.hungerH * HOUR) * 100, 0, 100);
    // 배가 고픈 채로 방치되면 기분이 더 빨리 상한다
    var moodRate = 1 + (this.hunger < PET.hungryAt ? 0.6 : 0);
    this.mood = clamp((d.mood != null ? d.mood : 80) - away / (PET.moodH * HOUR) * 100 * moodRate, 0, 100);
    this.bond = clamp((d.bond || 0) - (away / (24 * HOUR)) * PET.bondDecayPerDay, 0, 100);
    this.day = dayKey(t);
    this.gained = (d.day === this.day) ? (d.gained || 0) : 0;
    this.savedAt = t;
  };
  Mascot.prototype.savePet = function () {
    Store.write('pet:' + this.c.id, {
      hunger: Math.round(this.hunger), mood: Math.round(this.mood), bond: Math.round(this.bond * 10) / 10,
      day: this.day, gained: this.gained, t: stamp()
    });
    this.savedAt = stamp();
  };
  Mascot.prototype.addMood = function (n) { this.mood = clamp(this.mood + n, 0, 100); };
  Mascot.prototype.addBond = function (n) {
    var d = dayKey(stamp());
    if (d !== this.day) { this.day = d; this.gained = 0; }
    var room = Math.max(0, PET.bondPerDay - this.gained);
    var give = Math.min(n, room);
    if (give <= 0) return;
    var before = Math.floor(this.bond / 20);
    this.bond = clamp(this.bond + give, 0, 100);
    this.gained += give;
    if (Math.floor(this.bond / 20) > before) { this.say('bondUp'); this.heart(); }
  };
  Mascot.prototype.isHungry = function () { return PET.on && this.hunger < PET.hungryAt; };
  Mascot.prototype.isStarving = function () { return PET.on && this.hunger < PET.starvingAt; };
  Mascot.prototype.isGrumpy = function () { return PET.on && this.mood < PET.grumpyAt; };
  Mascot.prototype.isClose = function () { return PET.on && this.bond >= PET.closeAt; };

  Mascot.prototype.build = function () {
    var root = document.createElement('div');
    root.className = 'smj' + (this.c.id === 'b' ? ' c2' : '');
    root.setAttribute('draggable', 'false');
    root.innerHTML =
      '<div class="smj-flip"><div class="smj-art">' +
        '<div class="smj-arm smj-arm-l"></div><div class="smj-arm smj-arm-r"></div>' +
        '<div class="smj-cap"><span class="smj-spot s1"></span><span class="smj-spot s2"></span><span class="smj-spot s3"></span></div>' +
        '<div class="smj-stem"><div class="smj-eye smj-eye-l"></div><div class="smj-eye smj-eye-r"></div>' +
        '<div class="smj-mouth"></div><div class="smj-blush smj-blush-l"></div><div class="smj-blush smj-blush-r"></div></div>' +
        '<div class="smj-leg smj-leg-l"></div><div class="smj-leg smj-leg-r"></div>' +
      '</div><img class="smj-img" alt="" draggable="false"></div>' +
      '<div class="smj-bubble"></div><div class="smj-zzz">z</div><div class="smj-heart">♥</div>';
    document.body.appendChild(root);   // #desktop 바깥 = 스킨의 데스크톱 우클릭 메뉴와 충돌 없음
    this.el = root;
    this.flip = root.querySelector('.smj-flip');
    this.img = root.querySelector('.smj-img');
    this.bubble = root.querySelector('.smj-bubble');
    this.heartEl = root.querySelector('.smj-heart');
    this.applySize(); this.applySprite(); this.bind();
  };

  Mascot.prototype.applySize = function () {
    this.size = this.c.size;
    this.el.style.width = this.el.style.height = this.size + 'px';
  };
  Mascot.prototype.spriteKey = function () {
    var s = this.state;
    if (s === 'ceiling') s = 'climb';
    if ((s === 'stand' || s === 'sit') && this.isHungry() && this.c.sprites.hungry.length) s = 'hungry';
    return s;
  };
  Mascot.prototype.applySprite = function () {
    var sp = this.c.sprites, k = this.spriteKey();
    var list = (sp[k] && sp[k].length) ? sp[k] : (sp.stand.length ? sp.stand : null);
    if (list) {
      this.el.classList.add('has-img');
      var src = list[this.frame % list.length];
      if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src);
    } else this.el.classList.remove('has-img');
  };
  Mascot.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s; this.stateAt = now(); this.frame = 0;
    this.el.setAttribute('data-s', s); this.applySprite();
  };
  Mascot.prototype.say = function (key, angry) {
    if (!G.talk) return;
    var pool = this.c.lines[key];
    if (!pool || !pool.length) return;
    this.bubble.textContent = pick(pool);
    this.bubble.classList.toggle('angry', !!angry);
    this.bubble.classList.add('on');
    clearTimeout(this.bubbleTimer);
    var b = this.bubble;
    this.bubbleTimer = setTimeout(function () { b.classList.remove('on'); }, G.bubbleMs);
  };
  Mascot.prototype.flash = function (cls, ms) {
    var f = this.flip;
    f.classList.remove(cls); void f.offsetWidth; f.classList.add(cls);
    setTimeout(function () { f.classList.remove(cls); }, ms);
  };
  Mascot.prototype.heart = function () {
    var h = this.heartEl;
    h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
    setTimeout(function () { h.classList.remove('pop'); }, 1200);
  };

  /* ── 입력 ─────────────────────────────────────────────────────────── */
  Mascot.prototype.bind = function () {
    var self = this, grab = null;
    this.el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    this.el.addEventListener('pointerdown', function (e) {
      if (e.button === 2) return;
      e.preventDefault();          // stopPropagation 은 하지 않음 → 스킨 클릭음 유지
      self.el.setPointerCapture(e.pointerId);
      self.el.classList.add('dragging');
      self.lastTouch = now(); self.cancelEat(); self.targetFood = null;
      self.wall = 0; self.platEl = null;
      if (fight && (fight.a === self || fight.b === self)) endFight(true);
      grab = { id: e.pointerId, moved: 0, t0: now(), ox: e.clientX - self.x, oy: e.clientY - self.y,
               px: e.clientX, py: e.clientY, hist: [] };
      self.setState('drag'); self.say('grab');
    });
    this.el.addEventListener('pointermove', function (e) {
      if (!grab || e.pointerId !== grab.id) { if (!grab) self.pet(); return; }
      var dx = e.clientX - grab.px;
      grab.moved += Math.abs(dx) + Math.abs(e.clientY - grab.py);
      grab.px = e.clientX; grab.py = e.clientY;
      grab.hist.push({ x: e.clientX, y: e.clientY, t: now() });
      if (grab.hist.length > 6) grab.hist.shift();
      self.x = e.clientX - grab.ox; self.y = e.clientY - grab.oy + 4;
      self.tilt = clamp(dx * 1.6, -22, 22);
    });
    function release(e) {
      if (!grab || e.pointerId !== grab.id) return;
      self.el.classList.remove('dragging');
      var h = grab.hist, vx = 0, vy = 0;
      if (h.length >= 2) {
        var a = h[0], b = h[h.length - 1], dt = Math.max(8, b.t - a.t);
        vx = (b.x - a.x) / dt * 14; vy = (b.y - a.y) / dt * 14;
      }
      var wasClick = grab.moved < 6 && (now() - grab.t0) < 350;
      grab = null; self.tilt = 0;
      if (wasClick) {
        self.setState('stand');
        self.say(self.isGrumpy() ? 'grumpy' : 'click');
        if (!self.isGrumpy()) self.flash('happy', 900);
        var t = now();
        if (t - self.clickMoodAt > 8000) { self.clickMoodAt = t; self.addMood(1); self.addBond(0.2); }
      } else {
        self.vx = clamp(vx, -42, 42); self.vy = clamp(vy, -42, 42);
        self.setState('fall');
        var force = Math.abs(vx) + Math.abs(vy);
        if (force > 12) { self.say('throw'); if (force > 28) self.addMood(-3); }
      }
    }
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
    this.el.addEventListener('dblclick', function () {
      self.lastTouch = now(); self.flash('spin', 620); self.say('dblclick'); self.addMood(1);
    });
    this.el.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();   // 스킨 데스크톱 메뉴가 같이 뜨지 않도록
      openMenu(self, e.clientX, e.clientY);
    });
  };

  Mascot.prototype.pet = function () {
    if (this.state === 'drag' || this.eating || this.state === 'fight') return;
    var t = now();
    if (t - this.petAt > 700) this.petDist = 0;
    this.petAt = t; this.petDist += 6;
    if (this.petDist > 90) {
      this.petDist = -400; this.lastTouch = t; this.sulkUntil = 0;
      if (this.state === 'sleep') { this.setState('stand'); this.say('wake'); return; }
      if (this.isGrumpy()) { this.say('grumpy'); this.addMood(6); return; }
      this.say('pet'); this.flash('happy', 900);
      this.addMood(5); this.addBond(0.8);
    }
  };

  /* ── 먹기 ─────────────────────────────────────────────────────────── */
  Mascot.prototype.canEat = function (f) {
    if (!f || f.dead || f.dragging) return false;
    if (f.taken && f.taker !== this) return false;
    if (this.pref(f.type.id) === 0 && !this.isStarving()) return false;
    return true;
  };
  Mascot.prototype.pref = function (id) { var v = this.c.pref[id]; return v == null ? 1 : v; };
  Mascot.prototype.startEat = function (f, byHand) {
    if (this.eating || !f || f.dead) return;
    if (SOCIAL.fight && !f.fought && !fight && !byHand) {
      var rival = null, me = this;
      mascots.forEach(function (m) {
        if (m !== me && !m.eating && m.targetFood === f && groundish(m) &&
            Math.abs(m.x - me.x) < (m.size + me.size) * 1.25) rival = m;
      });
      if (rival) { f.fought = true; startFight(this, rival, f); return; }
    }
    var self = this, w = this.pref(f.type.id);
    f.taken = true; f.taker = this;
    this.eating = true; this.eatFood = f; this.vx = 0; this.targetFood = null; this.platEl = null;
    this.setState('eat'); this.say('eat');
    f.el.classList.add('landed'); f.landed = true;
    mascots.forEach(function (m) {
      if (m !== self && m.targetFood === f) { m.targetFood = null; m.say('foodLost'); m.holdUntil = now() + 1200; }
    });
    this.eatTimer = setTimeout(function () {
      f.kill();
      self.eating = false; self.eatFood = null; self.eatTimer = null;
      self.hunger = w === 0 ? Math.max(self.hunger, 62) : 100;
      self.addMood(w === 2 ? 14 : w === 0 ? -2 : 8);
      self.addBond(w === 2 ? 1.5 : 1);
      self.lastTouch = now(); self.setState('stand');
      self.say(w === 2 ? 'favorite' : w === 0 ? 'hateFood' : 'full');
      if (w !== 0) { self.flash('happy', 900); self.heart(); }
      self.nextThink = now() + 900;
      self.savePet();
    }, 1500);
  };
  Mascot.prototype.cancelEat = function () {
    if (!this.eating) return;
    clearTimeout(this.eatTimer); this.eatTimer = null;
    if (this.eatFood) { this.eatFood.taken = false; this.eatFood.taker = null; this.eatFood = null; }
    this.eating = false;
  };
  Mascot.prototype.findFood = function () {
    if (!foods.length) return null;
    /* 배부르다고 밥을 통째로 무시하면 "줘도 반응이 없다"가 된다.
       배부를 땐 뛰지 않고 걸어가서 먹기만 한다 (속도는 아래 step 에서 정한다) */
    var best = null, bs = Infinity, self = this;
    foods.forEach(function (f) {
      if (!self.canEat(f)) return;
      var d = Math.abs((f.x + f.size / 2) - (self.x + self.size / 2));
      var w = self.pref(f.type.id);
      var score = d / (w === 2 ? 3.5 : w === 0 ? 0.6 : 1);
      if (score < bs) { bs = score; best = f; }
    });
    return best;
  };

  /* ── 자율 행동 ─────────────────────────────────────────────────────── */
  Mascot.prototype.think = function (t) {
    this.nextThink = t + rand(1600, 4200);
    if (G.follow) return;
    var r = Math.random();
    if (this.isStarving()) {
      if (r < 0.6) this.setState('sit');
      else { this.setState('walk'); this.dir = Math.random() < 0.5 ? -1 : 1; }
      return;
    }
    if (this.isGrumpy() && r < 0.3) { this.setState('sit'); if (Math.random() < 0.4) this.say('grumpy'); return; }
    if (r < 0.32) { this.dir = Math.random() < 0.5 ? -1 : 1; this.setState('walk'); }
    else if (r < 0.42) { this.dir = Math.random() < 0.5 ? -1 : 1; this.setState('run'); this.nextThink = t + rand(700, 1400); }
    else if (r < 0.58) this.setState('sit');
    else if (r < 0.68) { this.dir *= -1; this.setState('stand'); }
    else if (r < 0.74) { this.setState('fall'); this.vy = -10; this.vx = this.dir * 1.6; }
    else {
      this.setState('stand');
      if (Math.random() < 0.28) this.say(this.mood > 75 ? 'happy' : this.isGrumpy() ? 'grumpy' : 'idle');
    }
  };

  /* ── 매 프레임 ─────────────────────────────────────────────────────── */
  Mascot.prototype.step = function (dt, t) {
    var S = this.size, top = ceilY(), base = floorY() - S, maxX = innerWidth - S, st = this.state;

    if (PET.on && st !== 'drag' && !this.eating) {
      this.hunger = clamp(this.hunger - dt * (100 / (PET.hungerH * HOUR / 16.667)), 0, 100);
      var mr = 1 + (this.isHungry() ? 0.6 : 0);
      this.mood = clamp(this.mood - dt * (100 / (PET.moodH * HOUR / 16.667)) * mr, 0, 100);
    }
    var body = st !== 'eat' && st !== 'drag' && st !== 'fight';
    this.el.classList.toggle('hungry', body && this.isHungry());
    this.el.classList.toggle('starving', body && this.isStarving());
    this.el.classList.toggle('grumpy', body && this.isGrumpy());
    this.el.classList.toggle('close', body && this.isClose() && !this.isGrumpy());
    this.el.classList.toggle('sulk', t < this.sulkUntil && st !== 'drag');

    /* 서 있던 창이 사라지거나 움직이면 떨어진다 */
    if (this.platEl) {
      var p = platOf(this.platEl);
      if (!p || Math.abs(p.y - this.platY) > 4) { this.platEl = null; if (groundish(this)) this.setState('fall'); }
      else base = p.y - S;
    }

    if (st === 'drag') {
      this.x = clamp(this.x, -S * .3, maxX + S * .3);
      this.y = clamp(this.y, top - S * .3, floorY() + S * .3);
      this.lastTouch = t;
    }
    else if (st === 'fight') { this.y = base; this.tilt = 0; }
    else if (st === 'fall') {
      var py = this.y;
      this.vy += G.gravity * dt;
      this.vx *= Math.pow(G.airDrag, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.tilt = clamp(this.vx * 1.2, -25, 25);
      if (this.vx) this.dir = this.vx > 0 ? 1 : -1;
      if (this.x <= 0) { this.x = 0; this.hitWall(-1); }
      else if (this.x >= maxX) { this.x = maxX; this.hitWall(1); }
      if (this.y <= top) { this.y = top; this.vy = Math.abs(this.vy) * G.bounce; }
      // 창 지붕에 착지?
      if (this.vy > 0 && G.walkOnWindows) {
        var cx = this.x + S / 2;
        for (var i = 0; i < plat.list.length; i++) {
          var pp = plat.list[i], surf = pp.y - S;
          if (cx > pp.x1 + 6 && cx < pp.x2 - 6 && py <= surf + 1 && this.y >= surf) {
            this.platEl = pp.el; this.platY = pp.y; this.land(surf); return this.render();
          }
        }
      }
      if (this.y >= floorY() - S) { this.platEl = null; this.land(floorY() - S); }
    }
    else if (st === 'climb') {
      this.y -= 1.1 * dt;
      this.x = this.wall < 0 ? 0 : maxX;
      this.dir = this.wall < 0 ? 1 : -1;
      this.tilt = this.wall * 12;
      if (this.y <= top) { this.y = top; this.setState('ceiling'); this.tilt = 180; this.nextThink = t + rand(1200, 3000); }
      else if (t - this.stateAt > 3600) this.dropOff();
    }
    else if (st === 'ceiling') {
      this.x += this.dir * this.c.speed * 0.7 * dt; this.y = top;
      if (this.x <= 0 || this.x >= maxX) this.dir *= -1;
      this.x = clamp(this.x, 0, maxX);
      if (t > this.nextThink) this.dropOff();
    }
    else {
      /* 지면(또는 창 지붕): 먹는중 > 밥 > 대기 > 따라오기 > 자율 */
      this.tilt = 0; this.y = base;
      if (Math.abs(this.vx) > .2) {
        this.x += this.vx * dt; this.vx *= Math.pow(G.groundDrag, dt);
        if (this.x <= 0 || this.x >= maxX) this.vx *= -G.bounce;
      } else this.vx = 0;

      /* 밥이 떨어지면 자다가도 깬다 */
      if (st === 'sleep' && !this.eating && foods.length && this.findFood()) {
        this.setState('stand'); this.say('wake'); this.lastTouch = t; st = 'stand';
      }

      if (this.eating) {
        if (this.eatFood) {
          this.eatFood.x = this.x + (this.size - this.eatFood.size) / 2 + this.dir * this.size * 0.3;
          this.eatFood.y = base + S - this.eatFood.size;
        }
      } else {
        var f = this.platEl ? null : this.findFood();   // 창 위에서는 밥을 쫓지 않음
        this.targetFood = f;
        if (f) {
          var dx = (f.x + f.size / 2) - (this.x + S / 2);
          if (Math.abs(dx) < S * .45 && f.landed) this.startEat(f);
          else {
            this.dir = dx > 0 ? 1 : -1;
            var full = PET.on && this.hunger > 95;
            var runIt = !full && (this.isHungry() || this.pref(f.type.id) === 2 || Math.abs(dx) > 300);
            this.x += this.dir * (runIt ? this.c.speed * 2.7 : this.c.speed) * dt;
            this.setState(runIt ? 'run' : 'walk');
            if (!f.seen[this.c.id]) { f.seen[this.c.id] = 1; if (Math.random() < .7) this.say('foodSpotted'); }
          }
        }
        else if (t < this.holdUntil) this.setState('stand');
        else if (t < this.sulkUntil) { if (st !== 'sit') this.setState('sit'); }
        else if (G.follow && !this.platEl) {
          var d = (pointer.x - S / 2) - this.x;
          if (Math.abs(d) > 12) {
            var sp = Math.abs(d) > 220 ? this.c.speed * 2.7 : this.c.speed;
            this.dir = d > 0 ? 1 : -1;
            this.x += this.dir * sp * dt;
            this.setState(Math.abs(d) > 220 ? 'run' : 'walk');
          } else if (st !== 'sit') this.setState('stand');
        }
        else {
          if (st === 'walk' || st === 'run') {
            var speed = (st === 'run' ? this.c.speed * 2.7 : this.c.speed) *
                        (this.isStarving() ? .6 : this.isGrumpy() ? .8 : 1);
            this.x += this.dir * speed * dt;
            if (this.platEl) {
              var pc = platOf(this.platEl);
              if (!pc || this.x + S / 2 < pc.x1 + 4 || this.x + S / 2 > pc.x2 - 4) {
                this.platEl = null; this.vx = this.dir * 1.2; this.vy = 0; this.setState('fall');
              }
            } else if (this.x <= 0 || this.x >= maxX) {
              this.x = clamp(this.x, 0, maxX);
              if (G.climb && now() > this.sulkUntil && Math.random() < G.climbChance) this.grabWall(this.x <= 0 ? -1 : 1);
              else this.dir *= -1;
            }
          }
          if (G.auto && t > this.nextThink && st !== 'sleep') this.think(t);
          if (st !== 'sleep' && t - this.lastTouch > G.sleepAfter && (st === 'sit' || st === 'stand')) {
            this.setState('sleep'); this.say('sleep');
          }
          if (st === 'sleep' && t - this.lastTouch < 1200) { this.setState('stand'); this.say('wake'); }
        }
      }
    }

    this.x = clamp(this.x, -S * .3, Math.max(0, maxX) + S * .3);
    this.y = clamp(this.y, top - S * .3, floorY() + S * .3);

    if (PET.on && stamp() - this.savedAt > 30000) this.savePet();

    var list = this.c.sprites[this.spriteKey()];
    if (list && list.length > 1 && t - this.frameAt > FRAME_MS) { this.frame++; this.frameAt = t; this.applySprite(); }
    this.render();
  };

  Mascot.prototype.render = function () {
    this.el.style.transform = 'translate3d(' + this.x.toFixed(2) + 'px,' + this.y.toFixed(2) + 'px,0)';
    this.flip.style.transform = 'scaleX(' + this.dir + ') rotate(' + (this.tilt * this.dir).toFixed(1) + 'deg)';
  };
  Mascot.prototype.hitWall = function (side) {
    if (G.climb && now() > this.sulkUntil && Math.abs(this.vy) < 26 && Math.random() < G.climbChance) this.grabWall(side);
    else { this.vx = -this.vx * G.bounce; this.x = side < 0 ? 1 : innerWidth - this.size - 1; }
  };
  Mascot.prototype.grabWall = function (side) {
    this.wall = side; this.platEl = null; this.vx = this.vy = 0; this.setState('climb');
    if (Math.random() < .4) this.say('climb');
  };
  Mascot.prototype.dropOff = function () {
    this.wall = 0; this.tilt = 0; this.vy = 1; this.vx = rand(-2, 2); this.setState('fall');
  };
  Mascot.prototype.land = function (surfY) {
    var impact = this.vy; this.y = surfY;
    if (impact > 9) {
      this.vy = -impact * G.bounce; this.setState('fall'); this.flash('land', 340);
      if (impact > 16 && Math.random() < .6) { this.say('landHard'); this.addMood(-2); }
      return;
    }
    this.vy = 0; this.tilt = 0; this.setState('stand'); this.flash('land', 340);
    this.nextThink = now() + rand(500, 1400);
  };
  Mascot.prototype.destroy = function () {
    if (PET.on) this.savePet();
    clearTimeout(this.bubbleTimer); clearTimeout(this.eatTimer); this.el.remove();
  };

  /* ==================================================================== */
  /*  밥                                                                   */
  /* ==================================================================== */
  function Food(type, x, y) {
    this.type = type; this.size = type.size;
    this.x = x; this.y = y; this.vx = rand(-1.5, 1.5); this.vy = 0;
    this.landed = false; this.taken = false; this.taker = null; this.dead = false;
    this.dragging = false; this.seen = {};
    var el = document.createElement('div');
    el.className = 'smj-food';
    el.setAttribute('draggable', 'false');
    el.setAttribute('data-t', String(FOODS.indexOf(type) % 3));
    el.innerHTML = '<div class="smj-fd-art"><div class="smj-fd-steam"></div><div class="smj-fd-rice"></div><div class="smj-fd-bowl"></div></div><img alt="" draggable="false">';
    document.body.appendChild(el);
    this.el = el; this.img = el.querySelector('img');
    this.applyLook(); this.bind();
    foods.push(this);
  }
  Food.prototype.applyLook = function () {
    this.size = this.type.size;
    this.el.style.width = this.el.style.height = this.size + 'px';
    this.el.title = this.type.name;
    if (this.type.image) { this.el.classList.add('has-img'); this.img.setAttribute('src', this.type.image); }
    else { this.el.classList.remove('has-img'); this.img.removeAttribute('src'); }
  };
  Food.prototype.bind = function () {
    var self = this, g = null;
    this.el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    this.el.addEventListener('pointerdown', function (e) {
      if (e.button === 2 || self.dead) return;
      e.preventDefault(); e.stopPropagation();
      self.el.setPointerCapture(e.pointerId);
      self.el.classList.add('dragging');
      if (self.taker) self.taker.cancelEat();
      if (fight && fight.food === self) endFight(true);
      self.dragging = true; self.taken = false; self.taker = null; self.landed = false;
      g = { id: e.pointerId, ox: e.clientX - self.x, oy: e.clientY - self.y };
    });
    this.el.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      self.x = e.clientX - g.ox; self.y = e.clientY - g.oy;
    });
    function up(e) {
      if (!g || e.pointerId !== g.id) return;
      g = null; self.dragging = false; self.el.classList.remove('dragging');
      self.vx = 0; self.vy = 0;
      var cx = self.x + self.size / 2, cy = self.y + self.size / 2, fed = null;
      mascots.forEach(function (m) {
        if (fed) return;
        if (cx > m.x - 10 && cx < m.x + m.size + 10 && cy > m.y - 10 && cy < m.y + m.size + 10) fed = m;
      });
      if (fed && !fed.eating) {
        fed.lastTouch = now(); fed.sulkUntil = 0;
        if (fed.state === 'sleep' || fed.state === 'fight') fed.setState('stand');
        fed.startEat(self, true);   // 손으로 주면 취향과 무관하게 받아먹음
      }
    }
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  };
  Food.prototype.step = function (dt) {
    if (this.dead) return;
    var maxX = innerWidth - this.size, maxY = floorY() - this.size;
    if (!this.dragging && !this.taken) {
      if (!this.landed) {
        this.vy += G.gravity * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.x < 0) { this.x = 0; this.vx *= -.5; }
        if (this.x > maxX) { this.x = maxX; this.vx *= -.5; }
        if (this.y >= maxY) {
          this.y = maxY;
          if (this.vy > 4) { this.vy = -this.vy * .28; this.vx *= .6; }
          else { this.vy = 0; this.landed = true; this.el.classList.add('landed'); }
        }
      } else this.y = maxY;
    }
    this.x = clamp(this.x, -this.size, maxX + this.size);
    this.el.style.transform = 'translate3d(' + this.x.toFixed(1) + 'px,' + this.y.toFixed(1) + 'px,0)';
  };
  Food.prototype.kill = function () {
    if (this.dead) return;
    this.dead = true; this.el.classList.add('eaten');
    var el = this.el, i = foods.indexOf(this);
    if (i >= 0) foods.splice(i, 1);
    setTimeout(function () { el.remove(); }, 500);
  };
  function dropFood(typeId, x) {
    if (foods.length >= 6) return null;
    var ty = typeId ? foodType(typeId) : pick(FOODS), s = ty.size;
    return new Food(ty, clamp((x == null ? rand(60, innerWidth - 60) : x) - s / 2, 0, innerWidth - s), ceilY() - s - 10);
  }

  /* ==================================================================== */
  /*  싸움 / 상호작용                                                       */
  /* ==================================================================== */
  function groundish(m) {
    return m.state === 'stand' || m.state === 'walk' || m.state === 'run' || m.state === 'sit' || m.state === 'sleep';
  }
  function spawnDust(x, y) {
    var d = document.createElement('div');
    d.className = 'smj-dust';
    d.innerHTML = '<i></i><i></i><i></i><b>✦</b><b>✱</b>';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d);
    return d;
  }
  function startFight(a, b, food) {
    if (fight) return;
    var t = now();
    a.cancelEat(); b.cancelEat();
    a.targetFood = b.targetFood = null;
    a.setState('fight'); b.setState('fight');
    a.dir = b.x > a.x ? 1 : -1; b.dir = -a.dir;
    a.holdUntil = b.holdUntil = t + 4200;
    if (food) { food.taken = true; food.taker = null; }
    var mid = (a.x + a.size / 2 + b.x + b.size / 2) / 2;
    var dust = spawnDust(mid, floorY() - Math.max(a.size, b.size) * 0.45);
    fight = { a: a, b: b, food: food, dust: dust, timers: [] };
    a.say('fightStart', true);
    fight.timers.push(setTimeout(function () { b.say('fightTaunt', true); }, 750));
    fight.timers.push(setTimeout(function () { a.say('fightTaunt', true); }, 1500));
    fight.timers.push(setTimeout(function () { b.say('fightTaunt', true); }, 2100));
    fight.timers.push(setTimeout(function () { endFight(false); }, 2800));
  }
  function endFight(aborted) {
    if (!fight) return;
    var f = fight; fight = null;
    f.timers.forEach(clearTimeout);
    if (f.dust) f.dust.remove();
    if (f.food) { f.food.taken = false; f.food.taker = null; }
    if (aborted) {
      [f.a, f.b].forEach(function (m) { if (m.state === 'fight') m.setState('stand'); m.holdUntil = 0; });
      return;
    }
    var pA = clamp(0.5 + (f.b.hunger - f.a.hunger) / 200, 0.15, 0.85);
    var win = Math.random() < pA ? f.a : f.b, lose = win === f.a ? f.b : f.a, t = now();
    win.setState('stand'); win.holdUntil = t + 900; win.say('fightWin'); win.flash('happy', 900);
    win.addMood(3);
    lose.setState('fall');
    lose.vx = (lose.x < win.x ? -1 : 1) * 7; lose.vy = -6;
    lose.holdUntil = 0; lose.sulkUntil = t + 7000; lose.platEl = null;
    lose.flash('bumped', 500); lose.addMood(-6);
    setTimeout(function () { lose.say('fightLose', true); }, 420);
    if (f.food && !f.food.dead) setTimeout(function () { if (!win.eating) win.startEat(f.food, true); }, 700);
    if (SOCIAL.makeUp) {
      setTimeout(function () {
        if (!lose || lose.state === 'drag' || lose.state === 'sleep' || win.state === 'sleep') return;
        lose.sulkUntil = 0;
        if (Math.abs(lose.x - win.x) < 560) { win.say('makeUp'); setTimeout(function () { lose.say('makeUp'); }, 1000); }
      }, 7200);
    }
  }
  var socialAt = 0;
  function chatReady(m) {
    return m && !m.eating && m.state !== 'drag' && m.state !== 'fall' &&
      m.state !== 'climb' && m.state !== 'ceiling' && m.state !== 'sleep' && m.state !== 'fight';
  }
  function social(t) {
    var a = mascots[0], b = mascots[1];
    if (!a || !b || fight) return;
    if (SOCIAL.fight && a.targetFood && a.targetFood === b.targetFood &&
        Math.abs(a.x - b.x) < (a.size + b.size) * .95 &&
        !a.eating && !b.eating && groundish(a) && groundish(b)) {
      a.targetFood.fought = true; startFight(a, b, a.targetFood); return;
    }
    if (SOCIAL.sleepTogether) {
      [[a, b], [b, a]].forEach(function (p) {
        var s = p[0], o = p[1];
        if (s.state === 'sleep' && o.state !== 'sleep' && !o.eating && !o.targetFood &&
            (o.state === 'stand' || o.state === 'sit') && t > o.sulkUntil &&
            Math.abs(s.x - o.x) < 220 && t - o.lastTouch > 7000) o.setState('sleep');
      });
    }
    if (t < socialAt) return;
    if (!chatReady(a) || !chatReady(b)) return;
    if (a.targetFood || b.targetFood) return;
    if (a.platEl !== b.platEl) return;                     // 서로 다른 높이면 대화 안 함
    if (Math.abs(a.x - b.x) > (a.size + b.size) * .75) return;
    socialAt = t + 16000;
    if (SOCIAL.fight && Math.random() < SOCIAL.fightChance) { startFight(a, b, null); return; }
    if (!SOCIAL.greet) return;
    var dx = b.x - a.x;
    a.dir = dx > 0 ? 1 : -1; b.dir = -a.dir;
    a.setState('stand'); b.setState('stand');
    a.holdUntil = b.holdUntil = t + 3000;
    a.say('greet');
    setTimeout(function () { if (chatReady(b)) b.say('reply'); }, 1150);
  }

  /* ── 우클릭 메뉴 ───────────────────────────────────────────────────── */
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  addEventListener('pointerdown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  function openMenu(m, x, y) {
    closeMenu();
    var items = [];
    FOODS.forEach(function (ft) { items.push([ft.name + ' 주기', function () { dropFood(ft.id, m.x + m.size / 2); }]); });
    items.push(null);
    items.push(['말 시키기', function () { m.lastTouch = now(); m.say(m.isGrumpy() ? 'grumpy' : 'click'); }]);
    items.push(['앉아', function () { m.lastTouch = now(); m.cancelEat(); m.setState('sit'); }]);
    items.push([G.follow ? '그만 따라와' : '따라와', function () { G.follow = !G.follow; }]);
    items.push(null);
    items.push(['시메지 설정…', openSettings]);
    if (STICKER.lock && canEditStickers()) {
      items.push(null);
      items.push([lockOn ? '스티커 잠금 해제' : '스티커 잠그기', function () { setLock(!lockOn); }]);
    }
    items.push(null);
    items.push(['숨기기', function () { m.c.on = false; syncMascots(); }]);
    var el = document.createElement('div');
    el.className = 'smj-menu';
    items.forEach(function (it) {
      if (!it) { el.appendChild(document.createElement('hr')); return; }
      var b = document.createElement('button');
      b.textContent = it[0];
      b.onclick = function () { it[1](); closeMenu(); };
      el.appendChild(b);
    });
    document.body.appendChild(el);
    placeMenu(el, x, y);
    menuEl = el;
  }

  /* 메뉴는 작업표시줄 위까지만 쓴다. 아래로 안 들어가면 위로 뒤집고,
     그래도 모자라면 메뉴 안에서 스크롤한다 (맨 아래 항목이 잘리지 않게) */
  function placeMenu(el, x, y) {
    readBarH();
    var pad = 8;
    var top0 = ceilY() + pad;                 // 쓸 수 있는 맨 위
    var bot0 = floorY() - pad;                // 쓸 수 있는 맨 아래 (작업표시줄 위)
    var room = Math.max(120, bot0 - top0);

    el.style.maxHeight = '';
    el.style.overflowY = '';
    if (el.offsetHeight > room) {
      el.style.maxHeight = room + 'px';
      el.style.overflowY = 'auto';
    }
    var h = el.offsetHeight, w = el.offsetWidth;

    var top = y;
    if (top + h > bot0) top = y - h;          // 위로 뒤집기
    if (top < top0) top = Math.max(top0, bot0 - h);

    el.style.left = Math.max(pad, Math.min(x, innerWidth - w - pad)) + 'px';
    el.style.top = top + 'px';
  }

  /* ==================================================================== */
  /*  설정 창 — 쓸 때만 따로 불러온다 (방문자 기본 로드에는 포함되지 않음)      */
  /* ==================================================================== */
  var settingsLoading = false;
  function openSettings() {
    if (window.SMJ_SETTINGS) { window.SMJ_SETTINGS.open(); return; }
    if (settingsLoading) return;
    settingsLoading = true;
    var src = SELF_SRC ? SELF_SRC.replace(/shimeji\.js(\?.*)?$/, 'shimeji-settings.js') : './images/shimeji-settings.js';
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { settingsLoading = false; if (window.SMJ_SETTINGS) window.SMJ_SETTINGS.open(); };
    s.onerror = function () {
      settingsLoading = false;
      alert('설정 창 파일(shimeji-settings.js)을 찾지 못했어.\n스킨 파일 업로드에 같이 올렸는지 확인해줘.');
    };
    document.head.appendChild(s);
  }

  /* 이 브라우저에 저장해둔 설정을 덮어씌운다 (설정 창의 "이 브라우저에 저장") */
  function mergeInto(target, src) {
    if (!src) return;
    Object.keys(src).forEach(function (k) { if (k in target) target[k] = src[k]; });
  }
  function loadSavedConfig() {
    var d = null;
    /* 이 브라우저에 저장해둔 게 먼저, 없으면 서버에 저장된 주인 설정 */
    try { d = JSON.parse(localStorage.getItem('smj:config') || 'null'); } catch (e) {}
    if (!d) { try { d = window.SMJ_CONFIG || null; } catch (e) {} }
    if (!d) return;
    mergeInto(G, d.G); mergeInto(SOCIAL, d.SOCIAL); mergeInto(PET, d.PET); mergeInto(STICKER, d.STICKER);
    if (Array.isArray(d.FOODS) && d.FOODS.length) FOODS = d.FOODS;
    if (Array.isArray(d.CHARS)) {
      d.CHARS.forEach(function (sc) {
        for (var i = 0; i < CHARS.length; i++) {
          if (CHARS[i].id !== sc.id) continue;
          var c = CHARS[i];
          ['name', 'on', 'size', 'speed'].forEach(function (k) { if (sc[k] != null) c[k] = sc[k]; });
          if (sc.pref) c.pref = sc.pref;
          if (sc.sprites) STATES.forEach(function (s) { if (sc.sprites[s]) c.sprites[s] = sc.sprites[s]; });
          if (sc.lines) c.lines = sc.lines;
        }
      });
    }
  }

  /* ==================================================================== */
  /*  스티커: 부유 제거는 CSS, 잠금은 여기                                   */
  /* ==================================================================== */
  var lockOn = false, lockBtn = null;
  function setLock(on) {
    lockOn = !!on;
    document.documentElement.classList.toggle('smj-sticker-locked', lockOn);
    if (lockBtn) {
      /* 아이콘만 있으면 못 찾아서, 글자를 같이 둔다 */
      lockBtn.innerHTML = lockIcon(lockOn) +
        '<span class="smj-lock-label">' + (lockOn ? '스티커 잠김' : '스티커 잠금') + '</span>';
      lockBtn.title = lockOn ? '스티커 잠김 — 누르면 다시 옮길 수 있어' : '스티커 잠그기';
      lockBtn.setAttribute('aria-label', lockBtn.title);
      lockBtn.setAttribute('aria-pressed', lockOn ? 'true' : 'false');
      lockBtn.style.color = lockOn ? 'var(--dds-accent, #c37822)' : '';
    }
    try { localStorage.setItem('smj:stickerLock', lockOn ? '1' : '0'); } catch (e) {}
  }
  function initSticker() {
    if (!STICKER.lock) return;
    try { lockOn = localStorage.getItem('smj:stickerLock') === '1'; } catch (e) {}

    // 캡처 단계에서 막으면 스티커 자신의 pointerdown 핸들러가 아예 실행되지 않는다.
    // #sticker-layer 에 걸기 때문에 document 레벨(클릭음 등)은 그대로 동작한다.
    var attach = function () {
      var layer = document.getElementById('sticker-layer');
      if (!layer || layer.__smjLock) return !!layer;
      layer.__smjLock = true;
      layer.addEventListener('pointerdown', function (e) {
        if (!lockOn) return;
        var t = e.target;
        if (t && t.closest && t.closest('.sticker')) e.stopPropagation();
      }, true);
      return true;
    };
    if (!attach()) {
      var tries = 0, iv = setInterval(function () { if (attach() || ++tries > 40) clearInterval(iv); }, 250);
    }

    if (!canEditStickers()) { setLock(lockOn); return; }

    // 작업표시줄에 스킨의 다른 버튼과 같은 모양으로 넣는다 (.taskbar-button 클래스 재사용)
    //
    // 자리를 고를 때 주의: .taskbar-quick 은 연필(새 글쓰기) "버튼"이라
    // 그 안에 넣으면 버튼 속에 버튼이 박혀서 화면에 안 보인다.
    // 넣어야 할 곳은 .taskbar-quick-slot 이라는 "칸".
    // 그리고 스킨이 작업표시줄을 다시 그리면 우리 버튼이 지워지므로,
    // 한 번만 넣지 말고 없어질 때마다 다시 넣는다.
    function slot() {
      var bar = document.getElementById('taskbar');
      if (!bar) return null;
      return bar.querySelector('.taskbar-quick-slot') ||
             bar.querySelector('.taskbar-right') || bar;
    }
    function place() {
      var host = slot();
      if (!host || host.querySelector('#smj-lock')) return;
      var old = document.getElementById('smj-lock');
      if (old) old.remove();
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'smj-lock';
      b.className = 'taskbar-button';
      b.addEventListener('click', function () { setLock(!lockOn); });
      /* 연필(새 글쓰기) 왼쪽에 몰아둔다 — 저장 버튼과 나란히 */
      var pencil = host.querySelector('.taskbar-quick');
      if (pencil) host.insertBefore(b, pencil); else host.appendChild(b);
      lockBtn = b;
      setLock(lockOn);
    }
    place();
    try {
      new MutationObserver(function () { try { place(); } catch (e) {} })
        .observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* 자물쇠 아이콘 — 스킨 아이콘과 같은 24 격자 픽셀 스타일 */
  function lockIcon(closed) {
    var d = closed
      ? 'M7 2h10v2H7V2zM5 4h2v6H5V4zm12 0h2v6h-2V4zM3 10h18v12H3V10zm2 2v8h14v-8H5zm6 2h2v4h-2v-4z'
      : 'M7 2h10v2H7V2zM5 4h2v6H5V4zm12 0h2v2h-2V4zM3 10h18v12H3V10zm2 2v8h14v-8H5zm6 2h2v4h-2v-4z';
    return '<svg viewBox="0 0 24 24" width="16" height="16" class="dds-icon" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="' + d + '"/></svg>';
  }

  /* ==================================================================== */
  /*  루프 / 수명주기                                                       */
  /* ==================================================================== */
  var last = now(), autoDropAt = 0, started = false;
  function loop() {
    requestAnimationFrame(loop);
    var t = now();
    if (document.hidden) { last = t; return; }         // 백그라운드 탭에서는 계산 정지
    var dt = clamp((t - last) / 16.667, 0, 3);
    last = t;
    refreshPlatforms(t);
    for (var i = 0; i < foods.length; i++) foods[i].step(dt);
    for (var j = 0; j < mascots.length; j++) mascots[j].step(dt, t);
    social(t);
    if (fight && fight.dust) {
      fight.dust.style.left = ((fight.a.x + fight.a.size / 2 + fight.b.x + fight.b.size / 2) / 2) + 'px';
    }
    if (FOODCFG.autoDropMs > 0 && t > autoDropAt) { autoDropAt = t + FOODCFG.autoDropMs; if (mascots.length) dropFood(); }
  }

  addEventListener('resize', function () {
    readBarH();
    plat.at = -9999;
    mascots.forEach(function (m) {
      m.x = clamp(m.x, 0, Math.max(0, innerWidth - m.size));
      m.platEl = null;
      if (['drag', 'climb', 'ceiling', 'eat', 'fight'].indexOf(m.state) < 0) m.setState('fall');
    });
  });
  addEventListener('pagehide', function () { mascots.forEach(function (m) { if (PET.on) m.savePet(); }); });
  addEventListener('visibilitychange', function () {
    if (document.hidden) mascots.forEach(function (m) { if (PET.on) m.savePet(); });
  });

  setInterval(function () {
    if (document.hidden) return;
    mascots.forEach(function (m) {
      if (m.state === 'sleep' || Math.random() > .5) return;
      m.el.classList.add('blink');
      setTimeout(function () { m.el.classList.remove('blink'); }, 130);
    });
  }, 3200);

  function syncMascots() {
    CHARS.forEach(function (c) {
      var m = null;
      mascots.forEach(function (x) { if (x.c === c) m = x; });
      if (c.on && !m) mascots.push(new Mascot(c));
      if (!c.on && m) {
        if (fight && (fight.a === m || fight.b === m)) endFight(true);
        m.destroy(); mascots.splice(mascots.indexOf(m), 1);
      }
    });
    mascots.sort(function (p, q) { return CHARS.indexOf(p.c) - CHARS.indexOf(q.c); });
  }

  function start() {
    if (started) return;
    started = true;
    readBarH();
    loadSavedConfig();
    if (PET.ownerOnly && !isOwner()) PET.on = false;
    initSticker();
    syncMascots();
    // 오랜만에 왔으면 반가워한다
    mascots.forEach(function (m) {
      if (PET.on && m.awayMs > PET.awayHours * HOUR) setTimeout(function () { m.say('welcome'); m.heart(); }, 1800);
    });
    requestAnimationFrame(loop);
  }

  /* 로딩 화면(#dds-boot)이 사라진 뒤에 등장 — 없으면(재방문) 바로 시작 */
  function waitForBoot() {
    var boot = document.getElementById('dds-boot');
    if (!boot) { start(); return; }
    var mo = new MutationObserver(function () {
      if (!boot.isConnected) { mo.disconnect(); start(); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); start(); }, 3400);   // 2000+400+500 여유
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', waitForBoot);
  else waitForBoot();

  /* 디버그용 (없어도 동작함) */
  window.SMJ = {
    mascots: mascots, foods: foods, dropFood: dropFood, CHARS: CHARS,
    get FOODS() { return FOODS; }, set FOODS(v) { FOODS = v; },
    G: G, PET: PET, SOCIAL: SOCIAL, STICKER: STICKER, STATES: STATES,
    STATE_LABEL: STATE_LABEL, LINE_GROUPS: LINE_GROUPS,
    syncMascots: syncMascots, openSettings: openSettings,
    setLock: function (v) { setLock(v); }, isLocked: function () { return lockOn; },
    canEditStickers: canEditStickers,
    getFight: function () { return fight; }, platforms: function () { return plat.list; },
    /* 설정 창이 값을 바꾼 뒤 부르는 것들 */
    applyChars: function () {
      syncMascots();
      mascots.forEach(function (m) { m.applySize(); m.frame = 0; m.applySprite(); });
    },
    refreshFoods: function () { foods.forEach(function (f) { f.applyLook(); }); },
    reset: function () { try { ['a','b'].forEach(function(i){ localStorage.removeItem('smj:pet:'+i); }); } catch(e){} }
  };
})();
