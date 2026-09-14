'use strict';
/* 로컬에서 화면을 확인해보려고 샘플 글을 넣는다. 배포 후엔 안 써도 됨. */
const { posts } = require('./db');
const mdx = require('./markdown');

const samples = [
  { title: '첫 글을 써봤다', category: '일기', tags: ['블로그', '시작'],
    md: '## 오늘 있었던 일\n\n블로그를 **직접 만들기로** 했다. 창이 뜨는 스킨이 마음에 들어서,\n글쓰기 화면도 *같은 모양*으로 맞추기로 했다.\n\n> 결국 중요한 건 계속 쓰게 되느냐다.\n\n- 로그인 만들기\n- 에디터 고르기\n- 이미지 업로드\n' },
  { title: '스킨 고르는 중', category: '기록', tags: ['스킨'],
    md: '창이 뜨는 스킨을 찾았다. 작업표시줄도 있고 스티커도 붙는다.\n\n`npm run dev` 로 띄워서 확인 중.' },
  { title: '두 번째 카테고리 테스트', category: '기록/메모', tags: ['테스트'],
    md: '하위 카테고리가 잘 잡히는지 보려고 쓴 글.' }
];

if (posts.all().filter(p => !p.system_kind).length === 0) {
  for (const s of samples) {
    const id = posts.create({
      title: s.title, category: s.category, body_md: s.md,
      body_html: mdx.render(s.md), thumb: mdx.firstImage(s.md)
    });
    posts.setTags(id, s.tags);
  }
  console.log('샘플 글 3개 넣었어');
} else {
  console.log('이미 글이 있어서 건너뜀');
}
