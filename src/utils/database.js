const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './sessions.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'disconnected',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    from_jid TEXT,
    to_jid TEXT,
    message_type TEXT,
    content TEXT,
    direction TEXT CHECK(direction IN ('in','out')),
    status TEXT DEFAULT 'sent',
    timestamp INTEGER,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE,
    name TEXT,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    rate_limit INTEGER DEFAULT 60,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT DEFAULT 'messages.received,messages.sent',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_type TEXT CHECK(trigger_type IN ('keyword','reply','schedule','webhook')),
    trigger_value TEXT NOT NULL,
    action TEXT NOT NULL,
    action_params TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
