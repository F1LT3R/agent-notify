<p align="center">
  <img src="logo.png" alt="Agent Notify" width="600">
</p>

<p align="center">
  A macOS notification system designed for AI agents and developers, featuring audio notifications, text-to-speech with distinct voices per agent, and MCP (Model Context Protocol) integration. Supports multi-window and multi-agent workflows with project identification and voice differentiation.
</p>

## Table of Contents

- [Features](#features)
- [Notification Types](#notification-types)
- [Installation](#installation)
- [Usage](#usage)
  - [Command Line Interface](#command-line-interface)
  - [MCP Integration (Cursor AI)](#mcp-integration-cursor-ai)
  - [HTTP API](#http-api)
  - [Programmatic Usage](#programmatic-usage)
- [Multi-Window & Multi-Agent Support](#multi-window--multi-agent-support)
  - [Console Log Format](#console-log-format)
  - [TTS Spoken Order](#tts-spoken-order)
  - [Agent Zero Convention](#agent-zero-convention)
- [Voice System](#voice-system)
  - [Voice Maps](#voice-maps)
- [Configuration](#configuration)
- [Development](#development)
- [Requirements](#requirements)
- [License](#license)
- [Author](#author)

## Features

- 🎵 **Audio Notifications** - Plays distinct sounds for different notification types
- 🗣️ **Text-to-Speech** - Vocalizes notification messages using macOS `say` command
- 🎙️ **Multi-Agent Voice System** - Distinct TTS voices per agent role or number
- 📂 **Project Identification** - Identifies which project/workspace a notification came from
- 🎨 **Visual Feedback** - Clean console output with emoji-led metadata and dim message text
- 🔌 **MCP Integration** - Works seamlessly with Cursor AI and other MCP-compatible tools
- ⌨️ **Keyboard Control** - Press any key to stop audio playback
- 🌐 **HTTP API** - RESTful endpoint for external integrations

## Notification Types

| Type | Emoji | Description | Use Case |
|------|-------|-------------|----------|
| `done` | ✅ | Task completion | Successful operations |
| `error` | ❌ | Error occurred | Failed operations |
| `question` | ❓ | Need user input | Waiting for decisions |
| `permission` | 🔐 | Need authorization | Requiring user approval |
| `status` | 📡 | Progress update | Ongoing operations |
| `waiting` | ⏳ | Processing | Long-running tasks |
| `review` | 👁️ | Code review needed | File changes ready |

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd agent-notify

# Install globally
npm install -g

# Link globally for customization
npm link
```

## Usage

### Command Line Interface

```bash
# Basic notification (type and message only)
notify done "Task completed successfully"
notify error "Something went wrong"
notify question "Do you want to continue?"

# With project identification
notify done "Build complete" --workspace-dir /Users/user/repos/my-app

# Multi-agent (orchestrator)
notify done "All tasks complete" --workspace-dir /Users/user/repos/my-app --agent-role Orchestrator --agent-number 0

# Subagent with full context
notify done "Build complete" --workspace-dir /Users/user/repos/my-app --agent-role Coder --agent-number 2 --model claude-4.6-sonnet

# Override TTS voice
notify status "Processing..." --voice Nathan
```

#### CLI Flags

| Flag | HTTP Query Param | Description |
|------|-----------------|-------------|
| *(positional 1)* | `type` | Notification type (required) |
| *(positional 2)* | `message` | Message text (required) |
| `--workspace-dir` | `workspaceDir` | Full workspace path — project name derived from last segment |
| `--agent-role` | `agentRole` | Agent role name (e.g., "Coder", "Orchestrator") |
| `--agent-number` | `agentNumber` | Agent number (Orchestrator = 0, subagents = 1, 2, 3...) |
| `--voice` | `voice` | TTS voice override |
| `--model` | `model` | Your exact model identifier (e.g., "claude-4.6-opus-high") |

### MCP Integration (Cursor AI)

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

#### MCP Tool Schema

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

#### MCP Parameter Descriptions

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | Yes | Notification type: question, permission, done, error, status, waiting, review |
| `message` | string | Yes | Message to vocalize |
| `workspaceDir` | string | No | The Workspace Path from `<user_info>`. Used to identify which project this notification is from. |
| `agentRole` | string | No | Agent role name assigned by orchestrator (e.g., "Coder", "Reviewer"). The orchestrator itself should use "Orchestrator". |
| `agentNumber` | integer | No | Agent number assigned by orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc. |
| `voice` | string | No | Override the TTS voice for this notification. If omitted, the server selects a voice based on agentRole or agentNumber. |
| `model` | string | Yes | Your exact model identifier as shown in system info (e.g., "claude-4.6-opus-high", "gpt-4o-2025-03"). Console log only. |

### HTTP API

Start the notification server:

```bash
# Default (listens on 0.0.0.0:8881 - accessible from network)
npm run server

# Cross-network access (recommended for SSH/remote projects)
node lib/server.mjs --address 0.0.0.0:8881

# Custom IP and port
node lib/server.mjs --address 192.168.1.100:8881

# Custom port only (uses 0.0.0.0 as host)
node lib/server.mjs --address 9000

# Localhost only (NOT accessible from other machines)
node lib/server.mjs --address localhost:8881
```

**Network Access:**
- `0.0.0.0` - Accessible from any machine on your network (recommended)
- `localhost/127.0.0.1` - Only accessible from the same machine
- Specific IP - Only accessible via that network interface

Send notifications via HTTP:

```bash
# Basic notification
curl "http://localhost:8881/agent-notify?type=done&message=Hello%20World"

# With project and agent context
curl "http://localhost:8881/agent-notify?type=done&message=Build%20complete&workspaceDir=/Users/user/repos/my-app&agentRole=Coder&agentNumber=2&model=claude-4.6-sonnet"
```

#### HTTP Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | Yes | Notification type |
| `message` | Yes | Message text |
| `workspaceDir` | No | Full workspace path (project name derived from last segment) |
| `agentRole` | No | Agent role name |
| `agentNumber` | No | Agent number |
| `voice` | No | TTS voice override |
| `model` | Yes | Your exact model identifier (e.g., "claude-4.6-opus-high") |

### Programmatic Usage

```javascript
import { execSync } from 'child_process';

// Basic notification
execSync('notify done "Operation completed" --model claude-4.6-opus-high');

// With workspace context
execSync('notify done "Build finished" --workspace-dir /Users/user/repos/my-app --model claude-4.6-opus-high');
```

## Multi-Window & Multi-Agent Support

When running multiple Cursor windows and parallel agents, the notification system identifies the source of each notification through project name, agent role, and agent number.

### Console Log Format

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

### TTS Spoken Order

The notification sound and TTS speech run independently and in parallel. The sound fires immediately, and TTS begins after a 500ms delay. The spoken order matches the screen reading order — parts are omitted when not provided:

1. **Message type** (always included, e.g., "done", "question")
2. **Project name** (from `workspaceDir` last segment — omitted if not provided)
3. **Agent role** (if provided, e.g., "Coder")
4. **Agent number** (if provided, e.g., "Agent 2" or "Agent Zero" for orchestrator)
5. **Message text** (always included)

**Examples:**
- `"done, my-app, Coder, Agent 2, Build complete"` — full context
- `"done, my-app, Build complete"` — solo agent with workspaceDir
- `"done, Build complete"` — solo agent, no workspaceDir
- `"done, Coder, Agent 2, Build complete"` — agent info but no workspaceDir

### Agent Zero Convention

When using an orchestrator with multiple subagents:

- **Orchestrator** = `agentRole="Orchestrator"`, `agentNumber=0` → spoken as "Orchestrator, Agent Zero"
- **Subagent 1** = `agentRole="Coder"`, `agentNumber=1` → spoken as "Coder, Agent 1"
- **Subagent 2** = `agentRole="Reviewer"`, `agentNumber=2` → spoken as "Reviewer, Agent 2"

## Voice System

The server selects a TTS voice using a triple fallback strategy:

1. **Voice override** — If `voice` param is provided, use it directly (highest priority)
2. **Role-based map** — If `agentRole` matches a role in the map, use that voice
3. **Index-based map** — If `agentNumber` matches an index in the map, use that voice
4. **System default** — Use macOS default voice

### Voice Maps

| Agent Role | Voice |
|------------|-------|
| Orchestrator | System default |
| Coder | Nathan (enhanced, natural) |
| Reviewer | Samantha (clear, analytical) |
| Tester | Karen (Australian, methodical) |

| Agent Number | Voice |
|--------------|-------|
| 0 | System default |
| 1 | Nathan |
| 2 | Samantha |
| 3 | Karen |

Voice maps are configured server-side in `lib/server.mjs` for centralized management.

## Configuration

The system uses predefined sound files located in the `sounds/` directory:

- `done.mp3` - Success sound
- `error.mp3` - Error alert
- `question.mp3` - Question prompt
- `permission.mp3` - Authorization request
- `status.mp3` - Status update
- `waiting.mp3` - Processing sound

## Development

### Project Structure

```
agent-notify/
├── lib/
│   ├── notify.mjs      # CLI interface
│   ├── mcp.mjs         # MCP server
│   └── server.mjs      # HTTP server
├── sounds/             # Audio files
├── package.json
└── README.md
```

### Running the Server

```bash
# Start the notification server
npm run server

# Server runs on http://localhost:8881
```

### Testing

```bash
# Test basic notification
notify done "Test complete" --model claude-4.6-opus-high

# Test with project context
notify done "Test complete" --workspace-dir /Users/user/repos/test-project --model claude-4.6-opus-high

# Test multi-agent
notify done "Task finished" --workspace-dir /Users/user/repos/test-project --agent-role Coder --agent-number 1 --model claude-4.6-sonnet

# Test all notification types
notify done "Test complete" --model claude-4.6-opus-high
notify error "Test error" --model claude-4.6-opus-high
notify question "Test question" --model claude-4.6-opus-high
notify permission "Test permission" --model claude-4.6-opus-high
notify status "Test status" --model claude-4.6-opus-high
notify waiting "Test waiting" --model claude-4.6-opus-high
```

## Requirements

- macOS (uses `afplay` and `say` commands)
- Node.js 18+
- Audio output capability

## License

See LICENSE.md for details.

## Author

F1LT3R
