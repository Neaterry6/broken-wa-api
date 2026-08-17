const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../utils/auth');
const db = require('../utils/database');
const logger = require('../utils/logger');
const { BaileysClient } = require('../clients/baileys');

const router = express.Router();

// --- Owner-only endpoints (no auth middleware needed for init) ---
router.get('/owner/init', (req, res) => {
  const sessions = db.prepare('SELECT id, name, phone, status, created_at, last_seen FROM sessions ORDER BY created_at DESC').all();
  const keys = db.prepare('SELECT id, name, session_id, rate_limit, active, created_at FROM api_keys ORDER BY created_at DESC').all();
  res.json({ sessions, apiKeys: keys });
});

// Create session
router.post('/sessions', authMiddleware, (req, res) => {
  const { name } = req.body;
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO sessions (id, name) VALUES (?, ?)').run(id, name || id);
  res.json({ id, name, status: 'created' });
});

// Get session list
router.get('/sessions', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  res.json(rows);
});

// Get session detail
router.get('/sessions/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Session not found' });
  res.json(row);
});

// Delete session
router.delete('/sessions/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  // Also delete associated data
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM api_keys WHERE session_id = ?').run(req.params.id);
  BaileysClient.destroy(req.params.id);
  logger.info({ id: req.params.id }, 'Session deleted');
  res.json({ ok: true });
});

// Generate API key for session
router.post('/sessions/:id/api-keys', authMiddleware, (req, res) => {
  const { name } = req.body;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { key } = require('../utils/auth').createApiKey(req.params.id, name || 'default');
  const id = crypto.randomBytes(8).toString('hex');
  const keyRow = db.prepare('SELECT * FROM api_keys WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id);
  res.json({ ...keyRow, rawKey: key });
});

// Pairing code
router.post('/sessions/:id/pair-code', authMiddleware, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.id);
    const code = await client.pairCode(phone);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QR code
router.get('/sessions/:id/qr', authMiddleware, async (req, res) => {
  try {
    const client = BaileysClient.getOrCreate(req.params.id);
    const qr = await client.getQR();
    res.json({ qr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get connections
router.get('/connections', authMiddleware, (req, res) => {
  const connections = BaileysClient.getAllConnections();
  res.json(connections);
});

module.exports = router;
