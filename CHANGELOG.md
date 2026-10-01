# Changelog

## [1.0.4] - 2026-10-01

### Added
- Added prominent **Add Player** controls at both the top and bottom of the credit list.
- Added **Add Another Credit Card** at the bottom of the list so long credit sequences can be expanded without scrolling back to the toolbar.
- Added background image selection through Foundry's native File Picker.
- Added a live background preview in the configuration window.
- Added a 0–100% background image opacity control.
- Background artwork is layered over the configured base color, which now defaults to black.

### Changed
- New player cards are pre-filled as `PLAYER`, `Character Name`, and `Played by Player Name` for quicker campaign-credit entry.
- Updated the default player card to match the new per-player workflow.

## [1.0.3] - 2026-10-01

- Fixed the configuration editor being clipped on shorter displays.
- The editor body now has its own vertical scrollbar while the dialog footer remains accessible.
- The configuration window now chooses an initial height based on the current browser viewport.
- Opening the editor always starts at the top of the configuration form.

All notable changes to End Credits will be documented here.

## [1.0.2] - 2026-10-01

### Fixed
- Fixed Foundry V14 rejecting the configuration dialog with `config.content element must have no attributes`.
- Wrapped the End Credits editor in the plain, attribute-free outer `div` required by `DialogV2`.
- Moved all editor event binding to the dialog's post-render lifecycle so Add Credit, Preview, reordering, removal, timing updates, Save, and Save & Play remain functional after Foundry stringifies the dialog content.

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
