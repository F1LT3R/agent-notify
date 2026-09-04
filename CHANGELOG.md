# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- App notifications now support `project` parameter (direct name, not a path)
- App notifications now support `detail` parameter for short contextual info (e.g., file path, count)
- Console format: `ℹ️ INFO 📦 app-name 📂 project-name ⚙️ detail`
- Project and detail included in TTS spoken order and stored in message stream
- CLI flags: `--project` and `--detail` for app notifications
- `trace` app log level (🔬, silent) — below debug in hierarchy
- Web UI at `http://localhost:8881/` with dark/light theme toggle
- Real-time message feed via Server-Sent Events (SSE)
- Web UI controls: Clear (stop audio), Skip, Mute
- `POST /notify/operator` endpoint for human-in-the-loop messaging
- Operator messages: source `operator`, default voice Daniel (en-GB), sound question.mp3
- Web UI compose bar with agent picker dropdown and message input
- 3-day message history with date separators (Today, Yesterday, weekday)
- Message limit raised to 2000 (was 200)
- SSE reconnect catchup and tab resume — fetches missed messages via `since_id` on reconnect or tab focus
- Web Push Notifications via service worker — native OS notifications even with browser closed/screen off
- Push auto-registers on first user click, permission prompt handled by browser
- `GET /push/vapid-key`, `POST /push/subscribe`, `POST /push/unsubscribe` endpoints
- VAPID keys auto-generated on first run, persisted to store directory
- Requires `localhost` or HTTPS (e.g., Cloudflare Tunnel) — LAN IPs don't support push
- `image` notification type (🖼️, bright magenta) — renders images inline in the iTerm2 terminal via the `iterm2-image` package
- `image` parameter on `/notify/agent` — absolute image path rendered after the message text; works with any type (e.g., `done` with a screenshot); required when `type=image`
- CLI flag `--image path` for the `notify` command
- Image link (`🔗`, clickable OSC 8) printed under every rendered image

### Changed

- Replace deprecated `apple-mobile-web-app-capable` meta tag with `mobile-web-app-capable`
- Mute (M key / `/controls/mute`) now silences all audio — agents and apps, all types
- Mute labels updated: "Audio muted" / "Audio unmuted" (was "Agent messages muted")
- `--log-level` and `--log-level-audio` now only control audio threshold — console always shows all app messages including trace/debug
- All app messages are always stored and broadcast to web UI regardless of log level
- Removed faint ANSI style from console message text and store link — brighter default output
- Web push no longer fires on trace/debug messages
- Mute/skip/audio-stop no longer write control bookkeeping messages to the store
