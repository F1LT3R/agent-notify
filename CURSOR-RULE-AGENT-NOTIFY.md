# Mandatory Agent Notification System

Send notifications at **all pause points** in Agent and Debug modes.

**MANDATORY: Send at least one notification per Agent mode turn.**

If none of the specific triggers below apply, send a final notification:

```
user-agent-notify-notify type="status" message="<details>" workspaceDir="[Workspace Path from <user_info>]"
```

## What Counts as a Pause Point

### Requires Notification

- Before ANY command that needs user approval
- Before code reviews or file changes that need review
- After completing tasks (`type="done"`)
- When asking the user questions (`type="question"`)
- During long operations (`type="status"`)
- When errors occur (`type="error"`)
- When waiting for processes (`type="waiting"`)

### Does NOT Require Notification

- Answering user questions with information only (no actions taken)
- Reading files or exploring code to answer questions
- Explaining code or concepts
- Any response in Ask mode or Plan mode (notifications not available)

## Notification Types

| Type         | Purpose                                      |
|--------------|----------------------------------------------|
| `done`       | Task completion                              |
| `question`   | Need user input                              |
| `permission` | Need mode changes or user command approval   |
| `error`      | Errors blocking progress                     |
| `status`     | Progress updates                             |
| `waiting`    | Waiting for processes                        |
| `review`     | Code changes ready for review                |
| `message`    | Agent-to-agent conversation message           |

## Parameters

| Parameter     | Required | Description                                                                 |
|---------------|----------|-----------------------------------------------------------------------------|
| `type`        | Yes      | Notification type (see types above)                                         |
| `message`     | Yes      | Message to vocalize                                                         |
| `workspaceDir`| No       | The Workspace Path from `<user_info>` — identifies which project this is from |
| `agentRole`   | No       | Role name from orchestrator (e.g., "Coder"). Orchestrator uses "Orchestrator". |
| `agentNumber` | No       | Agent number from orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc.  |
| `voice`       | No       | Override TTS voice (bypasses server voice maps)                              |
| `model`       | Yes      | Your exact model identifier as shown in system info (e.g., "claude-4.6-opus-high", "gpt-4o-2025-03"). Include version and variant. Shown in console log, not spoken. |
| `to`          | No       | Agent role or name this message is directed to (e.g., "Reviewer", "Coder"). Used for agent-to-agent conversations. All agents can still see the message in the stream. |

All fields beyond `type` and `message` are optional and gracefully degrade.

### workspaceDir

Always pass `workspaceDir` using the **full Workspace Path** from `<user_info>` (e.g., `/Users/user/repos/my-app`). The server derives the project name from the last path segment. If `<user_info>` is not available, omit it — don't guess.

## Required Notification Triggers

### Before proposing ANY command that requires user approval

```
user-agent-notify-notify type="permission" message="Requesting approval for: [command description]" workspaceDir="[Workspace Path from <user_info>]"
```

### Before code reviews or file changes that need review

```
user-agent-notify-notify type="review" message="Code changes ready for review: [description]" workspaceDir="[Workspace Path from <user_info>]"
```

### After completing tasks

```
user-agent-notify-notify type="done" message="[Task description] completed" workspaceDir="[Workspace Path from <user_info>]"
```

### When asking questions

```
user-agent-notify-notify type="question" message="[Question summary]" workspaceDir="[Workspace Path from <user_info>]"
```

### During long operations

```
user-agent-notify-notify type="status" message="[Current operation]" workspaceDir="[Workspace Path from <user_info>]"
```

### When errors occur

```
user-agent-notify-notify type="error" message="[Error description]" workspaceDir="[Workspace Path from <user_info>]"
```

### When waiting for processes

```
user-agent-notify-notify type="waiting" message="[What we're waiting for]" workspaceDir="[Workspace Path from <user_info>]"
```

## Agent Zero Convention (Multi-Agent / Orchestrator)

When orchestrating multiple subagents:

- **Orchestrator** identifies itself as `agentRole="Orchestrator"`, `agentNumber=0`
- **Subagents** are assigned roles and numbers starting from 1 (e.g., `agentRole="Coder"`, `agentNumber=1`)
- Pass `model` with your exact model identifier (e.g., `model="claude-4.6-opus-high"`)

**IMPORTANT: The orchestrator is responsible for sending notifications on behalf of its subagents.** When a subagent completes a turn, the orchestrator should send a notification using that subagent's `agentRole` and `agentNumber`, so the user can hear which agent did what. Use the orchestrator's own identity (`agentRole="Orchestrator"`, `agentNumber=0`) only when reporting its own actions.

### Available Agent Roles

The following agent roles are available with distinct TTS voices. Orchestrators should assign these roles to subagents based on their responsibilities:

| Role | Description | Voice | Region |
|------|-------------|-------|--------|
| **Orchestrator** | Coordinates subagents, delegates tasks | System default | - |
| **Coder** | Writes implementation code | Nathan | America |
| **Reviewer** | Reviews code for quality, bugs, patterns | Samantha | America |
| **Tester** | Writes and runs tests | Karen | Australia |
| **Designer** | UI/UX design, styling, layout | Zoe | America |
| **Researcher** | Explores codebases, reads docs, gathers context | Serena | America |
| **Debugger** | Investigates bugs, traces errors | Lee | America |
| **DevOps** | CI/CD, deployment, infrastructure | Evan | America |
| **Writer** | Documentation, READMEs, comments | Matilda | America |
| **Planner** | Architecture, task breakdown, planning | Catherine | Australia |
| **Security** | Audits, vulnerability checks | Ava | America |
| **Refactorer** | Code cleanup, optimization, restructuring | Siri 1 | America |
| **Analyst** | Data analysis, performance profiling | Siri 2 | America |
| **Migrator** | Upgrades, migrations, version bumps | Siri 3 | America |

Solo (non-orchestrated) agents only need `type`, `message`, and optionally `workspaceDir`.

## Examples

### Solo agent (recommended default)

```
type="done", message="README updated successfully", workspaceDir="/Users/user/repos/my-app"
type="permission", message="About to run npm install command", workspaceDir="/Users/user/repos/my-app"
type="review", message="Code changes ready for review", workspaceDir="/Users/user/repos/my-app"
type="question", message="Which approach do you prefer?", workspaceDir="/Users/user/repos/my-app"
type="error", message="File not found, cannot proceed", workspaceDir="/Users/user/repos/my-app"
type="status", message="Processing 15 files...", workspaceDir="/Users/user/repos/my-app"
type="waiting", message="Waiting for server to start", workspaceDir="/Users/user/repos/my-app"
```

### Orchestrator examples

```
type="done", message="All tasks complete", workspaceDir="/Users/user/repos/my-app", agentRole="Orchestrator", agentNumber=0, model="claude-4.6-opus-high"
type="done", message="Build complete", workspaceDir="/Users/user/repos/my-app", agentRole="Coder", agentNumber=1, model="claude-4-sonnet"
```

## Message Stream: `user-agent-notify-get_messages`

Every notification sent via `notify` is stored in a persistent message stream. Use `get_messages` to pull messages — for monitoring, polling for responses, or reading conversation history.

### Parameters

| Parameter     | Required | Description                                                                 |
|---------------|----------|-----------------------------------------------------------------------------|
| `since_id`    | No       | Return only messages with id greater than this. Pass 0 for initial fetch, then use `latest_id` from the response for subsequent polls. |
| `limit`       | No       | Max messages to return (default 50, max 200)                                |
| `type`        | No       | Filter by notification type                                                 |
| `to`          | No       | Filter messages directed to this agent role/name                            |
| `project`     | No       | Filter by project name (derived from workspaceDir)                          |
| `source`      | No       | Filter by source: "agent" or "app"                                          |
| `agentRole`   | No       | Filter by agent role (e.g., "Coder", "Reviewer")                            |
| `agentNumber` | No       | Filter by agent number                                                      |
| `model`       | No       | Filter by model identifier                                                  |
| `voice`       | No       | Filter by TTS voice name                                                    |
| `app`         | No       | Filter by app name (for app notifications)                                  |

### Incremental Polling

```
# First fetch — get recent messages
user-agent-notify-get_messages since_id=0

# Response includes latest_id — use it for next poll
user-agent-notify-get_messages since_id=42
```

## Agent-to-Agent Conversations

Agents can have real-time conversations using `notify` (to speak) and `get_messages` (to listen). Each agent speaks in their own TTS voice — the user hears the discussion unfold live.

### How It Works

1. **Send a message** using `notify` with `type="message"` and `to="RecipientRole"`:
   ```
   user-agent-notify-notify type="message" to="Reviewer" message="Should we use Redis or in-memory caching?" agentRole="Coder" agentNumber=1 model="claude-4.6-opus-high"
   ```

2. **Poll for responses** using `get_messages` filtered to your role:
   ```
   user-agent-notify-get_messages to="Coder" since_id=0
   ```

3. **Reply** with another `notify`:
   ```
   user-agent-notify-notify type="message" to="Coder" message="In-memory for now, Redis when we need horizontal scaling" agentRole="Reviewer" agentNumber=2 model="claude-4.6-opus-high"
   ```

### Key Points

- `to` is a hint for filtering — all messages are visible to all agents in the stream
- The user hears each agent in a distinct voice (Nathan for Coder, Samantha for Reviewer, etc.)
- The user can press `[M]` to mute conversation audio while still seeing messages in the console
- Use `type="message"` for conversation turns; reserve other types for their intended purpose

## Mode Availability

| Mode  | Notifications |
|-------|---------------|
| Agent | ✅ Available   |
| Debug | ✅ Available   |
| Ask   | ❌ Not needed  |
| Plan  | ❌ Not needed  |

## Critical Reminder

**Always notify BEFORE requesting permissions or reviews.**

This ensures users get audio alerts before:

- Approval dialogs appear
- Review dialogs are shown
- Any pause point that requires user interaction
