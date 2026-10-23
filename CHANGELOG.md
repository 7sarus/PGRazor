# Changelog

## Unreleased

- Simplify the catching berry overlay to an icon/count and add three saved berry priorities with inventory fallback, including out-of-stock selections.

- Add a searchable custom species keep list and optional persistent Keep All transfer overlay, shared by manual and VGP catches and included in settings backup.

- Allow VGP to run while other in-game screens are open; exclude the current manual encounter target and keep world markers map-only.

## v0.1.1

[Full release notes](docs/releases/v0.1.1.md)

- Restore the saved Location spoofing toggle; disabling returns to device location and stops simulated movement.

- Add separate saved IV/level display toggles for encounters and owned Pokémon details, included in settings export/import.

- Quick Catch can skip creating the post-catch details screen for confirmed manual catches, preserving auto-transfer and the game's dismissal callback. Unsupported paths retain normal dismissal.

- Quick Catch also shortens the successful-catch presentation wait to 100 ms starting with the first catch. Summary dismissal and auto-transfer retain their existing completion checks.

## v0.1.0

[Full release notes](docs/releases/v0.1.0.md)

- Fix Google sign-in by opening Google authentication in the system browser.
- Add optional Discord release role pings.

- Pause automated gym, raid, and Dynamax attacks and dodges while the Pokémon switch picker is open; resume after it closes.

## v0.1.0-alpha.4

[Full release notes](docs/releases/v0.1.0-alpha.4.md)

My Shinies, expanded Feed display filters and local presets, plus portable settings export/import.

## v0.1.0-alpha.3

[Full release notes](docs/releases/v0.1.0-alpha.3.md)

Quick menu, map layers and routes, LivePokeMap integration, movable overlays, unlimited egg incubation, VGP improvements, Discord footer, and restored Pokémon GO launcher label.

## Earlier pre-release work

- Rename the project, Java namespace, assets, settings, logs, signing alias, and tooling to PGRazor throughout; remove legacy settings migrations. A fresh installation is required.

- Added independent XXS and XXL keep rules for caught-Pokémon transfers, shared by manual catches and VGP.
- Changed the VGP settings switch to control overlay visibility; the overlay power button starts/stops VGP and displays ON/OFF.
- Added a compact VGP activity display, projected target marker, caught-ID transfer integration, and item cleanup sequencing.
- Introduced private single-APK packaging and a guarded GitHub Actions prerelease workflow.
- Prepared source-only CI artifacts, build/contribution documentation, licensing notices, and repository exclusions.

The new single-APK release path and latest UI changes still require device testing.

Earlier release notes are available on [GitHub Releases](https://github.com/jpitty03/PGRazor/releases).
