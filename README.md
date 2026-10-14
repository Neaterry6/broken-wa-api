# BROKEN WA API

Custom WhatsApp API & SDK powered by Baileys — multi-session, buttons, webhooks, automation.

## Quick Start

```bash
# Install
npm install broken-wa-api

# Or from GitHub (private repo)
npm install git+https://github.com/Neaterry6/broken-wa-api.git
```

## Usage in Your Bot

```javascript
const { createClient, pairCode } = require('broken-wa-api');

// Create session
const bot = createClient('my-bot');

// Pair with phone (no QR needed)
const code = await pairCode('2348012345678', 'my-bot');
console.log('Pairing code:', code);

// Connect
await bot.connect();

// Send text
await bot.sendText('2348012345678@s.whatsapp.net', 'Hello!');

// Send button
await bot.sendButton(
  '2348012345678@s.whatsapp.net',
  'Choose:',
  'Pick an option below',
  'BROKEN',
  [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }]
);

// Send interactive (URL, Call, Copy buttons)
await bot.sendInteractive('2348012345678@s.whatsapp.net', {
  text: 'Actions:',
  footer: 'BROKEN WA API',
  interactiveButtons: [
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: 'Open Site', url: 'https://example.com' })
    },
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: 'Reply', id: 'reply' })
    }
  ]
});
```

## Full API

### Messaging
```javascript
await bot.sendText(jid, text, options)
await bot.sendButton(jid, title, body, footer, buttons)
await bot.sendInteractive(jid, { text, footer, interactiveButtons })
await bot.sendMedia(jid, buffer, { caption, mimetype })
await bot.sendLocation(jid, lat, lng, { name, address })
await bot.sendContact(jid, contacts)
await bot.sendReaction(messageId, reaction)
await bot.sendPoll(jid, name, values, { multipleAnswers })
await bot.sendAudio(jid, buffer, { mimetype })
await bot.sendSticker(jid, buffer)
await bot.sendVideo(jid, buffer, { caption })
```

### Groups
```javascript
await bot.createGroup(subject, participants, { description })
await bot.getGroupParticipants(jid)
await bot.addParticipant(groupId, jids)
await bot.removeParticipant(groupId, jids)
await bot.promoteParticipant(groupId, jids)
await bot.demoteParticipant(groupId, jids)
await bot.setGroupSubject(groupId, subject)
await bot.setGroupDescription(groupId, desc)
await bot.leaveGroup(groupId)
await bot.acceptInvite(code)
await bot.revokeInvite(groupId)
```

### Presence
```javascript
await bot.sendPresence('available' | 'unavailable', jid)
await bot.showTyping(jid, durationMs)
```

### Event Listeners
```javascript
bot.sock.ev.on('messages.upsert', async (m) => {
  // Handle incoming messages
});

bot.sock.ev.on('connection.update', (update) => {
  const { connection } = update;
  if (connection === 'open') console.log('Connected!');
});
```

## Multi-Session

```javascript
const bot1 = createClient('bot-1');
const bot2 = createClient('bot-2');

await bot1.connect();
await bot2.connect();

// Both run independently
await bot1.sendText(jid1, 'Hello from Bot 1');
await bot2.sendText(jid2, 'Hello from Bot 2');
```

## As REST API Server

Run as standalone API server:

```bash
# Clone and run
git clone https://github.com/Neaterry6/broken-wa-api.git
cd broken-wa-api
npm install
cp .env.example .env
nano .env  # Set JWT_SECRET
npm start
```

### API Endpoints

```
POST /login                          # { password } → JWT token
GET  /sessions                       # List sessions
POST /sessions                       # Create session
POST /api/sessions/:id/pair-code     # Get pairing code
GET  /api/sessions/:id/send/text     # Send message
POST /api/sessions/:id/send/button   # Send button
POST /api/sessions/:id/send/interactive # Send interactive
GET  /health                         # Health check
```

### Authentication

```bash
# JWT (Admin)
Authorization: Bearer <token>

# API Key (Third-party)
?api_key=bwa_xxxxxxxxx
```

## Deployment

### Railway
```bash
railway init
railway up
railway domain
```

### Docker
```bash
docker-compose up -d
```

### VPS
```bash
git clone <repo>
npm install
pm2 start index.js --name "broken-wa"
```

## License

MIT
