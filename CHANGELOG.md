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

### Changed

- Mute (M key / `/controls/mute`) now silences all audio — agents and apps, all types
- Mute labels updated: "Audio muted" / "Audio unmuted" (was "Agent messages muted")
