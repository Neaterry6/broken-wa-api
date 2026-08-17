# Example: Using BROKEN WA API in your own bot

## Installation
```bash
npm install broken-wa-api
```

## Basic Usage

```javascript
const { createClient, pairCode } = require('broken-wa-api');

// Create a new session
const bot = createClient('my-bot');

// Pair with phone number (no QR needed)
const code = await pairCode('2348012345678', 'my-bot');
console.log('Pairing code:', code);

// Wait for connection...
await bot.connect();

// Send a text message
await bot.sendText('2348012345678@s.whatsapp.net', 'Hello from BROKEN!');

// Send a button message
await bot.sendButton(
  '2348012345678@s.whatsapp.net',
  'Choose an option',
  'What is your favorite color?',
  'BROKEN WA API',
  [
    { id: 'red', text: 'Red' },
    { id: 'blue', text: 'Blue' },
    { id: 'green', text: 'Green' }
  ]
);

// Send an interactive message (URL, Call, Copy buttons)
await bot.sendInteractive('2348012345678@s.whatsapp.net', {
  text: 'Choose an action:',
  footer: 'BROKEN WA API',
  interactiveButtons: [
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: 'Open Website', url: 'https://example.com' })
    },
    {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({ display_text: 'Call Support', phone_number: '+1234567890' })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: 'Yes', id: 'yes' })
    }
  ]
});

// Listen for incoming messages
bot.sock.ev.on('messages.upsert', async (m) => {
  if (m.type !== 'notify') return;
  const msg = m.messages[0];
  const text = msg.message?.conversation || '';
  const jid = msg.key.remoteJid;
  
  console.log(`Received: ${text} from ${jid}`);
  
  // Reply with button
  await bot.sendButton(jid, '', text, '', [
    { id: 'thanks', text: 'Thanks!' }
  ]);
});
```

## Advanced: Multiple Sessions

```javascript
const { createClient } = require('broken-wa-api');

// Session 1
const bot1 = createClient('bot-1');
await bot1.connect();

// Session 2
const bot2 = createClient('bot-2');
await bot2.connect();

// Both bots run independently
await bot1.sendText('2348012345678@s.whatsapp.net', 'Hello from Bot 1');
await bot2.sendText('2348012345678@s.whatsapp.net', 'Hello from Bot 2');
```

## Full SDK Methods

```javascript
const bot = createClient('my-bot');
await bot.connect();

// Messaging
await bot.sendText(jid, text, options)
await bot.sendButton(jid, title, body, footer, buttons)
await bot.sendInteractive(jid, { text, footer, interactiveButtons })
await bot.sendMedia(jid, buffer, { caption, mimetype })
await bot.sendLocation(jid, lat, lng, { name, address })
await bot.sendContact(jid, [{ displayName, vcard }])
await bot.sendReaction(messageId, reactionEmoji)
await bot.sendPoll(jid, name, ['option1', 'option2'], { multipleAnswers: true })
await bot.sendAudio(jid, buffer, { mimetype })
await bot.sendSticker(jid, buffer)
await bot.sendVideo(jid, buffer, { caption })

// Groups
await bot.createGroup('Group Name', ['2348012345678@s.whatsapp.net'], { description: 'Welcome' })
await bot.getGroupParticipants(groupId)
await bot.addParticipant(groupId, ['jid'])
await bot.removeParticipant(groupId, ['jid'])
await bot.promoteParticipant(groupId, ['jid'])
await bot.demoteParticipant(groupId, ['jid'])
await bot.setGroupSubject(groupId, 'New Subject')
await bot.setGroupDescription(groupId, 'New Description')
await bot.leaveGroup(groupId)
await bot.acceptInvite('abc123')
await bot.revokeInvite(groupId)

// Presence
await bot.sendPresence('available', jid)
await bot.showTyping(jid, 5000)

// Utilities
await bot.downloadMedia(message)
await bot.fetchProfilePicture(jid)
await bot.disconnect()
```

## Using as an Express Middleware

```javascript
const express = require('express');
const { authMiddleware, createClient } = require('broken-wa-api');

const app = express();

// Use the auth middleware for protected routes
app.post('/send', authMiddleware, async (req, res) => {
  const bot = createClient(req.sessionId);
  await bot.connect();
  await bot.sendText(req.body.jid, req.body.text);
  res.json({ ok: true });
});
```

## Listening for Events

```javascript
const bot = createClient('my-bot');
await bot.connect();

// Connection updates
bot.sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update;
  if (connection === 'open') console.log('Connected!');
  if (connection === 'close') console.log('Disconnected:', lastDisconnect?.error?.output?.statusCode);
});

// Credentials update
bot.sock.ev.on('creds.update', () => {
  // Auth state saved automatically
});

// Incoming messages
bot.sock.ev.on('messages.upsert', async (m) => {
  // Handle message
});

// Group updates
bot.sock.ev.on('groups.update', (updates) => {
  // Handle group changes
});

// Participants updates
bot.sock.ev.on('participant.update', (update) => {
  // Handle member changes
});
```
