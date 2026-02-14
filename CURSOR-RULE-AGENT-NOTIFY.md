# Agent Notification System

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

## Parameters

| Parameter     | Required | Description                                                                 |
|---------------|----------|-----------------------------------------------------------------------------|
| `type`        | Yes      | Notification type (see types above)                                         |
| `message`     | Yes      | Message to vocalize                                                         |
| `workspaceDir`| No       | The Workspace Path from `<user_info>` — identifies which project this is from |
| `agentRole`   | No       | Role name from orchestrator (e.g., "Coder"). Orchestrator uses "Orchestrator". |
| `agentNumber` | No       | Agent number from orchestrator. Orchestrator = 0, subagents = 1, 2, 3, etc.  |
| `voice`       | No       | Override TTS voice (bypasses server voice maps)                              |
| `model`       | Yes      | Your model identifier (e.g., "claude-4-opus", "gpt-4o") — shown in console log, not spoken |

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
- Pass `model` if known (e.g., `model="claude-4-opus"`)

**IMPORTANT: The orchestrator is responsible for sending notifications on behalf of its subagents.** When a subagent completes a turn, the orchestrator should send a notification using that subagent's `agentRole` and `agentNumber`, so the user can hear which agent did what. Use the orchestrator's own identity (`agentRole="Orchestrator"`, `agentNumber=0`) only when reporting its own actions.

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
type="done", message="All tasks complete", workspaceDir="/Users/user/repos/my-app", agentRole="Orchestrator", agentNumber=0, model="claude-4-opus"
type="done", message="Build complete", workspaceDir="/Users/user/repos/my-app", agentRole="Coder", agentNumber=1, model="claude-4-sonnet"
```

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
