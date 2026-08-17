/**
 * BROKEN WA API — WhatsApp Client SDK
 * 
 * Import into your bot project:
 *   const { BROKENWA } = require('broken-wa-api');
 * 
 * Or with destructuring:
 *   const { createClient, sendButton, sendInteractive } = require('broken-wa-api');
 */

const { BaileysClient } = require('./src/clients/baileys');
const { authMiddleware, ownerAuth, createApiKey, generateToken, validateApiKey } = require('./src/utils/auth');
const db = require('./src/utils/database');

// --- SDK exports for bot integration ---
class BROKENWA {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.client = BaileysClient.getOrCreate(sessionId);
    this.config = {
      autoReconnect: options.autoReconnect !== false,
      logger: options.logger || 'silent',
      ...options,
    };
  }

  /** Connect and return the Baileys socket */
  async connect() {
    return this.client.connect();
  }

  /** Get the underlying Baileys socket */
  get sock() {
    return this.client.sock;
  }

  // --- Sending ---
  async sendText(jid, text, options = {}) {
    return this.client.sock.sendMessage(jid, { text, ...options });
  }

  async sendButton(jid, title, body, footer, buttons) {
    return this.client.sendButton(jid, title, body, footer, buttons);
  }

  async sendInteractive(jid, content) {
    return this.client.sendInteractive(jid, content);
  }

  async sendMedia(jid, media, options = {}) {
    const { caption, mimetype } = options;
    return this.client.sock.sendMessage(jid, { image: media, caption, mimetype });
  }

  async sendLocation(jid, latitude, longitude, options = {}) {
    const { name, address } = options;
    return this.client.sock.sendMessage(jid, { location: { degreesLatitude: latitude, degreesLongitude: longitude, name, address } });
  }

  async sendContact(jid, contacts) {
    return this.client.sock.sendMessage(jid, { contacts });
  }

  async sendReaction(messageId, reaction) {
    await this.client.sock.relayMessage(messageId, { reaction: { text: reaction, senderKey: { id: messageId } } }, { messageId });
  }

  async sendPoll(jid, name, values, options = {}) {
    const { multipleAnswers } = options;
    return this.client.sock.sendMessage(jid, { poll: { name, values, selectOptions: values.map(v => ({ name: v })), multipleAnswers } });
  }

  async sendAudio(jid, audioBuffer, options = {}) {
    const { mimetype = 'audio/ogg; codecs=opus' } = options;
    return this.client.sock.sendMessage(jid, { audio: audioBuffer, mimetype, ptt: false });
  }

  async sendSticker(jid, buffer) {
    return this.client.sock.sendMessage(jid, { sticker: buffer, mimetype: 'image/webp' });
  }

  async sendVideo(jid, videoBuffer, options = {}) {
    const { caption, mimetype = 'video/mp4' } = options;
    return this.client.sock.sendMessage(jid, { video: videoBuffer, caption, mimetype });
  }

  // --- Group operations ---
  async createGroup(subject, participants, options = {}) {
    const result = await this.client.sock.groupCreate(subject, participants);
    if (options.description) await this.client.sock.groupUpdateDescription(result.gid, options.description);
    return result;
  }

  async getGroupParticipants(jid) {
    const meta = await this.client.sock.groupMetadata(jid);
    return meta.participants;
  }

  async addParticipant(groupId, participantJids) {
    return this.client.sock.groupParticipantsUpdate(groupId, participantJids, 'add');
  }

  async removeParticipant(groupId, participantJids) {
    return this.client.sock.groupParticipantsUpdate(groupId, participantJids, 'remove');
  }

  async promoteParticipant(groupId, participantJids) {
    return this.client.sock.groupParticipantsUpdate(groupId, participantJids, 'promote');
  }

  async demoteParticipant(groupId, participantJids) {
    return this.client.sock.groupParticipantsUpdate(groupId, participantJids, 'demote');
  }

  async setGroupSubject(groupId, subject) {
    return this.client.sock.groupUpdateSubject(groupId, subject);
  }

  async setGroupDescription(groupId, description) {
    return this.client.sock.groupUpdateDescription(groupId, description);
  }

  // --- Presence ---
  async sendPresence(presence, jid) {
    await this.client.sock.sendPresenceUpdate(presence, jid);
  }

  async showTyping(jid, durationMs = 5000) {
    await this.client.sock.sendPresenceUpdate('composing', jid);
    setTimeout(() => this.client.sock.sendPresenceUpdate('paused', jid), durationMs);
  }

  // --- Utilities ---
  async downloadMedia(message) {
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    const type = Object.keys(message.message || {})[0];
    const stream = await downloadContentFromMessage(message.message[type], type.replace('Message', ''));
    const buffer = Buffer.from([]);
    for await (const chunk of stream) buffer.push(chunk);
    return buffer;
  }

  async fetchProfilePicture(jid) {
    try {
      return await this.client.sock.profilePictureUrl(jid, 'image');
    } catch {
      return null;
    }
  }

  async leaveGroup(groupId) {
    return this.client.sock.groupLeave(groupId);
  }

  async acceptInvite(code) {
    return this.client.sock.groupAcceptInvite(code);
  }

  async revokeInvite(groupId) {
    return this.client.sock.groupRevokeInvite(groupId);
  }

  async disconnect() {
    this.client.sock?.end?.();
    BaileysClient.clients.delete(this.sessionId);
  }
}

// --- Factory ---
function createClient(sessionId, options = {}) {
  return new BROKENWA(sessionId, options);
}

// --- Helpers for quick usage ---
async function pairCode(phone, sessionId) {
  const client = BaileysClient.getOrCreate(sessionId || 'default');
  return await client.pairCode(phone);
}

async function connectSession(sessionId, options = {}) {
  const client = BaileysClient.getOrCreate(sessionId);
  await client.connect();
  return client.sock;
}

// --- Module exports ---
module.exports = {
  // Main SDK class
  BROKENWA,
  createClient,
  
  // Helpers
  pairCode,
  connectSession,
  
  // Auth utilities (for API servers)
  authMiddleware,
  ownerAuth,
  createApiKey,
  generateToken,
  validateApiKey,
  
  // Database (for advanced usage)
  db,
  
  // BaileysClient directly
  BaileysClient,
};

// Also export as default
module.exports.default = module.exports;
