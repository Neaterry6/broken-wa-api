const express = require('express');
const { authMiddleware } = require('../utils/auth');
const db = require('../utils/database');
const crypto = require('crypto');
const { BaileysClient } = require('../clients/baileys');

const router = express.Router();

// --- Webhooks ---
router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/', authMiddleware, (req, res) => {
  const { session_id, url, secret, events } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO webhooks (id, session_id, url, secret, events) VALUES (?, ?, ?, ?, ?)').run(
    id, session_id, url, secret || '', events || 'messages.received,messages.sent,messages.updated,groups.updated'
  );
  res.json({ id });
});

router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Automations ---
router.get('/automations', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM automations ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/automations', authMiddleware, (req, res) => {
  const { session_id, name, trigger_type, trigger_value, action, action_params } = req.body;
  if (!name || !trigger_type || !trigger_value || !action) {
    return res.status(400).json({ error: 'name, trigger_type, trigger_value, action required' });
  }
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare(`INSERT INTO automations (id, session_id, name, trigger_type, trigger_value, action, action_params)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, session_id, name, trigger_type, trigger_value, action, action_params || '{}');
  res.json({ id, name });
});

router.delete('/automations/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Group operations ---
router.post('/groups/create', authMiddleware, async (req, res) => {
  const { subject, participants, desc } = req.body;
  if (!subject || !participants) return res.status(400).json({ error: 'subject and participants required' });
  try {
    const { session_id } = req.params;
    const client = BaileysClient.getOrCreate(session_id);
    const result = await client.sock.groupCreate(subject, participants);
    if (desc) await client.sock.groupUpdateDescription(result.gid, desc);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups/list', authMiddleware, async (req, res) => {
  try {
    const client = BaileysClient.getOrCreate(req.params.session_id);
    const groups = await client.sock.groupFetchAllParticipating();
    res.json(Object.entries(groups).map(([id, g]) => ({ ...g, id })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Presence ---
router.post('/:sessionId/presence', authMiddleware, async (req, res) => {
  const { jid, presence } = req.body;
  if (!jid || !presence) return res.status(400).json({ error: 'jid and presence required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    await client.sock.sendPresenceUpdate(presence, jid);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Typing indicator ---
router.post('/:sessionId/typing', authMiddleware, async (req, res) => {
  const { jid, duration = 5000 } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    await client.sock.sendPresenceUpdate('composing', jid);
    setTimeout(async () => await client.sock.sendPresenceUpdate('paused', jid), duration);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
