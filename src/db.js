'use strict';
const Database = require('better-sqlite3');
const { cfg } = require('./config');

const db = new Database(cfg.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  pw_hash    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,             -- 'owner' | 'guest'
  user_id    INTEGER,
  nickname   TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT '',
  body_md     TEXT NOT NULL DEFAULT '',
  body_html   TEXT NOT NULL DEFAULT '',
  thumb       TEXT,
  visibility  TEXT NOT NULL DEFAULT 'public',   -- public | private
  is_notice   INTEGER NOT NULL DEFAULT 0,
  system_kind TEXT,                              -- 'gallery' 등 (일반 목록에서 숨김)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags ON post_tags(tag);

CREATE TABLE IF NOT EXISTS uploads (
  id         INTEGER PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,      -- /uploads/2026/09/xxx.webp
  orig_name  TEXT NOT NULL,
  w          INTEGER, h INTEGER,
  bytes      INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook (
  id         INTEGER PRIMARY KEY,
  nickname   TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(ip, ts);
`);

const now = () => Date.now();

/* ── 설정 ── */
const settings = {
  get(key, dflt) {
    const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return r ? r.value : dflt;
  },
  set(key, value) {
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, String(value));
  }
};

/* ── 글 ── */
const posts = {
  visibleWhere(includeSystem) {
    return includeSystem
      ? "visibility='public'"
      : "visibility='public' AND system_kind IS NULL";
  },
  list({ page = 1, perPage = 10, category = null, tag = null, q = null, includeSystem = false } = {}) {
    const off = (page - 1) * perPage;
    const where = [posts.visibleWhere(includeSystem)];
    const args = [];
    if (category) {
      where.push('(category = ? OR category LIKE ?)');
      args.push(category, category + '/%');
    }
    if (q) {
      /* 제목·본문에서 찾는다 */
      where.push('(p.title LIKE ? OR p.body_md LIKE ?)');
      args.push('%' + q + '%', '%' + q + '%');
    }
    let sql = `SELECT p.* FROM posts p`;
    if (tag) {
      sql += ` JOIN post_tags t ON t.post_id = p.id AND t.tag = ?`;
      args.unshift(tag);
    }
    sql += ` WHERE ${where.join(' AND ')} ORDER BY is_notice DESC, created_at DESC LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...args, perPage + 1, off);
    const hasNext = rows.length > perPage;
    return { rows: rows.slice(0, perPage), hasNext, hasPrev: page > 1 };
  },
  get(id) { return db.prepare('SELECT * FROM posts WHERE id=?').get(id); },
  all() { return db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all(); },
  create(p) {
    const t = now();
    const info = db.prepare(`INSERT INTO posts
      (title,category,body_md,body_html,thumb,visibility,is_notice,system_kind,created_at,updated_at)
      VALUES (@title,@category,@body_md,@body_html,@thumb,@visibility,@is_notice,@system_kind,@created_at,@updated_at)`)
      .run({ visibility: 'public', is_notice: 0, system_kind: null, thumb: null, ...p, created_at: t, updated_at: t });
    return info.lastInsertRowid;
  },
  update(id, p) {
    const cur = posts.get(id);
    if (!cur) return null;
    db.prepare(`UPDATE posts SET title=@title,category=@category,body_md=@body_md,body_html=@body_html,
      thumb=@thumb,visibility=@visibility,is_notice=@is_notice,updated_at=@updated_at WHERE id=@id`)
      .run({ ...cur, ...p, id, updated_at: now() });
    return posts.get(id);
  },
  remove(id) { db.prepare('DELETE FROM posts WHERE id=?').run(id); },
  bySystem(kind) { return db.prepare('SELECT * FROM posts WHERE system_kind=?').get(kind); },
  /* 공지 — 스킨이 /notice 주소로 따로 읽어간다 */
  notices() {
    return db.prepare(`SELECT * FROM posts
      WHERE visibility='public' AND is_notice=1 AND system_kind IS NULL
      ORDER BY created_at DESC`).all();
  },

  setTags(id, tags) {
    db.prepare('DELETE FROM post_tags WHERE post_id=?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO post_tags(post_id,tag) VALUES(?,?)');
    for (const t of tags) if (t) ins.run(id, t);
  },
  tagsOf(id) { return db.prepare('SELECT tag FROM post_tags WHERE post_id=?').all(id).map(r => r.tag); },
  allTags() {
    return db.prepare(`SELECT t.tag, COUNT(*) n FROM post_tags t
      JOIN posts p ON p.id=t.post_id AND p.visibility='public' AND p.system_kind IS NULL
      GROUP BY t.tag ORDER BY n DESC, t.tag`).all();
  },
  categories() {
    return db.prepare(`SELECT category, COUNT(*) n FROM posts
      WHERE visibility='public' AND category<>'' GROUP BY category ORDER BY category`).all();
  }
};

/* ── 업로드 ── */
const uploads = {
  add(u) {
    const info = db.prepare(`INSERT INTO uploads(path,orig_name,w,h,bytes,mime,created_at)
      VALUES(@path,@orig_name,@w,@h,@bytes,@mime,@created_at)`).run({ ...u, created_at: now() });
    return uploads.get(info.lastInsertRowid);
  },
  get(id) { return db.prepare('SELECT * FROM uploads WHERE id=?').get(id); },
  list() { return db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all(); },
  remove(id) { db.prepare('DELETE FROM uploads WHERE id=?').run(id); },
  totalBytes() { return db.prepare('SELECT COALESCE(SUM(bytes),0) b FROM uploads').get().b; }
};

/* ── 방명록 ── */
const guestbook = {
  list(limit = 100) { return db.prepare('SELECT * FROM guestbook ORDER BY created_at DESC LIMIT ?').all(limit); },
  add(nickname, body) {
    db.prepare('INSERT INTO guestbook(nickname,body,created_at) VALUES(?,?,?)').run(nickname, body, now());
  },
  remove(id) { db.prepare('DELETE FROM guestbook WHERE id=?').run(id); }
};

module.exports = { db, settings, posts, uploads, guestbook, now };
