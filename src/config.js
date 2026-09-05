'use strict';
const path = require('path');
const fs = require('fs');

/* Railway 볼륨이 붙으면 RAILWAY_VOLUME_MOUNT_PATH 가 들어온다.
   볼륨이 없으면 재배포 때 데이터가 사라지므로 시작할 때 크게 경고한다. */
const VOLUME = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
const ON_VOLUME = !!(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);

const cfg = {
  port: Number(process.env.PORT) || 3000,
  dataDir: VOLUME,
  onVolume: ON_VOLUME,
  dbFile: path.join(VOLUME, 'blog.db'),
  uploadDir: path.join(VOLUME, 'uploads'),
  skinDir: path.join(__dirname, '..', 'public', 'skin'),

  blogTitle: process.env.BLOG_TITLE || '',   // 비어 있으면 관리 화면에서 정한다
  perPage: Number(process.env.PER_PAGE) || 10,
  listStyle: process.env.LIST_STYLE || 'gallery',      // gallery | list
  galleryCategory: process.env.GALLERY_CATEGORY || '갤러리',

  sessionDays: 14,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 20,
  imageMaxSide: Number(process.env.IMAGE_MAX_SIDE) || 2000,
  thumbMaxSide: 640
};

for (const d of [cfg.dataDir, cfg.uploadDir]) {
  fs.mkdirSync(d, { recursive: true });
}

function banner() {
  if (!cfg.onVolume) {
    console.warn('\n' + '='.repeat(64));
    console.warn(' ⚠ 볼륨이 안 붙어 있어. 지금은 컨테이너 안에 저장 중이라');
    console.warn('   재배포하면 글과 이미지가 전부 사라져.');
    console.warn('   Railway 서비스에 Volume 을 붙이고 다시 배포해줘.');
    console.warn('   (붙이면 RAILWAY_VOLUME_MOUNT_PATH 가 자동으로 들어와)');
    console.warn('='.repeat(64) + '\n');
  } else {
    console.log('저장 위치:', cfg.dataDir, '(볼륨)');
  }
}

module.exports = { cfg, banner };
