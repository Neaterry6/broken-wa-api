# BROKEN WA API

Custom WhatsApp API built on Baileys — multi-session, buttons, webhooks, automation.

## Features

- **Multi-session**: Run multiple WhatsApp accounts simultaneously
- **Button messages**: Quick reply, URL, call, copy buttons
- **Full send support**: Text, media (images/video/audio/docs), locations, contacts, polls, reactions
- **Webhooks**: Real-time event forwarding to your server
- **Automation engine**: Keyword triggers, scheduled messages, auto-replies
- **WebSocket live stream**: Real-time message delivery
- **Group management**: Create groups, fetch participants, manage settings
- **Presence & typing**: Send typing indicators, online status
- **Rate limiting**: Per-API-key rate limiting built in
- **SQLite persistence**: All data stored locally

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd broken-wa-api
npm install

# Copy and edit env
cp .env.example .env
nano .env  # Set your JWT_SECRET

# Run
npm start

# Or with Docker
docker-compose up -d
```

## API Endpoints

### Auth
```
POST /login                    # { password: "owner" } → returns JWT token
GET  /health                   # Health check
```

### Sessions
```
GET    /sessions               # List all sessions
POST   /sessions               # Create session (requires auth)
GET    /sessions/:id           # Session details
DELETE /sessions/:id           # Delete session
POST   /sessions/:id/pair-code # Pair via phone number
GET    /sessions/:id/qr        # Get QR code
GET    /connections            # All active connections
```

### Messages (per session)
```
POST /api/sessions/:id/send/text        # { jid, text, quotedMessageId? }
POST /api/sessions/:id/send/button      # { jid, body, buttons: [{id,text}] }
POST /api/sessions/:id/send/interactive # Native flow buttons (URL, call, list)
POST /api/sessions/:id/send/media       # { jid, media: base64, caption?, mimetype? }
POST /api/sessions/:id/send/location    # { jid, latitude, longitude, name?, address? }
POST /api/sessions/:id/send/contact     # { jid, contacts: [...] }
POST /api/sessions/:id/send/reaction    # { messageId, reaction }
POST /api/sessions/:id/send/poll        # { jid, name, values: [...], multipleAnswers? }
POST /api/sessions/:id/archive          # { jid, archive: bool }
POST /api/sessions/:id/read             # { jid, messageId }
GET  /api/sessions/:id/messages         # Message history
GET  /api/sessions/:id/stats            # Send/receive counts
```

### Admin (requires JWT)
```
POST /admin/login                     # { password } → JWT
GET  /admin/sessions                  # List sessions
POST /admin/sessions                  # Create session
DELETE /admin/sessions/:id            # Delete session
POST /admin/sessions/:id/api-keys     # Generate API key
GET  /admin/api-keys                  # List API keys
PATCH /admin/api-keys/:id/toggle      # Enable/disable key
GET  /admin/webhooks                  # List webhooks
POST /admin/webhooks                  # Create webhook
DELETE /admin/webhooks/:id            # Delete webhook
GET  /admin/automations               # List automations
POST /admin/automations               # Create automation
PATCH /admin/automations/:id/toggle   # Enable/disable
GET  /admin/stats                     # Usage stats
POST /admin/webhooks/test             # Test webhook
```

### Webhooks & Automation
```
GET  /webhooks                        # List webhooks
POST /webhooks                        # Create webhook
DELETE /webhooks/:id                  # Delete webhook
GET  /automations                     # List automations
POST /automations                     # Create automation
DELETE /automations/:id               # Delete automation
```

## Authentication

Two methods:
1. **JWT Token** (Admin panel): `Authorization: Bearer <token>`
2. **API Key** (Third-party access): Query param `?api_key=bwa_xxx...`

API keys are scoped per session with independent rate limits.

## Button Examples

### Quick Reply Buttons
```json
POST /api/sessions/:id/send/button
{
  "jid": "2348012345678@s.whatsapp.net",
  "body": "Choose an option:",
  "footer": "BROKEN WA API",
  "buttons": [
    { "id": "yes", "text": "Yes" },
    { "id": "no", "text": "No" },
    { "id": "maybe", "text": "Maybe" }
  ]
}
```

### Native Flow Buttons (URL, Call, Copy)
```json
POST /api/sessions/:id/send/interactive
{
  "jid": "2348012345678@s.whatsapp.net",
  "text": "Choose an action:",
  "footer": "Powered by BROKEN",
  "interactiveButtons": [
    {
      "name": "cta_url",
      "buttonParamsJson": "{\"display_text\":\"Visit Site\",\"url\":\"https://example.com\"}"
    },
    {
      "name": "cta_call",
      "buttonParamsJson": "{\"display_text\":\"Call Support\",\"phone_number\":\"+1234567890\"}"
    },
    {
      "name": "cta_copy",
      "buttonParamsJson": "{\"display_text\":\"Copy Code\",\"copy_code\":\"ABC123\"}"
    },
    {
      "name": "quick_reply",
      "buttonParamsJson": "{\"display_text\":\"Option A\",\"id\":\"opt_a\"}"
    }
  ]
}
```

### List Menu (Single Select)
```json
POST /api/sessions/:id/send/interactive
{
  "jid": "2348012345678@s.whatsapp.net",
  "text": "Select a plan:",
  "footer": "BROKEN WA API",
  "interactiveButtons": [
    {
      "name": "single_select",
      "buttonParamsJson": "{\"title\":\"Choose Plan\",\"sections\":[{\"title\":\"Plans\",\"rows\":[{\"id\":\"free\",\"title\":\"Free\",\"description\":\"Basic features\"},{\"id\":\"pro\",\"title\":\"Pro\",\"description\":\"All features\"}]}]}"
    }
  ]
}
```

## Webhook Events

Subscribed events:
- `messages.received` — Incoming messages
- `messages.sent` — Outgoing message sent
- `messages.updated` — Message status changed
- `groups.updated` — Group metadata changed
- `connection.update` — Connection state changed

Webhook payload:
```json
{
  "event": "messages.received",
  "session": "<session-id>",
  "timestamp": 1234567890,
  "data": { ... }
}
```

## Automation Triggers

- `keyword` — Match text against pattern, trigger action
- `reply` — Auto-reply to specific quoted messages
- `schedule` — Run at cron intervals
- `webhook` — Trigger when external webhook fires

Actions:
- `send_message` — Send text to JID
- `send_button` — Send button message
- `send_media` — Send media file
- `send_location` — Send location
- `webhook_call` — Call external endpoint
- `sql_query` — Run database query

## Deployment Options

### Railway (Recommended)
1. Connect GitHub repo to Railway
2. Set env vars: `PORT=3000`, `JWT_SECRET=your-secret`
3. Deploy → Railway gives you a live URL
4. Use the URL as your webhook endpoint

### Docker
```bash
docker-compose up -d
# Access at http://localhost:3000
```

### VPS
```bash
git clone <repo>
cd broken-wa-api
npm install
pm2 start index.js --name "broken-wa"
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Your App      │────▶│  BROKEN WA API   │────▶│ WhatsApp     │
│  (third-party)  │◀────│  (Express +      │◀────│  Backend     │
│                 │     │   Baileys)       │     │  (Meta)      │
└─────────────────┘     └──────────────────┘     └─────────────┘
                                 │
                                 ▼
                          ┌──────────────────┐
                          │   Webhook        │
                          │   Forwarding     │
                          └──────────────────┘
                                 │
                                 ▼
                          ┌──────────────────┐
                          │  Your Server     │
                          │  (receiver)      │
                          └──────────────────┘
```

## License

MIT
