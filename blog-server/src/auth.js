'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, now } = require('./db');
const { cfg } = require('./config');

const COOKIE = 'sid';
const DAY = 86400000;

function newId() { return crypto.randomBytes(24).toString('base64url'); }

function createSession({ kind, userId = null, nickname = null }) {
  const id = newId();
  const t = now();
  db.prepare('INSERT INTO sessions(id,kind,user_id,nickname,created_at,expires_at) VALUES(?,?,?,?,?,?)')
    .run(id, kind, userId, nickname, t, t + cfg.sessionDays * DAY);
  return id;
}

function readSession(req) {
  const id = req.cookies && req.cookies[COOKIE];
  if (!id) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!s) return null;
  if (s.expires_at < now()) { db.prepare('DELETE FROM sessions WHERE id=?').run(id); return null; }
  return s;
}

function setCookie(res, id) {
  res.cookie(COOKIE, id, {
    httpOnly: true, sameSite: 'lax', maxAge: cfg.sessionDays * DAY,
    secure: process.env.NODE_ENV === 'production'
  });
}
function clearCookie(res) { res.clearCookie(COOKIE); }

/* 로그인 시도 제한: 같은 IP 에서 10분에 10회 */
function tooManyAttempts(ip) {
  const since = now() - 10 * 60 * 1000;
  db.prepare('DELETE FROM login_attempts WHERE ts < ?').run(since);
  const n = db.prepare('SELECT COUNT(*) c FROM login_attempts WHERE ip=? AND ts>=?').get(ip, since).c;
  return n >= 10;
}
function noteAttempt(ip) {
  db.prepare('INSERT INTO login_attempts(ip,ts) VALUES(?,?)').run(ip, now());
}
function clearAttempts(ip) {
  db.prepare('DELETE FROM login_attempts WHERE ip=?').run(ip);
}

async function verifyOwner(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) { await bcrypt.compare(password, '$2b$10$' + 'x'.repeat(53)).catch(() => {}); return null; }
  const ok = await bcrypt.compare(password, u.pw_hash);
  return ok ? u : null;
}

async function createOwner(username, password) {
  const hash = await bcrypt.hash(password, 12);
  const info = db.prepare('INSERT INTO users(username,pw_hash,role,created_at) VALUES(?,?,?,?)')
    .run(username, hash, 'owner', now());
  return info.lastInsertRowid;
}
async function changePassword(userId, password) {
  const hash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET pw_hash=? WHERE id=?').run(hash, userId);
  db.prepare("DELETE FROM sessions WHERE kind='owner' AND user_id=?").run(userId);
}
function ownerExists() {
  return db.prepare("SELECT COUNT(*) c FROM users WHERE role='owner'").get().c > 0;
}

/* 미들웨어 */
function attach(req, res, next) {
  const s = readSession(req);
  req.session = s;
  req.isOwner = !!(s && s.kind === 'owner');
  req.guestName = s && s.kind === 'guest' ? s.nickname : null;
  next();
}
function requireOwner(req, res, next) {
  if (!req.isOwner) return res.status(401).json({ error: 'unauthorized', message: '주인만 할 수 있어' });
  next();
}

module.exports = {
  COOKIE, createSession, readSession, setCookie, clearCookie,
  tooManyAttempts, noteAttempt, clearAttempts,
  verifyOwner, createOwner, changePassword, ownerExists,
  attach, requireOwner
};
