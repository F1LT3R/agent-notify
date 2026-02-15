<p align="center">
  <img src="logo.png" alt="Agent Notify" width="600">
</p>

<p align="center">
  A macOS notification system designed for AI agents and applications, featuring audio notifications, text-to-speech with distinct voices per agent, a sequential notification queue, and MCP (Model Context Protocol) integration. Supports multi-window and multi-agent workflows with project identification and voice differentiation.
</p>

## 📑 Table of Contents

- [✨ Features](#features)
- [🏗️ Architecture](#architecture)
- [🔔 Notification Types](#notification-types)
- [📥 Installation](#installation)
- [🚀 Usage](#usage)
  - [💻 Command Line Interface](#command-line-interface)
  - [🔌 MCP Integration (Cursor AI)](#mcp-integration-cursor-ai)
  - [🌐 HTTP API](#http-api)
  - [⚙️ Programmatic Usage](#programmatic-usage)
- [📦 App Notifications](#app-notifications)
  - [📊 App Log Levels](#app-log-levels)
  - [🎚️ Log Level Configuration](#log-level-configuration)
- [🔄 Notification Queue](#notification-queue)
- [🪟 Multi-Window & Multi-Agent Support](#multi-window--multi-agent-support)
  - [📋 Console Log Format](#console-log-format)
  - [🗣️ TTS Spoken Order](#tts-spoken-order)
  - [🤖 Agent Zero Convention](#agent-zero-convention)
- [🎙️ Voice System](#voice-system)
  - [🗺️ Voice Maps](#voice-maps)
- [⌨️ Keyboard Controls](#keyboard-controls)
- [⚙️ Configuration](#configuration)
- [🛠️ Development](#development)
- [📋 Requirements](#requirements)
- [📄 License](#license)
- [👤 Author](#author)

## ✨ Features

- 🎵 **Audio Notifications** - Plays distinct sounds for different notification types
- 🗣️ **Text-to-Speech** - Vocalizes notification messages using macOS `say` command
- 🎙️ **Multi-Agent Voice System** - Distinct TTS voices per agent role or number
- 📂 **Project Identification** - Identifies which project/workspace a notification came from
- 🎨 **Visual Feedback** - Clean console output with emoji-led metadata and dim message text
- 🔌 **MCP Integration** - Works seamlessly with Cursor AI and other MCP-compatible tools
- 📦 **App Notifications** - Build tools, CI scripts, and deploy pipelines can fire notifications
- 🔄 **Notification Queue** - Sequential playback — notifications never overlap
- 📊 **Log Levels** - Configurable console and audio thresholds for app notifications
- ⌨️ **Keyboard Control** - Spacebar to stop all, S to skip current
- 🌐 **HTTP API** - RESTful endpoints for external integrations

## 🏗️ Architecture

```
Agent (MCP)      ──▶  MCP tool "notify"  ──▶  HTTP /notify/agent  ──┐
                                                                     ├──▶  notification queue  ──▶  sequential playback
Agent (HTTP/CLI) ──▶  HTTP /notify/agent  ──────────────────────────┤
                                                                     │
App (HTTP/CLI)   ──▶  HTTP /notify/app  ────────────────────────────┘
```

- **`/notify/agent`** — for all AI agent notifications (MCP, HTTP, or CLI). Always plays audio and logs to console.
- **`/notify/app`** — for all application notifications (HTTP or CLI). Subject to log level thresholds.
- **One MCP tool** — `notify`, exclusively for agents. Calls `/notify/agent` internally.
- **One CLI** — `notify` command. If `--app` flag is present → `/notify/app`; otherwise → `/notify/agent`.
- **One queue** — both endpoints feed into the same FIFO queue. Sequential playback, no overlap.

## 🔔 Notification Types

### 🤖 Agent Types

| Type | Emoji | Description | Use Case |
|------|-------|-------------|----------|
| `done` | ✅ | Task completion | Successful operations |
| `error` | ❌ | Error occurred | Failed operations |
| `question` | ❓ | Need user input | Waiting for decisions |
| `permission` | 🔐 | Need authorization | Requiring user approval |
| `status` | 📡 | Progress update | Ongoing operations |
| `waiting` | ⏳ | Processing | Long-running tasks |
| `review` | 👁️ | Code review needed | File changes ready |

### 📦 App Log Levels

| Level | Emoji | Sound | Use Case |
|-------|-------|-------|----------|
| `debug` | 🐛 | *(none)* | Verbose debug info |
| `info` | ℹ️ | status.mp3 | General information, progress updates |
| `warn` | ⚠️ | waiting.mp3 | Warnings, deprecations, non-critical issues |
| `error` | ❌ | error.mp3 | Failures, crashes, critical issues |
| `success` | ✅ | done.mp3 | Build complete, tests passed, deploy finished |

## 📥 Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-notify

# Install globally
npm install -g

# Link globally for customization
npm link
```

## 🚀 Usage

### 💻 Command Line Interface

```bash
# Agent notification (type and message only)
notify done "Task completed successfully"
notify error "Something went wrong"
notify question "Do you want to continue?"

# Agent with project identification
notify done "Build complete" --workspace-dir /Users/user/repos/my-app

# Agent multi-agent (orchestrator)
notify done "All tasks complete" --workspace-dir /Users/user/repos/my-app --agent-role Orchestrator --agent-number 0

# Agent subagent with full context
notify done "Build complete" --workspace-dir /Users/user/repos/my-app --agent-role Coder --agent-number 2 --model claude-4.6-sonnet

# Agent override TTS voice
notify status "Processing..." --voice Nathan

# App notification
notify success "Build complete" --app webpack
notify error "3 tests failed" --app jest
notify info "Starting deploy..." --app deploy
notify debug "Cache hit ratio 95%" --app webpack
```

#### 🏁 CLI Flags

| Flag | HTTP Query Param | Description |
|------|-----------------|-------------|
| *(positional 1)* | `type` | Notification type or app log level (required) |
| *(positional 2)* | `message` | Message text (required) |
| `--workspace-dir` | `workspaceDir` | Full workspace path — project name derived from last segment (agent notifications only) |
| `--agent-role` | `agentRole` | Agent role name (e.g., "Coder", "Orchestrator") (agent notifications only) |
| `--agent-number` | `agentNumber` | Agent number (Orchestrator = 0, subagents = 1, 2, 3...) (agent notifications only) |
| `--voice` | `voice` | TTS voice override |
| `--model` | `model` | Your exact model identifier (e.g., "claude-4.6-opus-high") (agent notifications only) |
| `--app` | `app` | App name — routes to `/notify/app` endpoint |

### 🔌 MCP Integration (Cursor AI)

Add to your Cursor settings (`settings.json`):

```json
{
  "mcpServers": {
    "agent-notify": {
      "command": "notify-mcp"
    }
  }
}
```

Then configure the notification rules:

**Option 1: Project-specific** - Copy the rules from [`.cursorrules`](.cursorrules) to your project's `.cursorrules` file

**Option 2: Global** - Add the rules from [`.cursorrules`](.cursorrules) globally in: `Settings > Rules & Commands > Add` to use across all projects

#### 📝 MCP Tool Schema

```javascript
mcp_agent-notify_notify({
  type: "done",                               // Required: notification type
  message: "Build complete",                  // Required: message text
  workspaceDir: "/Users/user/repos/my-app",   // Optional: Workspace Path from <user_info>
  agentRole: "Coder",                         // Optional: agent role name
  agentNumber: 2,                             // Optional: agent number (0 = orchestrator)
  voice: "Nathan",                            // Optional: TTS voice override
  model: "claude-4.6-sonnet"                   // Required: exact model identifier (console log only)
})
```

**Note:** The MCP tool is exclusively for agents. App notifications should use the CLI (`--app` flag) or HTTP API (`/notify/app`) directly.

#### 📋 MCP Parameter Descriptions

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Notification type: question, permission, done, error, status, waiting, review |
| `message` | string | Yes | Message to vocalize |
| `workspaceDir` | string | No | The Workspace Path from `<user_info>`. Used to identify which project this notification is from. |
| `agentRole` | string | No | Agent role name assigned by orchestrator (e.g., "Coder", "Reviewer"). The orchestrator itself should use "Orchestrator". |
| `agentNumber` | integer | No | Agent number assigned by orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc. |
| `voice` | string | No | Override the TTS voice for this notification. If omitted, the server selects a voice based on agentRole or agentNumber. |
| `model` | string | Yes | Your exact model identifier as shown in system info (e.g., "claude-4.6-opus-high", "gpt-4o-2025-03"). Console log only. |

### 🌐 HTTP API

Start the notification server:

```bash
# Default (listens on 0.0.0.0:8881 - accessible from network)
npm run server

# With custom log levels for app notifications
node lib/server.mjs --log-level debug --log-level-audio warn

# Cross-network access (recommended for SSH/remote projects)
node lib/server.mjs --address 0.0.0.0:8881

# Custom IP and port
node lib/server.mjs --address 192.168.1.100:8881

# Custom port only (uses 0.0.0.0 as host)
node lib/server.mjs --address 9000

# Localhost only (NOT accessible from other machines)
node lib/server.mjs --address localhost:8881
```

**🌍 Network Access:**
- `0.0.0.0` - 🌐 Accessible from any machine on your network (recommended)
- `localhost/127.0.0.1` - 🏠 Only accessible from the same machine
- Specific IP - 🎯 Only accessible via that network interface

Send notifications via HTTP:

```bash
# Agent notification
curl "http://localhost:8881/notify/agent?type=done&message=Build%20complete&model=claude-4.6-opus-high"

# Agent with full context
curl "http://localhost:8881/notify/agent?type=done&message=Build%20complete&workspaceDir=/Users/user/repos/my-app&agentRole=Coder&agentNumber=2&model=claude-4.6-sonnet"

# App notification
curl "http://localhost:8881/notify/app?type=success&message=Build%20complete&app=webpack"

# App debug (only shown if --log-level allows it)
curl "http://localhost:8881/notify/app?type=debug&message=Cache%20hit%20ratio%2095%25&app=webpack"
```

#### 🤖 `/notify/agent` Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | Yes | Notification type (question, permission, done, error, status, waiting, review) |
| `message` | Yes | Message text |
| `model` | Yes | Exact model identifier (e.g., "claude-4.6-opus-high") |
| `workspaceDir` | No | Full workspace path (project name derived from last segment) |
| `agentRole` | No | Agent role name |
| `agentNumber` | No | Agent number |
| `voice` | No | TTS voice override |

#### 📦 `/notify/app` Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | Yes | Log level (debug, info, warn, error, success) |
| `message` | Yes | Message text |
| `app` | Yes | App name (e.g., "webpack", "jest", "github-actions") |
| `voice` | No | TTS voice override |

### ⚙️ Programmatic Usage

```javascript
import { execSync } from 'child_process';

// Agent notification
execSync('notify done "Operation completed" --model claude-4.6-opus-high');

// Agent with workspace context
execSync('notify done "Build finished" --workspace-dir /Users/user/repos/my-app --model claude-4.6-opus-high');

// App notification
execSync('notify success "Build complete" --app webpack');
```

## 📦 App Notifications

App notifications allow build tools, CI scripts, deploy pipelines, test runners, and any other application to fire notifications alongside agent notifications.

### 📊 App Log Levels

Apps use logger-style levels instead of agent notification types:

| Level | Sound | Emoji | Use Case |
|-------|-------|-------|----------|
| `debug` | *(none by default)* | 🐛 | Verbose debug info |
| `info` | status.mp3 | ℹ️ | General information, progress updates |
| `warn` | waiting.mp3 | ⚠️ | Warnings, deprecations, non-critical issues |
| `error` | error.mp3 | ❌ | Failures, crashes, critical issues |
| `success` | done.mp3 | ✅ | Build complete, tests passed, deploy finished |

**Hierarchy (lowest to highest):** `debug < info < warn < error < success`

### 🎚️ Log Level Configuration

Two server flags control what app notifications are shown and heard:

| Flag | Default | Description |
|------|---------|-------------|
| `--log-level` | `info` | Minimum level to show in console. Below this, the notification is completely ignored. |
| `--log-level-audio` | `info` | Minimum level to play sound + TTS. Below this, the notification is logged to console only (no audio, no queue entry). |

**💡 Examples:**

```bash
# Default: see and hear everything except debug
node lib/server.mjs

# See everything in console, only hear warnings and above
node lib/server.mjs --log-level debug --log-level-audio warn

# See and hear everything including debug
node lib/server.mjs --log-level debug --log-level-audio debug

# Only see and hear errors and successes
node lib/server.mjs --log-level error --log-level-audio error
```

**⚠️ Important:** Log level flags apply to app notifications only. Agent notifications always play audio and log to console regardless of these settings.

### 🔗 Example Integrations

#### 📦 npm scripts (package.json)

```json
{
  "scripts": {
    "build": "webpack --mode production",
    "postbuild": "notify success 'Build complete' --app webpack",
    "test": "jest",
    "posttest": "notify success 'Tests passed' --app jest"
  }
}
```

#### 🐚 Shell script

```bash
#!/bin/bash
notify info "Starting deploy..." --app deploy
npm run build
if [ $? -eq 0 ]; then
  notify success "Deploy successful" --app deploy
else
  notify error "Deploy failed" --app deploy
fi
```

#### 🌐 curl (HTTP)

```bash
# App notification
curl "http://localhost:8881/notify/app?type=success&message=Pipeline%20complete&app=github-actions"

# Agent notification
curl "http://localhost:8881/notify/agent?type=done&message=Build%20complete&model=claude-4.6-opus-high"
```

## 🔄 Notification Queue

When multiple notifications arrive simultaneously (from parallel agents, apps, or a mix), a server-side FIFO queue ensures they play sequentially — one at a time, never overlapping. All callers receive an immediate response.

### ⚙️ Queue Behavior

1. **Every notification is queued** — when a request arrives, it's added to the end of the queue
2. **Sequential playback** — only one notification plays at a time (sound + TTS). The next one starts only after the previous one completes
3. **Immediate response** — the server always responds immediately with `{ success: true, queued: true, position: N }`
4. **Log level filtering** — app notifications below the `--log-level-audio` threshold are logged to console but not enqueued (no audio)

## 🪟 Multi-Window & Multi-Agent Support

When running multiple Cursor windows and parallel agents, the notification system identifies the source of each notification through project name, agent role, and agent number.

### 📋 Console Log Format

#### 🤖 Agent Notifications

Emoji-led format with notification type capitalized. Message displayed in dim text on its own line, followed by a blank line separator. Optional fields omitted when not provided:

```shell
# Orchestrator (full):
✅ DONE 📂 my-app 🤖 Orchestrator #0 🧠 claude-4.6-opus-high
"All tasks complete"

# Subagent (full):
✅ DONE 📂 my-app 🤖 Coder #2 🧠 claude-4.6-sonnet
"Build complete"

# Solo agent (with workspaceDir):
✅ DONE 📂 my-app 🧠 claude-4.6-opus-high
"Build complete"

# Solo agent (no workspaceDir):
✅ DONE 🧠 claude-4.6-opus-high
"Build complete"
```

#### 📦 App Notifications

```shell
✅ SUCCESS 📦 webpack
"Build complete in 4.2s"

❌ ERROR 📦 jest
"3 tests failed in auth.test.ts"

ℹ️ INFO 📦 deploy
"Starting deployment to staging"

⚠️ WARN 📦 eslint
"12 warnings found"

🐛 DEBUG 📦 webpack
"Module resolution: ./src/index.ts → ./dist/index.js"
```

- `📦` emoji for app source (vs `🤖` for agents)
- No model field (apps don't have models)
- No project folder (workspaceDir not supported for apps)
- `app` name shown where agent role would be

### 🗣️ TTS Spoken Order

The notification sound and TTS speech run independently and in parallel. The sound fires immediately, and TTS begins after a 500ms delay. The spoken order matches the screen reading order — parts are omitted when not provided:

#### 🤖 Agent Spoken Order

1. **Message type** (always included, e.g., "done", "question")
2. **Project name** (from `workspaceDir` last segment — omitted if not provided)
3. **Agent role** (if provided, e.g., "Coder")
4. **Agent number** (if provided, e.g., "Agent 2" or "Agent Zero" for orchestrator)
5. **Message text** (always included)

**Examples:**
- `"done, my-app, Coder, Agent 2, Build complete"` — full context
- `"done, my-app, Build complete"` — solo agent with workspaceDir
- `"done, Build complete"` — solo agent, no workspaceDir

#### 📦 App Spoken Order

1. **Log level** (e.g., "success", "error")
2. **App name** (e.g., "webpack")
3. **Message text**

**Examples:**
- `"success, webpack, Build complete in 4.2 seconds"`
- `"error, jest, 3 tests failed"`

### 🤖 Agent Zero Convention

When using an orchestrator with multiple subagents:

- **Orchestrator** = `agentRole="Orchestrator"`, `agentNumber=0` → spoken as "Orchestrator, Agent Zero"
- **Subagent 1** = `agentRole="Coder"`, `agentNumber=1` → spoken as "Coder, Agent 1"
- **Subagent 2** = `agentRole="Reviewer"`, `agentNumber=2` → spoken as "Reviewer, Agent 2"

## 🎙️ Voice System

The server selects a TTS voice using a triple fallback strategy:

1. **Voice override** — If `voice` param is provided, use it directly (highest priority)
2. **Role-based map** — If `agentRole` matches a role in the map, use that voice
3. **Index-based map** — If `agentNumber` matches an index in the map, use that voice
4. **System default** — Use macOS default voice

### 🗺️ Voice Maps

| Agent Role | Voice |
|------------|-------|
| Orchestrator | System default |
| Coder | Nathan (enhanced, natural) |
| Reviewer | Samantha (clear, analytical) |
| Tester | Karen (Australian, methodical) |
| Designer | Zoe (bright, creative) |
| Researcher | Serena (calm, thoughtful) |
| Debugger | Lee (focused, precise) |
| DevOps | Evan (confident, reliable) |
| Writer | Matilda (articulate, clear) |
| Planner | Catherine (organized, strategic) |
| Security | Ava (alert, vigilant) |
| Refactorer | Siri 1 (systematic, efficient) |
| Analyst | Siri 2 (analytical, detailed) |
| Migrator | Siri 3 (methodical, careful) |

| Agent Number | Voice |
|--------------|-------|
| 0 | System default |
| 1 | Nathan |
| 2 | Samantha |
| 3 | Karen |
| 4 | Zoe |
| 5 | Serena |
| 6 | Lee |
| 7 | Evan |
| 8 | Matilda |
| 9 | Catherine |
| 10 | Ava |
| 11 | Siri 1 |
| 12 | Siri 2 |
| 13 | Siri 3 |

Voice maps are configured server-side in `lib/server.mjs` for centralized management.

App notifications use the `voice` parameter if provided, otherwise the system default.

## ⌨️ Keyboard Controls

| Key | Action |
|-----|--------|
| **Spacebar** | Stop current audio AND clear the entire queue (discard all pending notifications) |
| **S** | Skip current notification, move to the next one in the queue |
| **Ctrl+C** | Exit the server |

## ⚙️ Configuration

The system uses predefined sound files located in the `sounds/` directory:

- 🎵 `done.mp3` - Success sound (also used for app `success`)
- 🔔 `error.mp3` - Error alert (also used for app `error`)
- ❓ `question.mp3` - Question prompt
- 🔐 `permission.mp3` - Authorization request
- 📡 `status.mp3` - Status update (also used for app `info`)
- ⏳ `waiting.mp3` - Processing sound (also used for app `warn`)

## 🛠️ Development

### 📁 Project Structure

```
agent-notify/
├── lib/
│   ├── notify.mjs      # CLI interface
│   ├── mcp.mjs         # MCP server
│   └── server.mjs      # HTTP server (queue, two endpoints, log levels)
├── sounds/             # Audio files
├── package.json
└── README.md
```

### 🚀 Running the Server

```bash
# Start the notification server (default settings)
npm run server

# Server runs on http://0.0.0.0:8881

# With custom log levels
node lib/server.mjs --log-level debug --log-level-audio warn
```

### 🧪 Testing

```bash
# Test agent notification
notify done "Test complete" --model claude-4.6-opus-high

# Test agent with project context
notify done "Test complete" --workspace-dir /Users/user/repos/test-project --model claude-4.6-opus-high

# Test agent multi-agent
notify done "Task finished" --workspace-dir /Users/user/repos/test-project --agent-role Coder --agent-number 1 --model claude-4.6-sonnet

# Test app notification
notify success "Build complete" --app webpack
notify error "Tests failed" --app jest
notify info "Deploying..." --app deploy
notify warn "Deprecation warning" --app eslint
notify debug "Verbose output" --app webpack

# Test all agent notification types
notify done "Test complete" --model claude-4.6-opus-high
notify error "Test error" --model claude-4.6-opus-high
notify question "Test question" --model claude-4.6-opus-high
notify permission "Test permission" --model claude-4.6-opus-high
notify status "Test status" --model claude-4.6-opus-high
notify waiting "Test waiting" --model claude-4.6-opus-high

# Test via HTTP
curl "http://localhost:8881/notify/agent?type=done&message=Test&model=test"
curl "http://localhost:8881/notify/app?type=success&message=Test&app=test"
```

## 📋 Requirements

- 🍎 macOS (uses `afplay` and `say` commands)
- 🟢 Node.js 18+
- 🔊 Audio output capability

## 📄 License

See LICENSE.md for details.

## 👤 Author

F1LT3R
