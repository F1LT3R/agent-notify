# Plan: Playback Tracking — `playedAt` timestamps and `played_id`

## Context

During the agent debate test, all 11 messages were sent faster than TTS could play them, so the audio queue backed up and the conversation lost its natural pacing. Agents need a way to know when a message has finished playing so they can wait for their turn before speaking.

The approach: track playback completion on each stored message and expose it via the existing `GET /messages` and `get_messages` MCP tool. No long-lived HTTP connections, no timeout risk.

## Files to Modify

- `lib/server.mjs` — playback tracking in store + queue, `played_id` in response
- `lib/mcp.mjs` — surface message `id` in notify response

---

## 1. Add `playedAt` to stored messages (`lib/server.mjs`)

**In `storeMessage()`** — add `playedAt: null` to each stored message:

```js
const stored = {
  id: ++messageIdCounter,
  timestamp: new Date().toISOString(),
  playedAt: null,
  ...entry
};
```

**Add `playbackResolvers` Map** near the message store variables — maps message IDs to resolver functions for future use:

```js
const playbackResolvers = new Map();
```

**New `markPlayed(messageId)` function** — sets `playedAt` and resolves any waiting promise:

```js
function markPlayed(messageId) {
  const msg = messageStore.find(m => m.id === messageId);
  if (msg) msg.playedAt = new Date().toISOString();
  const resolve = playbackResolvers.get(messageId);
  if (resolve) {
    resolve();
    playbackResolvers.delete(messageId);
  }
}
```

## 2. Thread message ID through the notification queue (`lib/server.mjs`)

**In `enqueueNotification()`** — no signature change needed. The caller passes `messageId` as a property on the notification object.

**In `processQueue()`** — after `await Promise.all(tasks)` (audio finished), call `markPlayed`:

```js
// After the try/catch block, before processQueue() recursive call:
if (notification.messageId) markPlayed(notification.messageId);
```

## 3. Update `/notify/agent` handler (`lib/server.mjs`)

**Capture the return value from `storeMessage()`** and pass its `id` to `enqueueNotification`:

```js
const stored = storeMessage({ source: 'agent', header, type, message, ... });

// In enqueue call, add messageId:
const position = enqueueNotification({
  soundFile,
  spokenText,
  voice: selectedVoice,
  messageId: stored.id
});
```

**Return `id` in the HTTP response** so the MCP tool can surface it:

```js
res.json({ success: true, queued: true, position, id: stored.id });
```

**Muted path** — mark as played immediately (no audio to wait for):

```js
if (muteMessages && type === 'message') {
  markPlayed(stored.id);
  return res.json({ success: true, queued: false, reason: 'Agent messages muted', id: stored.id });
}
```

## 4. Update `/notify/app` handler (`lib/server.mjs`)

Same pattern — capture `stored` from `storeMessage()`, pass `messageId` to `enqueueNotification`, return `id` in response. For filtered (below threshold) app notifications that skip audio, mark played immediately.

## 5. Handle `stopAllAudio()` — mark cleared queue items as played (`lib/server.mjs`)

When the user presses spacebar, all queued notifications are discarded. Mark them all as played so no agent gets stuck waiting:

```js
// In stopAllAudio(), before clearing the queue:
for (const n of notificationQueue) {
  if (n.messageId) markPlayed(n.messageId);
}
notificationQueue.length = 0;
```

## 6. Add `played_id` to `GET /messages` response (`lib/server.mjs`)

Compute the highest message ID that has `playedAt` set. Scan from the end for efficiency:

```js
let playedId = 0;
for (let i = messageStore.length - 1; i >= 0; i--) {
  if (messageStore[i].playedAt) {
    playedId = messageStore[i].id;
    break;
  }
}

res.json({ messages: results, latest_id: messageIdCounter, played_id: playedId });
```

Each message in the `messages` array already includes its `playedAt` field (null or ISO timestamp), so agents can check individual messages too.

## 7. Surface message `id` in MCP notify response (`lib/mcp.mjs`)

Include the returned `id` in the MCP response text so agents know which message to track:

```js
const data = await response.json();
text: `${parts.join(' ')}: "${message}" (id: ${data.id})`
```

The `get_messages` handler already returns the full server JSON, which now includes `played_id`. No changes needed there.

## 8. Disk persistence — no changes needed

`playedAt` is part of the stored message objects that `saveMessageStore()` already writes. On reload, `playedAt` values are preserved.

---

## Agent Conversation Flow (After Implementation)

```
1. Orchestrator: notify(type="message", ...) → gets back id: 47
2. Orchestrator: polls get_messages(since_id=46) → played_id: 46 (not yet)
3. Orchestrator: polls get_messages(since_id=46) → played_id: 47 (audio done)
4. Orchestrator: sends next agent's turn
```

---

## Verification

1. **Start server**: `npm start`
2. **Send a notification**: confirm response now includes `id` field
3. **Check `get_messages`**: confirm response includes `played_id` and messages have `playedAt: null`
4. **Wait for audio to finish**: poll `get_messages` again — confirm `playedAt` is now set and `played_id` updated
5. **Muted messages**: toggle mute with `[M]`, send a `type="message"` — confirm `playedAt` is set immediately
6. **Stop all audio** (spacebar): confirm cleared queue messages get `playedAt` set (not stuck at null)
7. **Disk persistence**: stop server, restart, confirm `playedAt` values survived
