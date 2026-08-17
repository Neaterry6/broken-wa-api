const express = require('express');
const { authMiddleware } = require('../utils/auth');
const db = require('../utils/database');
const { BaileysClient } = require('../clients/baileys');

const router = express.Router();

// Send text message
router.post('/:sessionId/send/text', authMiddleware, async (req, res) => {
  const { jid, text, quotedMessageId } = req.body;
  if (!jid || !text) return res.status(400).json({ error: 'jid and text required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const key = quotedMessageId ? { quoted: { key: { id: quotedMessageId } } } : {};
    const result = await client.sock.sendMessage(jid, { text }, key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send button message
router.post('/:sessionId/send/button', authMiddleware, async (req, res) => {
  const { jid, title, body, footer, buttons } = req.body;
  if (!jid || !body || !buttons) return res.status(400).json({ error: 'jid, body, and buttons required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    await client.sendButton(jid, title || '', body, footer || '', buttons);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send interactive message (native flow buttons, lists, CTAs)
router.post('/:sessionId/send/interactive', authMiddleware, async (req, res) => {
  const { jid, text, footer, interactiveButtons } = req.body;
  if (!jid || !interactiveButtons) return res.status(400).json({ error: 'jid and interactiveButtons required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    await client.sendInteractive(jid, { text, footer, interactiveButtons });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send media
router.post('/:sessionId/send/media', authMiddleware, async (req, res) => {
  const { jid, media, caption, mimetype } = req.body;
  if (!jid || !media) return res.status(400).json({ error: 'jid and media required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const opts = { caption, mimetype };
    const result = await client.sock.sendMessage(jid, { ...opts, image: media });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send location
router.post('/:sessionId/send/location', authMiddleware, async (req, res) => {
  const { jid, latitude, longitude, name, address } = req.body;
  if (!jid || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'jid, latitude, and longitude required' });
  }
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const result = await client.sock.sendMessage(jid, {
      location: { degreesLatitude: latitude, degreesLongitude: longitude, name, address },
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send contact
router.post('/:sessionId/send/contact', authMiddleware, async (req, res) => {
  const { jid, contacts } = req.body;
  if (!jid || !Array.isArray(contacts)) return res.status(400).json({ error: 'jid and contacts array required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const result = await client.sock.sendMessage(jid, { contacts });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send reaction
router.post('/:sessionId/send/reaction', authMiddleware, async (req, res) => {
  const { messageId, reaction } = req.body;
  if (!messageId || !reaction) return res.status(400).json({ error: 'messageId and reaction required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const msgKey = { id: messageId };
    await client.sock.relayMessage(messageId, { reaction: { text: reaction, senderKey: msgKey } }, { messageId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send poll
router.post('/:sessionId/send/poll', authMiddleware, async (req, res) => {
  const { jid, name, values, multipleAnswers } = req.body;
  if (!jid || !name || !Array.isArray(values)) return res.status(400).json({ error: 'jid, name, values required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const result = await client.sock.sendMessage(jid, { poll: { name, values, selectOptions: values.map(v => ({ name: v, selected: false })), multipleAnswers } });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Forward message
router.post('/:sessionId/forward', authMiddleware, async (req, res) => {
  const { messageId, jids } = req.body;
  if (!messageId || !jids) return res.status(400).json({ error: 'messageId and jids required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const msg = await client.sock.fetchMessage(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    for (const jid of jids) {
      await client.sock.relayMessage(jid, msg.message, { messageId });
    }
    res.json({ forwarded: jids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archive chat
router.post('/:sessionId/archive', authMiddleware, async (req, res) => {
  const { jid, archive } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    await client.sock.chatModify(archive ? { archive: [jid] } : { unarchive: [jid] }, jid);
    res.json({ archived: archive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark read
router.post('/:sessionId/read', authMiddleware, async (req, res) => {
  const { messageId, jid } = req.body;
  if (!messageId || !jid) return res.status(400).json({ error: 'messageId and jid required' });
  try {
    const client = BaileysClient.getOrCreate(req.params.sessionId);
    const keys = [{ remoteJid: jid, id: messageId, fromMe: false }];
    await client.sock.readMessages(keys);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get message history
router.get('/:sessionId/messages', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`).all(req.params.sessionId, limit);
  res.json(rows);
});

// Get session stats
router.get('/:sessionId/stats', authMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_messages,
      SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
    FROM messages WHERE session_id = ?
  `).get(req.params.sessionId);
  res.json(stats);
});

module.exports = router;
