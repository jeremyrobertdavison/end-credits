# End Credits

**End Credits** is a system-agnostic Foundry Virtual Tabletop module for playing cinematic, synchronized end credits for everyone connected to a World.

The GM creates a list of credit cards, chooses the total runtime, and End Credits automatically gives every card an equal portion of that time. It is useful for campaign finales, chapter endings, one-shots, convention games, streamed games, or any session that deserves a proper closing sequence.

## Features

- System agnostic: no dependency on D&D, Pathfinder, or any other game system.
- GM-only End Credits control palette in the Foundry Scene Controls.
- Add as many credit cards as you want.
- Each card supports a heading, a main line, and a subtitle/detail line.
- Move cards up or down or remove them at any time.
- Configure the total runtime in seconds.
- Credits are automatically and evenly spaced across the configured runtime.
- Smooth cinematic fade-in / fade-out presentation.
- Synchronized playback using Foundry's module socket and server clock.
- Late-joining players can join a credit sequence already in progress.
- Local GM preview without broadcasting to players.
- GM can stop a live sequence for everyone.
- Optional player-side dismiss button.
- Optional progress bar.
- Configurable background, text, accent color, and text scale.
- World-level persistence for credit configuration.
- Macro API for automation or custom controls.

## Foundry Compatibility

- Minimum: Foundry VTT 13
- Verified: Foundry VTT 14
- Game system: Any

## Installation

### Recommended: Foundry Manifest URL

After the first GitHub release has been published, install the module from **Foundry VTT → Add-on Modules → Install Module** using:

```text
https://github.com/jeremyrobertdavison/end-credits/releases/latest/download/module.json
```

### Manual Installation

Download `end-credits.zip` from the GitHub Releases page and extract it into:

```text
<Data Path>/Data/modules/end-credits/
```

Restart Foundry if necessary, then enable **End Credits** in your World's module settings.

## Using End Credits

When logged in as a GM, select the **film icon** in Foundry's Scene Controls. It provides four actions:

1. **Configure End Credits** — edit timing, appearance, and credit cards.
2. **Preview End Credits Locally** — play the current credits only on the GM's browser.
3. **Play End Credits for Everyone** — broadcast the sequence to connected users.
4. **Stop End Credits for Everyone** — immediately stop an active sequence.

### Timing

End Credits uses a deliberately simple timing rule:

```text
seconds per card = total runtime ÷ number of credit cards
```

For example, 12 cards over a 120-second runtime gives each card exactly 10 seconds.

Each card fades in near the start of its time slot, remains visible, and fades out near the end. This keeps the whole sequence locked to the runtime selected by the GM.

## Suggested Credit Card Layout

A campaign finale might use cards like:

```text
THE END

GAME MASTER
Jeremy Davison

ARIC THORNE
Played by Jordan

MIRA VALE
Played by Sam

SPECIAL THANKS
Everyone who joined us along the way

THANK YOU FOR PLAYING
Until the next adventure.
```

Each block above can be its own credit card.

## Macro API

End Credits exposes a small API after Foundry is ready:

```javascript
const credits = game.modules.get("end-credits").api;
```

Available methods:

```javascript
credits.configure(); // Open GM configuration
credits.preview();   // Preview locally
credits.play();      // Play for everyone (GM only)
credits.stop();      // Stop for everyone (GM only)
```

## GitHub Release Workflow

This repository includes `.github/workflows/release.yml`.

To publish a release:

```bash
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

The GitHub Action will create:

- `end-credits.zip`
- `module.json`

and attach them to the tagged GitHub Release.

For later releases, update the version in `module.json`, update its `download` URL to the new version tag, update `CHANGELOG.md`, then tag and push the new release.

## Repository

https://github.com/jeremyrobertdavison/end-credits

## License

Released under the MIT License. See [LICENSE](LICENSE).
