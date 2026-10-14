const { BaileysClient } = require('./clients/baileys');
const { validateApiKey, verifyToken } = require('./utils/auth');
const db = require('./utils/database');
const logger = require('./utils/logger');
const NodeCache = require('node-cache');

const rateLimitCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

// --- Rate limiting middleware ---
function rateLimitMiddleware(req, res, next) {
  const sessionId = req.params.sessionId || req.query.session_id || 'unknown';
  const key = `${sessionId}:${req.ip || '127.0.0.1'}`;
  const limit = req.apiSession?.rate_limit || 60;
  const count = rateLimitCache.get(key) || 0;
  if (count >= limit) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  rateLimitCache.set(key, count + 1);
  next();
}

// --- Connect events to DB ---
function logConnectionEvent(sock, sessionId) {
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    let status = 'connected';
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === 403) status = 'logged_out';
      else if (statusCode === 440) status = 'reconnecting';
      else status = 'disconnected';
    } else if (connection === 'open') {
      status = 'connected';
    }
    db.prepare('UPDATE sessions SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(status, sessionId);
    logger.info({ sessionId, status }, 'connection.update');
  });

  sock.ev.on('creds.update', () => {
    db.prepare('UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
  });
}

// --- Message handler ---
async function handleIncomingMessage(sock, sessionId, msg) {
  try {
    const m = msg.messages[0];
    if (!m) return;

    const fromJid = m.key.remoteJid;
    const fromMe = m.key.fromMe;
    const messageType = Object.keys(m.message || {})[0] || 'conversation';
    const content = m.message?.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption ||
      m.message?.audioMessage?.seconds ||
      '' || '';
    const quotedId = m.message?.[messageType]?.contextInfo?.stanzaId;

    // Store message
    db.prepare(`INSERT OR IGNORE INTO messages (id, session_id, from_jid, to_jid, message_type, content, direction, status, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`).run(
      m.key.id, sessionId, fromJid, m.key.participant, messageType, content.slice(0, 1000),
      fromMe ? 'out' : 'in', Math.floor(Date.now() / 1000)
    );

    // Forward to webhooks
    const webhooks = db.prepare('SELECT * FROM webhooks WHERE session_id = ? AND active = 1').all(sessionId);
    for (const wh of webhooks) {
      const shouldFire = wh.events.split(',').some(e => e.trim() === 'messages.received' && !fromMe);
      if (!shouldFire) continue;
      try {
        const https = require('https');
        const data = JSON.stringify({ event: 'messages.received', session: sessionId, message: { ...m.key, content: content.slice(0, 500) } });
        const url = new URL(wh.url);
        const req2 = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': wh.secret || '', 'User-Agent': 'BrokenWA-API/1.0' } }, (resp) => {
          // Fire and forget
        });
        req2.on('error', () => {});
        req2.write(data);
        req2.end();
      } catch {}
    }
  } catch (err) {
    logger.error({ err: err.message }, 'handleIncomingMessage error');
  }
}

// --- Setup ---
function setupServer(app) {
  // Routes
  // Mount paths must NOT repeat a prefix the router already carries.
  // admin is deliberately bare: the README documents POST /login and GET /sessions.
  app.use(require('./api/admin'));
  // messages carries /:sessionId/send/... internally -> /api/sessions/:id/send/text
  app.use('/api/sessions', require('./api/messages'));
  // webhooks carries /groups/... and /:sessionId/presence internally
  app.use('/api', require('./api/webhooks'));
  // sessions carries /sessions and /owner/... internally -> /api/sessions, /api/owner/init
  app.use('/api', require('./api/sessions'));

  // WebSocket for live events
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server: app, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const token = req.url.split('token=')[1];
    if (!token) { ws.close(); return; }
    const payload = verifyToken(token);
    if (!payload) { ws.close(); return; }
    ws.payload = payload;
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'subscribe' && msg.sessionId) {
          ws.sessionId = msg.sessionId;
          ws.send(JSON.stringify({ type: 'subscribed', sessionId: msg.sessionId }));
        }
      } catch {}
    });
    ws.on('close', () => { /* cleanup */ });
  });

  // Health check
  app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // The startup banner advertises these, so they must actually exist.
  app.get('/', (_, res) => res.json({
    name: 'BROKEN WA API',
    status: 'ok',
    docs: '/api/docs',
    health: '/health',
  }));

  app.get('/api/docs', (_, res) => res.json({
    name: 'BROKEN WA API',
    description: 'WhatsApp API and SDK powered by Baileys.',
    auth: 'Send Authorization=[REDACTED] <token> or ?api_key=<key> on protected routes.',
    endpoints: {
      health: 'GET /health',
      admin: {
        login: 'POST /login',
        listSessions: 'GET /sessions',
        createSession: 'POST /sessions',
        pairCode: 'POST /sessions/:id/pair-code',
        apiKeys: 'POST /sessions/:id/api-keys',
      },
      sessions: {
        ownerInit: 'GET /api/owner/init',
        list: 'GET /api/sessions',
        get: 'GET /api/sessions/:id',
        remove: 'DELETE /api/sessions/:id',
      },
      messages: {
        sendText: 'POST /api/sessions/:sessionId/send/text',
        sendButton: 'POST /api/sessions/:sessionId/send/button',
        sendInteractive: 'POST /api/sessions/:sessionId/send/interactive',
        sendMedia: 'POST /api/sessions/:sessionId/send/media',
        sendLocation: 'POST /api/sessions/:sessionId/send/location',
        sendContact: 'POST /api/sessions/:sessionId/send/contact',
        sendReaction: 'POST /api/sessions/:sessionId/send/reaction',
        sendPoll: 'POST /api/sessions/:sessionId/send/poll',
        forward: 'POST /api/sessions/:sessionId/forward',
        archive: 'POST /api/sessions/:sessionId/archive',
        markRead: 'POST /api/sessions/:sessionId/read',
        history: 'GET /api/sessions/:sessionId/messages',
        stats: 'GET /api/sessions/:sessionId/stats',
      },
      groups: {
        create: 'POST /api/groups/create',
        list: 'GET /api/groups/list',
      },
      presence: {
        presence: 'POST /api/:sessionId/presence',
        typing: 'POST /api/:sessionId/typing',
      },
      scrape: {
        npmSearch: 'GET /api/scrape/npm/search?q=',
        spotifySearch: 'GET /api/scrape/spotify/search?q=',
        pinterestSearch: 'GET /api/scrape/pinterest/search?q=',
        youtubeSearch: 'GET /api/scrape/youtube/search?q=',
        webScrape: 'POST /api/scrape/web/scrape',
      },
    },
  }));
}

function connectSocket(sock, sessionId) {
  logConnectionEvent(sock, sessionId);

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    // Emit to WebSocket subscribers
    const subscribers = [...global._wss?.values() || []];
    for (const ws of subscribers) {
      if (ws.sessionId === sessionId && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'message', sessionId, data: m.messages[0] })); } catch {}
      }
    }
    handleIncomingMessage(sock, sessionId, m);
  });

  sock.ev.on('groups.upsert', () => {
    // emit group events
    const subscribers = [...global._wss?.values() || []];
    for (const ws of subscribers) {
      if (ws.sessionId === sessionId && ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'groups.updated', sessionId })); } catch {}
      }
    }
  });

  return sock;
}

module.exports = { setupServer, connectSocket };
