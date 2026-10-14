const { makeWALetter, UseMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, isJidBroadcast, generateForwardMessage, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const Pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const authCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class BaileysClient {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.sock = null;
    this.ws = null;
  }

  static clients = new Map();
  static wss = new Set();

  static getOrCreate(sessionId) {
    if (!BaileysClient.clients.has(sessionId)) {
      BaileysClient.clients.set(sessionId, new BaileysClient(sessionId));
    }
    return BaileysClient.clients.get(sessionId);
  }

  static getAllConnections() {
    return [...BaileysClient.clients.values()].map(c => ({
      id: c.sessionId,
      connected: !!c.sock,
      phone: c.sock?.user?.id?.split(':')[0],
    }));
  }

  static destroy(sessionId) {
    const client = BaileysClient.clients.get(sessionId);
    if (client?.sock) client.sock.end?.();
    BaileysClient.clients.delete(sessionId);
  }

  async connect() {
    const authPath = path.join(__dirname, '../auth', this.sessionId);
    fs.mkdirSync(authPath, { recursive: true });

    const { state, saveCreds } = await UseMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    this.sock = makeWALetter({
      printQRInTerminal: true,
      logger: Pino({ level: 'silent' }),
      auth: state,
      version,
      browser: ['Broken WA API', 'Chrome', '1.0'],
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (qr) {
        qrcode.generate(qr, { small: true });
        console.log(`\n📱 Scan this QR or use pairing code for session: ${this.sessionId}\n`);
      }

      if (connection === 'close') {
        const shouldReconnect = reason !== DisconnectReason.loggedOut && reason !== 403;
        if (shouldReconnect) {
          logger.info({ reason, sessionId: this.sessionId }, 'Reconnecting...');
          setTimeout(() => this.connect(), 2000);
        } else {
          logger.info({ reason, sessionId: this.sessionId }, 'Connection closed (logged out)');
        }
      } else if (connection === 'open') {
        logger.info({ sessionId: this.sessionId, phone: this.sock.user?.id }, 'Connected successfully');
        const phone = this.sock.user?.id?.split(':')[0];
        require('../utils/database').prepare('UPDATE sessions SET status = ?, phone = ? WHERE id = ?').run('connected', phone, this.sessionId);
      }
    });

    // Global WS broadcast helper
    global._wss = BaileysClient.wss;

    return this.sock;
  }

  async pairCode(phone) {
    if (!this.sock) await this.connect();
    const code = await this.sock.requestPairingCode(phone.replace(/\D/g, ''));
    return code;
  }

  async getQR() {
    if (!this.sock) await this.connect();
    // QR is shown in terminal; return status
    return { status: 'qr_available_in_terminal' };
  }

  async sendButton(jid, title, body, footer, buttons) {
    // Quick reply buttons via interactive message
    const interactiveButtons = buttons.map(b => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id || b.text.toLowerCase().replace(/\s/g, '_') }),
    }));
    await this.sendInteractive(jid, { title, text: body, footer, interactiveButtons });
  }

  async sendInteractive(jid, { title, text, footer, interactiveButtons }) {
    // Use relayMessage with native flow interactive message
    const content = generateWAMessageFromContent(jid, {
      interactiveMessage: {
        header: title ? { title, hasMediaAttachment: false } : undefined,
        body: { text },
        footer: { text: footer || '' },
        nativeFlowMessage: {
          buttons: interactiveButtons.map(b => ({
            name: b.name,
            buttonParamsJson: b.buttonParamsJson,
          })),
        },
      },
    }, { userJid: jid });

    await this.sock.relayMessage(jid, content.message, { messageId: content.messageId });
  }
}

module.exports = { BaileysClient };
