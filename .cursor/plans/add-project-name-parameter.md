# Plan: Add Agent Voice System with Multi-Agent Support

## Goal

Add contextual parameters to the notification pipeline so that when multiple Cursor windows and parallel agents are running, you can identify which project, which agent, and what role/model a notification came from — both in the console log and in spoken TTS with distinct voices per agent.

---

## Parameters

| Parameter | Required | Spoken (TTS) | Logged (Console) | Source |
|-----------|----------|--------------|-------------------|--------|
| `type` | Yes | Yes | Yes | Always known |
| `message` | Yes | Yes (spoken after sound) | Yes | Always known |
| `workspaceDir` | No | Yes (project name derived from last path segment) | Yes (shows `[unknown]` if missing) | Workspace Path from `<user_info>` |
| `agentRole` | No | Yes (if provided) | Yes (if provided) | Orchestrator assigns (e.g., "Coder"). Orchestrator uses "Orchestrator" for itself. |
| `agentNumber` | No | Yes (if provided) | Yes (if provided) | Orchestrator = 0, subagents = 1, 2, 3, etc. |
| `voice` | No | N/A (used to select TTS voice) | No | Optional voice override — takes priority over voice maps |
| `role` | No | No | Yes | Orchestrator assigns (e.g., "test-runner") |
| `model` | No | No | Yes | Orchestrator assigns (e.g., "fast") |

### HTTP Query Parameter Names

All parameters are forwarded to the HTTP server as query parameters on `/agent-notify` using camelCase names:

```
GET /agent-notify?type=done&message=Build%20complete&workspaceDir=/Users/user/repos/my-app&agentRole=Coder&agentNumber=2&voice=Daniel&role=test-runner&model=fast
```

| MCP param | HTTP query param | CLI flag |
|-----------|-----------------|----------|
| `type` | `type` | positional arg 1 |
| `message` | `message` | positional arg 2 |
| `workspaceDir` | `workspaceDir` | `--workspace-dir` |
| `agentRole` | `agentRole` | `--agent-role` |
| `agentNumber` | `agentNumber` | `--agent-number` |
| `voice` | `voice` | `--voice` |
| `role` | `role` | `--role` |
| `model` | `model` | `--model` |

---

## TTS Spoken Order & Audio Behavior

The notification sound and TTS speech run **independently and in parallel**. The sound fires immediately, and TTS begins after the existing hardcoded 500ms delay. The sound should not block or delay the spoken message — some notification sounds have long tails, and the agent's spoken message should begin promptly regardless.

**Audio flow (unchanged from current behavior, just with richer TTS content):**
```
Sound:  [▶ notification.mp3 plays immediately, independently] ────────────→
TTS:    [500ms delay] → [prefix + message spoken as one utterance] ──────→
```

**TTS content is a single string passed to `say.speak()`:**

The prefix and message are concatenated into one string. Commas in the string create natural pauses via macOS `say`. The prefix is built from available parameters — parts are omitted when their data isn't provided:

1. **Project name** (derived from `workspaceDir` last path segment — omitted if `workspaceDir` not provided)
2. **Agent role + number** (if provided, e.g., "Coder, Agent 2" — omitted if not provided)
3. **Message type** (e.g., "question", "done", "review" — always included)
4. **Message text** (always included)

**Example concatenated TTS strings:**
- `"my-app, Coder, Agent 2, done, Build complete"` (full)
- `"my-app, done, Build complete"` (solo agent with workspaceDir)
- `"done, Build complete"` (solo agent, no workspaceDir)
- `"Coder, Agent 2, done, Build complete"` (agent info but no workspaceDir)

### TTS Examples (with safe fallbacks)

- **Solo agent (minimal — no workspaceDir):** *"done, Build complete"*
- **Solo agent (with workspaceDir):** *"my-app, done, Build complete"*
- **Orchestrator speaking for itself:** *"my-app, Orchestrator, Agent Zero, done, All tasks complete"*
- **Orchestrator relaying subagent:** *"my-app, Coder, Agent 2, done, Build complete"*
- **Agent with role but no workspaceDir:** *"Coder, Agent 2, done, Build complete"*

---

## Console Log Format

All provided fields shown in brackets. Optional fields omitted when not provided. If `workspaceDir` is missing, display `[unknown]` for the project.

```
Orchestrator speaking for itself:
[my-app] [#0 Orchestrator] [coordinator] [opus] ✅ done: "All tasks complete"

Subagent via orchestrator (full):
[my-app] [#2 Coder] [test-runner] [fast] ✅ done: "Build complete"

Solo agent (with workspaceDir):
[my-app] ✅ done: "Build complete"

Solo agent (no workspaceDir):
[unknown] ✅ done: "Build complete"

Partial (agent but no role/model):
[my-app] [#2 Coder] ✅ done: "Build complete"
```

---

## Voice System

Voice selection uses a triple fallback strategy, implemented as a `selectVoice()` function in `server.mjs`:

1. **Voice override**: If `voice` param is provided, use it directly (highest priority)
2. **Role-based map**: If `agentRole` matches a key in `roleVoiceMap`, use that voice
3. **Index-based map**: If `agentNumber` matches a key in `indexVoiceMap`, use that voice
4. **System default**: Pass `null` to `say.speak()` to use macOS default voice

Voice maps live server-side in `server.mjs` for centralized management.

### Voice Map and Selection Logic:
```javascript
const roleVoiceMap = {
  'Orchestrator': 'Alex',        // Deep, authoritative
  'Coder': 'Daniel',            // British, technical  
  'Reviewer': 'Samantha',       // Clear, analytical
  'Tester': 'Karen'             // Australian, methodical
};

const indexVoiceMap = {
  0: 'Alex',      // Orchestrator default
  1: 'Daniel',    // First subagent
  2: 'Samantha',  // Second subagent
  3: 'Karen'      // Third subagent
};

function selectVoice(agentRole, agentNumber, voiceOverride) {
  if (voiceOverride) return voiceOverride;
  if (agentRole && roleVoiceMap[agentRole]) return roleVoiceMap[agentRole];
  if (agentNumber !== undefined && indexVoiceMap[agentNumber]) return indexVoiceMap[agentNumber];
  return null; // system default
}
```

---

## Agent Zero Convention

When an orchestrator is running multiple subagents:

- The orchestrator identifies itself as `agentRole="Orchestrator"`, `agentNumber=0` → spoken as: "Orchestrator, Agent Zero"
- Subagents are assigned roles and numbers starting from 1 (e.g., `agentRole="Coder"`, `agentNumber=1`) → spoken as: "Coder, Agent 1"

---

## Data Flow

Project name is derived **server-side** from the last segment of `workspaceDir` (e.g., `/Users/user/repos/my-app` → `"my-app"`).

```
Orchestrator speaking for itself:
          ↓
  Calls MCP tool: notify(
    type="done",
    message="All tasks complete",
    workspaceDir="/Users/user/repos/my-app",
    agentRole="Orchestrator",
    agentNumber=0,
    role="coordinator",
    model="opus"
  )
          ↓
  server.mjs derives: project = path.basename(workspaceDir) → "my-app"
  server.mjs selects: voice = selectVoice("Orchestrator", 0, undefined) → "Alex"
          ↓
  server.mjs console: [my-app] [#0 Orchestrator] [coordinator] [opus] ✅ done: "All tasks complete"
          ↓
  Sound: ▶ done.mp3 (plays independently)
  TTS (voice=Alex): "my-app, Orchestrator, Agent Zero, done, All tasks complete"

Subagent via orchestrator:
          ↓
  Calls MCP tool: notify(
    type="done",
    message="Build complete",
    workspaceDir="/Users/user/repos/my-app",
    agentRole="Coder",
    agentNumber=2,
    role="test-runner",
    model="fast"
  )
          ↓
  server.mjs derives: project = path.basename(workspaceDir) → "my-app"
  server.mjs selects: voice = selectVoice("Coder", 2, undefined) → "Daniel"
          ↓
  server.mjs console: [my-app] [#2 Coder] [test-runner] [fast] ✅ done: "Build complete"
          ↓
  Sound: ▶ done.mp3 (plays independently)
  TTS (voice=Daniel): "my-app, Coder, Agent 2, done, Build complete"

Solo agent (with workspaceDir):
          ↓
  Calls MCP tool: notify(
    type="done",
    message="Build complete",
    workspaceDir="/Users/user/repos/my-app"
  )
          ↓
  server.mjs derives: project = path.basename(workspaceDir) → "my-app"
  server.mjs selects: voice = selectVoice(undefined, undefined, undefined) → system default
          ↓
  server.mjs console: [my-app] ✅ done: "Build complete"
          ↓
  Sound: ▶ done.mp3 (plays independently)
  TTS (voice=default): "my-app, done, Build complete"

Solo agent (no workspaceDir):
          ↓
  Calls MCP tool: notify(type="done", message="Build complete")
          ↓
  server.mjs derives: project = "unknown"
  server.mjs selects: voice = system default
          ↓
  server.mjs console: [unknown] ✅ done: "Build complete"
          ↓
  Sound: ▶ done.mp3 (plays independently)
  TTS (voice=default): "done, Build complete"
  (project name omitted from speech since workspaceDir was not provided)
```

---

## Updated MCP Tool Signature

```javascript
mcp_agent-notify_notify({
  type: "status",                           // Required: notification type  
  message: "Processing files...",           // Required: message text
  workspaceDir: "/Users/user/repos/myapp",  // Optional: Workspace Path from <user_info>
  agentRole: "Coder",                      // Optional: orchestrator-assigned role name
  agentNumber: 1,                          // Optional: orchestrator-assigned agent number
  voice: "Daniel",                         // Optional: TTS voice override (bypasses voice maps)
  role: "test-runner",                     // Optional: task role (console log only)
  model: "fast"                            // Optional: model identifier (console log only)
})
```

---

## Execution Order & File Changes

Implement in this order. Each step builds on the previous.

### Step 1. `package-lock.json` — Fix Stale Reference

- [ ] Fix `package-lock.json` reference from `lib/mcp-server.mjs` to `lib/mcp.mjs` (run `npm install` to regenerate)

### Step 2. `lib/server.mjs` — HTTP Server Endpoint

This is the core of the feature. All other files depend on this working correctly.

- [ ] Add `roleVoiceMap` and `indexVoiceMap` constants at module level (see Voice System section above for values)
- [ ] Add `selectVoice(agentRole, agentNumber, voiceOverride)` function (see Voice System section above for implementation)
- [ ] Update `vocalizeText(text, voice)` to accept a voice parameter and pass it to `say.speak(text, voice, null, callback)` (currently passes `null` for voice)
- [ ] Update the `/agent-notify` endpoint:
  - [ ] Extract `workspaceDir`, `agentRole`, `agentNumber`, `voice`, `role`, `model` from `req.query` (in addition to existing `type`, `message`)
  - [ ] **Move console log AFTER validation** (currently it logs before checking required params — fix this)
  - [ ] Derive project name: `const project = workspaceDir ? path.basename(workspaceDir) : 'unknown'`
  - [ ] Validation: only `type` and `message` are required (no change from today)
  - [ ] Build console log prefix with brackets for each provided field:
    - `[project]` always (shows `[unknown]` if workspaceDir missing)
    - `[#agentNumber agentRole]` if agentRole/agentNumber provided
    - `[role]` if provided
    - `[model]` if provided
    - Then: `emoji type: "message"`
  - [ ] Build TTS spoken string with safe fallbacks (concatenated as one string, commas create natural pauses via macOS `say`):
    - If workspaceDir provided: include `"project, "` (otherwise omit — don't say "unknown")
    - If agentRole provided: include `"agentRole, "`
    - If agentNumber provided: include `"Agent agentNumber, "`
    - Always: `"type, "`
    - Always: `"message"`
  - [ ] Call `selectVoice(agentRole, agentNumber, voice)` to resolve the TTS voice
  - [ ] Audio flow unchanged — sound and TTS run independently in parallel via `Promise.all`:
    - Sound: `playSound(soundFile)` — fires immediately
    - TTS: `delay(500)` → `vocalizeText(fullSpokenString, selectedVoice)` — starts after 500ms
    - Sound does NOT block or delay TTS

### Step 3. `lib/mcp.mjs` — MCP Tool Schema + Forwarding

- [ ] Add `workspaceDir` to `inputSchema.properties` as **optional** string with agent-friendly description:
  `"The Workspace Path from <user_info>. Used to identify which project this notification is from. Example: '/Users/user/repos/my-app'"`
- [ ] Add `agentRole` to `inputSchema.properties` as **optional** string:
  `"Agent role name assigned by orchestrator — e.g., 'Coder', 'Reviewer'. The orchestrator itself should use 'Orchestrator'. Solo agents can omit this."`
- [ ] Add `agentNumber` to `inputSchema.properties` as **optional** integer:
  `"Agent number assigned by orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc. Solo agents can omit this."`
- [ ] Add `voice` to `inputSchema.properties` as **optional** string:
  `"Override the TTS voice for this notification. If omitted, the server selects a voice based on agentRole or agentNumber."`
- [ ] Add `role` to `inputSchema.properties` as **optional** string:
  `"Specific task role for logging — e.g., 'test-runner', 'code-reviewer'. Shown in console log only, not spoken."`
- [ ] Add `model` to `inputSchema.properties` as **optional** string:
  `"Model identifier for logging — e.g., 'fast', 'opus'. Shown in console log only, not spoken."`
- [ ] `required` array remains: `["type", "message"]` (workspaceDir is optional — graceful degradation)
- [ ] Extract all params from `request.params.arguments`
- [ ] Build URL with all provided params as query string (encode each value, skip undefined params). Use camelCase param names: `workspaceDir`, `agentRole`, `agentNumber`, `voice`, `role`, `model`
- [ ] Include project and agent info in response text when available

### Step 4. `lib/notify.mjs` — CLI Tool

- [ ] Update argument parsing to support named flags: `notify <type> <message> [--workspace-dir path] [--agent-role name] [--agent-number N] [--voice voice] [--role role] [--model model]`
- [ ] Only first 2 positional arguments are required (type and message)
- [ ] Parse optional flags
- [ ] Map CLI flags to HTTP query param names: `--workspace-dir` → `workspaceDir`, `--agent-role` → `agentRole`, `--agent-number` → `agentNumber`, etc.
- [ ] Append all provided params to the curl URL

### Step 5. `.cursorrules` — Agent Instructions

- [ ] Update all examples to include `workspaceDir` parameter
- [ ] Add instruction: pass `workspaceDir` using the Workspace Path from `<user_info>` (the full path, not just the last segment — the server derives the project name)
- [ ] Add Agent Zero convention: the orchestrator always identifies itself as `agentRole="Orchestrator"`, `agentNumber=0`
- [ ] Add instruction: when orchestrating, assign subagent roles and numbers starting from 1 (e.g., `agentRole="Coder"`, `agentNumber=1`)
- [ ] Add instruction: when orchestrating, pass `role` and `model` if known
- [ ] Document that solo (non-orchestrated) agents only need `type` and `message` (optionally `workspaceDir`)
- [ ] Make clear that all fields beyond `type` and `message` are optional and gracefully degrade

### Step 6. `README.md` — Documentation

- [ ] Update CLI usage section with new parameters and flag syntax
- [ ] Update HTTP API section with all query parameters (camelCase names)
- [ ] Update MCP integration section with full tool schema and parameter descriptions
- [ ] Add section on multi-window / multi-agent workflow support
- [ ] Document console log format, TTS spoken order, and safe fallback behavior
- [ ] Show examples for solo, orchestrated, and partial-info usage
- [ ] Document voice system: role map, index map, override, and fallback chain

---

## Summary of Files to Modify

| Order | File | Change |
|-------|------|--------|
| 1 | `package-lock.json` | Fix stale `lib/mcp-server.mjs` reference → `lib/mcp.mjs` (run `npm install`) |
| 2 | `lib/server.mjs` | Add voice maps + `selectVoice()`, update `vocalizeText()` to accept voice, extract new query params, derive project from `workspaceDir`, build console log with brackets (after validation), build TTS string with safe fallbacks |
| 3 | `lib/mcp.mjs` | Add `workspaceDir`, `agentRole`, `agentNumber`, `voice`, `role`, `model` (all optional) to schema with agent-friendly descriptions; forward all to server as camelCase query params |
| 4 | `lib/notify.mjs` | Accept 2 positional args + optional flags, map to camelCase query params, forward to server |
| 5 | `.cursorrules` | Update examples with `workspaceDir`, add Agent Zero orchestrator naming instructions |
| 6 | `README.md` | Update all documentation: parameters, voice system, console format, TTS fallbacks, Agent Zero examples |
