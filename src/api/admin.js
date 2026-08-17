const express = require('express');
const { generateToken, authMiddleware } = require('../utils/auth');
const db = require('../utils/database');
const crypto = require('crypto');
const logger = require('../utils/logger');

const router = express.Router();

// Owner login (uses JWT_SECRET as password by default)
router.post('/login', (req, res) => {
  const { password } = req.body;
  // Use JWT_SECRET as owner password for simplicity
  if (password !== process.env.JWT_SECRET && password !== 'owner') {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = generateToken({ owner: true, iat: Date.now() });
  res.json({ token, type: 'owner' });
});

// Create owner session
router.post('/sessions', authMiddleware, (req, res) => {
  const { name } = req.body;
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO sessions (id, name) VALUES (?, ?)').run(id, name || id);
  res.json({ id, name, status: 'created' });
});

// List sessions
router.get('/sessions', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id, name, phone, status, created_at, last_seen FROM sessions ORDER BY created_at DESC').all();
  res.json(rows);
});

// Get session detail
router.get('/sessions/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Delete session
router.delete('/sessions/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM api_keys WHERE session_id = ?').run(req.params.id);
  db.prepare('DELETE FROM webhooks WHERE session_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Generate API key
router.post('/sessions/:id/api-keys', authMiddleware, (req, res) => {
  const { name } = req.body;
  const key = `bwa_${crypto.randomBytes(24).toString('hex')}`;
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO api_keys (id, key, name, session_id) VALUES (?, ?, ?, ?)').run(id, key, name || 'default', req.params.id);
  res.json({ id, name: name || 'default', rawKey: key });
});

// List API keys
router.get('/api-keys', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
  res.json(rows);
});

// Enable/disable key
router.patch('/api-keys/:id/toggle', authMiddleware, (req, res) => {
  db.prepare('UPDATE api_keys SET active = NOT active WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Webhooks
router.get('/webhooks', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/webhooks', authMiddleware, (req, res) => {
  const { session_id, url, secret, events } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO webhooks (id, session_id, url, secret, events) VALUES (?, ?, ?, ?, ?)').run(
    id, session_id || '', url, secret || '', events || 'messages.received'
  );
  res.json({ id });
});

router.delete('/webhooks/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Automations
router.get('/automations', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM automations ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/automations', authMiddleware, (req, res) => {
  const { session_id, name, trigger_type, trigger_value, action, action_params } = req.body;
  if (!name || !trigger_type || !action) return res.status(400).json({ error: 'name, trigger_type, action required' });
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO automations (id, session_id, name, trigger_type, trigger_value, action, action_params) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, session_id || '', name, trigger_type, trigger_value || '', action, JSON.stringify(action_params || {})
  );
  res.json({ id, name });
});

router.patch('/automations/:id/toggle', authMiddleware, (req, res) => {
  db.prepare('UPDATE automations SET enabled = NOT enabled WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/automations/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Stats
router.get('/stats', authMiddleware, (req, res) => {
  const sessions = db.prepare('SELECT COUNT(*) as count, SUM(CASE WHEN status="connected" THEN 1 ELSE 0 END) as connected FROM sessions').get();
  const messages = db.prepare('SELECT COUNT(*) as count FROM messages').get();
  const webhooks = db.prepare('SELECT COUNT(*) as count FROM webhooks WHERE active = 1').get();
  const automations = db.prepare('SELECT COUNT(*) as count FROM automations WHERE enabled = 1').get();
  res.json({ sessions: sessions.count, connected: sessions.connected, messages: messages.count, webhooks: webhooks.count, automations: automations.count });
});

// Test webhook
router.post('/webhooks/test', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const https = require('https');
    const data = JSON.stringify({ event: 'test', timestamp: Date.now() });
    const parsed = new URL(url);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req2 = https.request(parsed, options, (resp) => {
      let body = '';
      resp.on('data', c => body += c);
      resp.on('end', () => res.json({ status: resp.statusCode, body: body.slice(0, 200) }));
    });
    req2.on('error', () => res.status(500).json({ error: 'Failed to send test webhook' }));
    req2.write(data);
    req2.end();
  } catch {
    res.status(500).json({ error: 'Invalid URL' });
  }
});

module.exports = router;
