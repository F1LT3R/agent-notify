# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- App notifications now support `workspaceDir` parameter to identify which project they are from
- App notifications now support `detail` parameter for short contextual info (e.g., file path, count)
- Console format: `ℹ️ INFO 📦 app-name 📂 project-name ⚙️ detail`
- Project and detail included in TTS spoken order and stored in message stream
- CLI `notify` command now forwards `--workspace-dir` and `--detail` to app notifications
