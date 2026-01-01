# Agent Notify 🔔

A macOS notification system designed for AI agents and developers, featuring audio notifications, text-to-speech, and MCP (Model Context Protocol) integration.

## Features

- 🎵 **Audio Notifications** - Plays distinct sounds for different notification types
- 🗣️ **Text-to-Speech** - Vocalizes notification messages using macOS `say` command
- 🎨 **Visual Feedback** - Clean console output with type-specific emojis
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
# Basic notification
notify done "Task completed successfully"
notify error "Something went wrong"
notify question "Do you want to continue?"

# All notification types
notify status "Processing data..."
notify waiting "Please wait while we process your request"
notify permission "This action requires administrator privileges"
```

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

The rules ensure notifications are sent at all pause points including:
- Command approvals (`permission`)
- Code reviews (`review`) 
- Task completions (`done`)
- Questions (`question`)
- Errors (`error`)
- Status updates (`status`)
- Waiting periods (`waiting`)

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
curl "http://localhost:8881/agent-notify?type=done&message=Hello%20World"
```

### Programmatic Usage

```javascript
import { execSync } from 'child_process';

// Send notification
execSync('notify done "Operation completed"');
```

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
# Test all notification types
notify done "Test complete"
notify error "Test error"
notify question "Test question"
notify permission "Test permission"
notify status "Test status"
notify waiting "Test waiting"
```

## Requirements

- macOS (uses `afplay` and `say` commands)
- Node.js 18+
- Audio output capability

## License

See LICENSE.md for details.

## Author

F1LT3R