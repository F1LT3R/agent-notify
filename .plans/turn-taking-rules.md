# Plan: Update Rules Files with Turn-Taking Protocol

## Context

The playback tracking feature (`playedAt`, `played_id`, message `id` in notify response) has been implemented in `server.mjs` and `mcp.mjs`. But agents don't know about it — the rules files (`.cursorrules` and `CURSOR-RULE-AGENT-NOTIFY.md`) contain no guidance on turn-taking. This is why the debate test failed: the orchestrator fired all 5 messages instantly instead of waiting for each to finish playing.

Two rules files need the same additions:
- `.cursorrules` — used by Cursor AI agents
- `CURSOR-RULE-AGENT-NOTIFY.md` — standalone reference, also usable as a Cursor rule

## Cross-Conversation Isolation

The turn-taking mechanism is **per-message, not per-queue**. Each agent checks `played_id >= my_message_id`, which means:

- Two debates in separate windows interleave in audio but progress independently
- Neither conversation blocks the other
- Each waits only for its own message to finish playing
- If the user presses spacebar (skip all), all queued messages get `playedAt` set immediately — both conversations proceed

This is the correct behavior. No conversation-scoping or session IDs needed.

## Files to Modify

- `.cursorrules` — add turn-taking section to existing "Agent-to-Agent Conversations" area
- `CURSOR-RULE-AGENT-NOTIFY.md` — same additions, mirrored

## Changes

### 1. Document `id` in notify response

Both files describe `notify` parameters but don't mention what comes back. Add a brief note after the parameters table:

```
### Notify Response

The `notify` tool returns an `id` field — the unique message ID in the stream. Use this for playback tracking (see Turn-Taking below).
```

### 2. Document `played_id` and `playedAt` in get_messages

Add to the `get_messages` section, after the "Incremental Polling" example:

```
### Playback Tracking

The `get_messages` response includes:
- `played_id` — the highest message ID whose audio has finished playing
- Each message has a `playedAt` field (null until audio finishes, then an ISO timestamp)

Use these to know when a message has been heard by the user before sending the next one.
```

### 3. Add Turn-Taking Protocol to Agent-to-Agent Conversations

Replace the simple "How It Works" 3-step example in both files with a turn-taking-aware version:

```
### Turn-Taking Protocol

Conversations require waiting for each message to finish playing before sending the next. Without this, messages queue up faster than audio can play and the conversation loses its natural pacing.

**Flow:**

1. **Send** a message with `notify` — note the returned `id`:
   ```
   notify(type="message", to="Reviewer", message="...", ...) → id: 47
   ```

2. **Wait** for audio to finish — poll `get_messages` until `played_id >= 47`:
   ```
   get_messages(since_id=46) → { played_id: 46 }  # still playing
   get_messages(since_id=46) → { played_id: 47 }  # done — send next turn
   ```

3. **Send the next turn** only after the previous message has been played.

**Important:** Each agent waits for its own message's `id`, not for the queue to be empty. This means multiple conversations (e.g., two debates in separate windows) can run simultaneously without blocking each other — they interleave in audio output but each progresses at its own pace.

**When the user skips audio** (spacebar or skip key), all queued messages get `playedAt` set immediately, so agents proceed without getting stuck.
```

### 4. Keep the existing Key Points

The existing "Key Points" bullets about `to` being a hint, voice differentiation, `[M]` mute key, and `type="message"` usage are all still correct and should be preserved.

---

## Verification

1. Read both updated files and confirm the turn-taking protocol is documented
2. Confirm the existing content (parameters, examples, orchestrator conventions) is preserved
3. Run the sovereignty debate again with the orchestrator following the documented protocol: send message → poll played_id → send next message
