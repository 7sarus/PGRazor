<p align="center"><img src="pgrazor/branding/pgrazor.svg" width="88" alt="PGRazor logo"></p>
<h1 align="center">PGRazor</h1>
<p align="center">A compact Android interface for location controls and Pokémon GO automation.</p>

PGRazor adds an in-game menu, independent joystick, encounter controls, and optional automation. Settings persist across restarts, with light and dark themes.

**Working APK releases are private.** Original game APKs, signing keys, private build artifacts, and investigation logs are excluded from Git. Selected map artwork is bundled with provenance; see [third-party notices](THIRD_PARTY.md). The release workflow refuses to build or publish a playable APK in a public repository.

## Install a private release

1. Open [Releases](https://github.com/jpitty03/PGRazor/releases) with an account that has access.
2. Download **PGRazor.apk**, not a source archive or preview.
3. Transfer it to your ARM64 Android phone, allow installation from your chosen file manager, and open the APK.
4. Launch PGRazor and tap the small **R** icon to open settings.

Private releases are test candidates; check their release notes for device-validation status. The current game baseline is **Pokémon GO 0.433.1 / 2026101502**. Native hooks are version-specific. A different game version can leave features unavailable.

The Android package identity stays compatible with the game. An official-store installation uses a different signing certificate and cannot be updated in place with a PGRazor build. This pre-release uses a fresh PGRazor signing key and settings namespace; install it fresh. See [installation and builds](docs/BUILDING.md).

## Features

| Area | Controls |
| --- | --- |
| Map | Joystick, saved locations, routes, tap-to-walk/teleport, camera steering, nearby stop/gym/raid layers |
| Catching | Quick Catch with 20× ball animation, throw grade/curveball options, IV display, berry selector |
| Inventory | Transfer newly caught Pokémon below 90% IV; configurable item limits |
| Keep rules | Legendary/mythical/Ultra Beasts, shiny, event/costume, background, **XXS**, **XXL**; favorites and eggs always kept |
| Virtual Go Plus | Nearby wild catches with red balls, nearby stop spins, optional notifications, target marker and activity status |
| Other automation | Rocket/raid/gym/Dynamax controls, buddy feeding, gift opening/sending, quick spin |
| Interface | Small launcher, separate joystick, cooldown history, light/dark themes |

**VGP:** the settings switch shows or hides its overlay. Tap the overlay's power icon to start or stop VGP. Green **ON** and gray **OFF** make its state visible. Hiding the overlay stops VGP. Catch and item automation follow their existing settings and protection rules.

These are experimental client modifications. Server outcomes are not guaranteed. The AR+ option and local spawn-range changes do not prove server-side bonuses. Cooldown is a local estimate. Do not interpret a successful build as device validation.

## Build and contribute

- [Build, signing, private CI, and installation](docs/BUILDING.md)
- [Architecture and compatibility](docs/ARCHITECTURE.md)
- [Contributing and checks](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY.md)

```powershell
python -B tools/check.py
```

Source CI runs device-free checks and compiles the Android controls. Its downloadable artifact contains **source and tools only**, not a playable APK. Private playable releases are produced separately by the manually triggered **Private playable APK** workflow.

## Repository layout

```text
.github/workflows/       Source CI and private release workflow
docs/                    Build and architecture guides
pgrazor/src/      Android UI and control bridge
pgrazor/diagnostics/  Version-specific native hooks
pgrazor/test/     Regression tests
pgrazor/vendor/   Pinned bridge, provenance, and licenses
tools/                   Checks, source packaging, private CI setup
```

PGRazor uses the `pgrazor/` project directory and `dev.pgrazor` Java namespace. Assets, settings, logs, build outputs, and tooling use the same name. There are no legacy-name aliases or settings migrations.

## License

Original PGRazor source is available under the [MIT License](LICENSE). Third-party components retain their own licenses. Pokémon GO and its assets are not covered by this license. PGRazor is an independent project and is not affiliated with the game publisher.

The world map layers show locations currently loaded by the game near your avatar, not remote search results. Markers use bundled game artwork, with gym team-color rings and distinct raid categories. Tap a marker for live gym/raid details; overlapping markers open a chooser. Egg badges identify unhatched raids. Small x/6 labels show gym defenders directly on the map; raid details resolve base-species names from bundled English game text. Unknown species keep their numeric fallback. Layer choices persist. Tile loading uses the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), including local caching and visible tiles only.
