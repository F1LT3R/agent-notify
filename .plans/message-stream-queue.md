# Plan: Message Stream Queue + Disk Persistence + Voice Display + Agent Conversations

## Context

Currently, agent-notify is fire-and-forget: notifications arrive, play audio, and vanish. The goal is to:

1. Make every notification visible to other agents via a pullable message stream over MCP
2. Persist the stream to disk across server restarts
3. Show the resolved TTS voice in the console output header
4. Enable real-time agent-to-agent conversations through the notification stream — agents can debate and discuss ideas, each speaking in their own TTS voice, with the user hearing the conversation unfold live

## Files to Modify

- `lib/server.mjs` — message store, HTTP endpoint, disk persistence, console voice display
- `lib/mcp.mjs` — new `get_messages` MCP tool

---

## 1. Message Store + `GET /messages` endpoint (`lib/server.mjs`)

**Add in-memory message store** at the top of the file (near the queue variables):

```js
const messageStore = [];
let messageIdCounter = 0;
const MAX_MESSAGES = 500;
const MESSAGE_STORE_PATH = path.join(__dirname, '..', '.message-store.json');
```

**`storeMessage()` function** — called in both `/notify/agent` and `/notify/app` handlers after validation, before audio enqueue:

```js
function storeMessage(entry) {
  const stored = {
    id: ++messageIdCounter,
    timestamp: new Date().toISOString(),
    ...entry
  };
  messageStore.push(stored);
  if (messageStore.length > MAX_MESSAGES) messageStore.shift();
  return stored;
}
```

**In `/notify/agent` handler** (after validation and voice selection, before enqueue). Include the formatted header string so agents receive the same rich context as the console:

```js
const header = logParts.join(' '); // e.g. "✅ DONE 📂 my-app 🤖 Coder #2 🧠 claude-opus-4-6 🗣️ Nathan"
storeMessage({ source: 'agent', header, type, message, project, agentRole, agentNumber: agentNum, model, voice: selectedVoice });
```

**In `/notify/app` handler** (after validation passes log-level check, before enqueue). Same pattern — include the header:

```js
const header = logParts.join(' '); // e.g. "✅ SUCCESS 📦 webpack"
storeMessage({ source: 'app', header, type, message, app: appName, url });
```

The `header` field gives consuming agents a pre-formatted summary line identical to what appears in the server console. **Note:** ANSI color codes are applied *outside* `logParts.join(' ')` in the `console.log` call (line 358), so the stored header contains clean emoji text with no escape sequences — safe for agents to consume directly. Each message object returned by `GET /messages` will look like:

```json
{
  "id": 12,
  "timestamp": "2026-02-28T...",
  "source": "agent",
  "header": "✅ DONE 📂 my-app 🤖 Coder #2 🧠 claude-opus-4-6 🗣️ Nathan",
  "type": "done",
  "message": "Refactored auth module",
  "project": "my-app",
  "agentRole": "Coder",
  "agentNumber": 2,
  "model": "claude-opus-4-6",
  "voice": "Nathan"
}
```

**New `GET /messages` endpoint** — every stored field is queryable:

```js
app.get('/messages', (req, res) => {
  const sinceId = parseInt(req.query.since_id) || 0;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  let results = messageStore.filter(m => m.id > sinceId);

  // All stored fields are filterable
  const filters = ['type', 'to', 'project', 'source', 'agentRole', 'model', 'voice', 'app'];
  for (const key of filters) {
    if (req.query[key]) results = results.filter(m => m[key] === req.query[key]);
  }
  // agentNumber is numeric — guard against NaN from empty/invalid values
  if (req.query.agentNumber !== undefined) {
    const num = parseInt(req.query.agentNumber, 10);
    if (!isNaN(num)) {
      results = results.filter(m => m.agentNumber === num);
    }
  }

  results = results.slice(-limit);
  res.json({ messages: results, latest_id: messageIdCounter });
});
```

This is the dumb base layer. The system stores everything and lets you query on anything. The operator/agent prompt decides which filters to use.

## 2. Disk Persistence (`lib/server.mjs`)

Add `import fs from 'fs';` at the top of `server.mjs`.

**On startup** — load from `.message-store.json` if it exists, enforce cap:

```js
function loadMessageStore() {
  try {
    const data = fs.readFileSync(MESSAGE_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    messageStore.push(...parsed.messages);
    messageIdCounter = parsed.latestId || 0;
    // Enforce cap after loading (file could have grown from manual edits or bugs)
    while (messageStore.length > MAX_MESSAGES) messageStore.shift();
  } catch { /* file doesn't exist yet, start fresh */ }
}
```

Call `loadMessageStore()` during initialization (before `app.listen()`).

**On shutdown** — save to disk:

```js
function saveMessageStore() {
  try {
    fs.writeFileSync(MESSAGE_STORE_PATH, JSON.stringify({
      messages: messageStore,
      latestId: messageIdCounter
    }));
  } catch (err) {
    console.error('Failed to save message store:', err.message);
  }
}
```

Hook into existing shutdown:
- In the `Ctrl+C` keypress handler (line 218): call `saveMessageStore()` before `process.exit()`
- Add `process.on('SIGTERM', ...)` handler that calls `saveMessageStore()` then exits

**Periodic flush for crash safety** — a `kill -9` or OOM would lose all messages since startup. Add a periodic auto-save every 50 messages to limit data loss:

```js
const FLUSH_INTERVAL = 50; // save to disk every N new messages

// Inside storeMessage(), after pushing:
if (messageStore.length % FLUSH_INTERVAL === 0) {
  saveMessageStore();
}
```

This means at worst you lose the last 49 messages on a hard crash, not all of them.

**Add `.message-store.json` to `.gitignore`** so it doesn't get committed. Create `.gitignore` if it doesn't exist, or append to it.

## 3. Voice Name in Console Output (`lib/server.mjs`)

Currently voice selection happens at line 373, **after** the console log at lines 348-359. Reorder so voice is resolved first. This is safe — all inputs to `selectVoice()` (`agentRole`, `agentNum`, `voice`) are already extracted from `req.query` at line 323, well before the console log block.

Move `selectVoice()` call to before the console log block, then add:

```js
if (selectedVoice) logParts.push(`🗣️ ${selectedVoice}`);
```

After the existing `if (model) logParts.push(...)` line.

Result:
```
✅ DONE 📂 my-app 🤖 Coder #2 🧠 claude-opus-4-6 🗣️ Nathan
```

## 4. New `get_messages` MCP Tool (`lib/mcp.mjs`)

**Register in `ListToolsRequestSchema` handler** — add a second tool:

```js
{
  name: "get_messages",
  description: "Pull recent notifications from the agent-notify message stream. Use since_id to poll incrementally for new messages.",
  inputSchema: {
    type: "object",
    properties: {
      since_id: {
        type: "number",
        description: "Return only messages with id greater than this. Pass 0 for initial fetch, then use latest_id from the response for subsequent polls."
      },
      limit: {
        type: "number",
        description: "Max messages to return (default 50, max 200)"
      },
      type: {
        type: "string",
        description: "Filter by notification type",
        enum: ["question", "permission", "done", "error", "status", "waiting", "review", "message", "debug", "info", "warn", "success"]
      },
      to: {
        type: "string",
        description: "Filter messages directed to this agent role/name"
      },
      project: {
        type: "string",
        description: "Filter by project name (derived from workspaceDir)"
      },
      source: {
        type: "string",
        description: "Filter by message source",
        enum: ["agent", "app"]
      },
      agentRole: {
        type: "string",
        description: "Filter by agent role (e.g., 'Coder', 'Reviewer')"
      },
      agentNumber: {
        type: "number",
        description: "Filter by agent number"
      },
      model: {
        type: "string",
        description: "Filter by model identifier"
      },
      voice: {
        type: "string",
        description: "Filter by TTS voice name"
      },
      app: {
        type: "string",
        description: "Filter by app name (for app notifications)"
      }
    }
  }
}
```

**Handle in `CallToolRequestSchema`** — add an `else if` branch:

```js
if (request.params.name === "get_messages") {
  const args = request.params.arguments || {};
  const params = new URLSearchParams();

  // Pass through all filter params
  const fields = ['since_id', 'limit', 'type', 'to', 'project', 'source', 'agentRole', 'agentNumber', 'model', 'voice', 'app'];
  for (const key of fields) {
    if (args[key] !== undefined) params.set(key, String(args[key]));
  }

  const url = `${BASE_URL}/messages?${params.toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
  };
}
```

Move `BASE_URL` to module scope (currently inside the `notify` handler).

**Also update the existing `notify` handler in `mcp.mjs`** to forward the new `to` param:

```js
if (to !== undefined) params.set('to', to);
```

And add `"message"` to the `notify` tool's type enum (currently only in `get_messages`).

## 5. Agent-to-Agent Conversations (`lib/server.mjs` + `lib/mcp.mjs`)

The existing `notify` tool and new `get_messages` tool are all agents need to have conversations. We add two small things:

### New notification type: `"message"`

Add `"message"` to the valid agent types in `server.mjs`:

```js
const agentSoundMap = {
  ...existing types,
  'message': './sounds/status.mp3'   // subtle, short — conversations can be rapid
};
const agentEmojiMap = {
  ...existing types,
  'message': '💬'
};
const colorMap = {
  ...existing types,
  'message': '\x1b[37m'              // White — neutral, conversational
};
```

Add `"message"` to the `enum` in the MCP tool schema for both `notify` and `get_messages`.

### New `to` field: addressing a message

**In `notify` MCP tool schema** — add optional `to` parameter:

```js
to: {
  type: "string",
  description: "Agent role or name this message is directed to (e.g., 'Reviewer', 'Coder'). Used for agent-to-agent conversations. All agents can still see the message in the stream."
}
```

**In `/notify/agent` handler** — extract `to` from query params, include in console header and stored message:

```js
const { type, message, workspaceDir, agentRole, agentNumber, voice, model, to } = req.query;

// In header construction, after the agent info:
if (to) logParts.push(`→ ${to}`);

// In storeMessage call:
storeMessage({ source: 'agent', header, type, message, project, agentRole, agentNumber: agentNum, model, voice: selectedVoice, to });
```

Console result for a conversation:
```
💬 MESSAGE 📂 my-app 🤖 Coder #1 → Reviewer 🧠 claude-opus-4-6 🗣️ Nathan
"I think we should use a factory pattern here instead of a singleton"

💬 MESSAGE 📂 my-app 🤖 Reviewer #2 → Coder 🧠 claude-opus-4-6 🗣️ Samantha
"Agreed, but consider the memory overhead with high concurrency"
```

The `to` and `project` filters are already defined in the `GET /messages` endpoint (section 1) and the `get_messages` MCP tool schema (section 4).

### How a conversation works

Two agents debate using only `notify` and `get_messages`:

1. **Coder** calls `notify({ type: "message", to: "Reviewer", message: "Should we use Redis or in-memory caching?", agentRole: "Coder", voice: "Nathan" })`
2. **Reviewer** polls `get_messages({ to: "Reviewer" })`, sees the message
3. **Reviewer** calls `notify({ type: "message", to: "Coder", message: "In-memory for now, Redis when we need horizontal scaling", agentRole: "Reviewer", voice: "Samantha" })`
4. **Coder** polls `get_messages({ to: "Coder" })`, sees the response

The user hears Nathan and Samantha debating caching strategy in real time. The console shows the full conversation with emoji headers. The message stream preserves it all.

No new tools, no new protocols — just `notify` to speak and `get_messages` to listen.

## 6. Keyboard Toggle: Mute Conversations (`lib/server.mjs`)

Add a `muteMessages` toggle so the user can switch between hearing everything and only hearing important notifications.

**State variable** (near the queue variables):

```js
let muteMessages = false;
```

**Keyboard handler** — add `M` key in the existing `process.stdin.on('keypress', ...)` block:

```js
if (key && key.name === 'm') {
  muteMessages = !muteMessages;
  console.log(muteMessages ? '\n🔇 Agent messages muted (notifications still active)' : '\n🔊 Agent messages unmuted');
}
```

**In `/notify/agent` handler** — when `muteMessages` is true and `type === 'message'`, skip the audio enqueue but still store in the message store and log to console:

```js
// After console log and storeMessage, before enqueueNotification:
if (muteMessages && type === 'message') {
  return res.json({ success: true, queued: false, reason: 'Agent messages muted' });
}
```

This means:
- **M key** toggles mute on/off
- When muted: `message` type notifications are stored and logged visually but no audio plays
- All other types (done, error, question, permission, status, waiting, review) always play audio
- The console still shows the full conversation — you just don't hear it

**Update the startup banner** to show the new key:

```
⌨️  Keyboard Controls:
   - Press [SPACE] to stop all audio and clear queue
   - Press [S] to skip current notification
   - Press [M] to mute/unmute agent messages
   - Press [Ctrl+C] to exit
```

---

## Verification

1. **Start server**: `npm start`
2. **Send a notification** via MCP `notify` — confirm voice name (🗣️) appears in console header
3. **Call `get_messages`** with `since_id: 0` — confirm the notification appears with `header` field
4. **Incremental poll**: send more notifications, call `get_messages` with the returned `latest_id` — only new messages returned
5. **Disk persistence**: stop server (Ctrl+C) → confirm `.message-store.json` written → restart → `get_messages` returns persisted messages
6. **Type filter**: `get_messages({ type: "error" })` — confirm filtering works
7. **Conversation**: send `notify({ type: "message", to: "Reviewer", agentRole: "Coder" })` — confirm `💬 MESSAGE ... 🤖 Coder → Reviewer 🗣️ Nathan` in console
8. **To filter**: `get_messages({ to: "Reviewer" })` — confirm only messages addressed to Reviewer returned
9. **Mute toggle**: press `M` during a conversation — confirm `message` type stops playing audio but still appears in console and message store. Press `M` again to unmute.
10. **Project filter**: send notifications from two different `workspaceDir` values, then `get_messages({ project: "my-app" })` — confirm only that project's messages returned
