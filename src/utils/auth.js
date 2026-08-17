const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./database');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function createApiKey(sessionId, name = 'default') {
  const id = crypto.randomBytes(16).toString('hex');
  const rawKey = `bwa_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashKey(rawKey);

  db.prepare(`INSERT OR REPLACE INTO api_keys (id, key, name, session_id, rate_limit) VALUES (?, ?, ?, ?, 60)`).run(
    id, keyHash, name, sessionId
  );
  logger.info({ id, name, apiKey: rawKey }, 'API key created');
  return { id, key: rawKey };
}

function validateApiKey(key) {
  if (!key || !key.startsWith('bwa_')) return null;
  const hash = hashKey(key);
  const row = db.prepare('SELECT * FROM api_keys WHERE key = ? AND active = 1').get(hash);
  return row || null;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const queryKey = req.query.api_key;

  if (queryKey) {
    const session = validateApiKey(queryKey);
    if (!session) return res.status(401).json({ error: 'Invalid or inactive API key' });
    req.apiSession = session;
    req.sessionId = session.session_id;
    return next();
  }

  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (!payload) return res.status(401).json({ error: 'Invalid token' });
    req.user = payload;
    return next();
  }

  res.status(401).json({ error: 'Authentication required. Use Bearer token or api_key query param.' });
}

function ownerAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Owner token required' });
  const payload = verifyToken(header.slice(7));
  if (!payload || !payload.owner) return res.status(403).json({ error: 'Owner access required' });
  req.owner = payload;
  next();
}

module.exports = { generateToken, verifyToken, createApiKey, validateApiKey, authMiddleware, ownerAuth, JWT_SECRET };
