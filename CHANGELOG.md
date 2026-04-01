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

### Changed

- Mute (M key / `/controls/mute`) now silences all audio — agents and apps, all types
- Mute labels updated: "Audio muted" / "Audio unmuted" (was "Agent messages muted")
- `--log-level` and `--log-level-audio` now only control audio threshold — console always shows all app messages including trace/debug
- All app messages are always stored and broadcast to web UI regardless of log level
