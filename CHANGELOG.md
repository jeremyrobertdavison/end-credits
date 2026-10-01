# Changelog

All notable changes to End Credits will be documented here.

## [1.0.1] - 2026-10-01

### Fixed
- Fixed the **Configure End Credits** scene-control button failing to open the configuration window.
- Replaced the asynchronous `DialogV2.wait()` manager flow with Foundry's documented explicit `DialogV2` render flow.
- Added user-visible error notifications and console logging if the configuration window cannot render.
- Prevented duplicate configuration windows by bringing the existing manager to the front.

## [1.0.0] - 2026-10-01

### Added

- Initial public release.
- System-agnostic synchronized end-credit playback.
- GM credit editor with arbitrary credit cards.
- Configurable total duration with automatic equal timing per card.
- Local preview and global play/stop controls.
- Late-join playback synchronization.
- Optional progress bar and player dismiss control.
- Appearance settings for colors and text scale.
- Public macro API.
- GitHub Actions release workflow.
