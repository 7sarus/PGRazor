# Architecture

PGRazor has three layers:

1. Java controls (`src/dev/fieldpad`) own settings, the menu, overlays, lifecycle, location state, and notifications.
2. `embedded-agent.js` bridges those controls to the pinned Frida Java bridge and native modules.
3. `diagnostics/*.js` validate IL2CPP metadata before enabling version-specific behavior. Unity-thread work and short foreground/map leases gate gameplay operations.

`nonroot.py` injects the controls and runtime into a user-supplied original game package. `release_apk.py` assembles the supported ARM64 package set into a single signed APK. Game files are inputs, not repository source. Device monitoring and historical investigations are maintained outside the repository.

## Compatibility boundaries

- Preserve internal Java package names, serialized property names, signing identity, and asset paths unless implementing an explicit migration.
- Native fields, methods, byte signatures, and enums are version-specific. Missing contracts disable features rather than authorizing unknown writes.
- Preserve the 1,500 ms native startup grace and runtime exception propagation behavior. Earlier native failures require further device investigation; neither policy is proof of universal crash safety.
- Auto-transfer uses the exact caught ID and existing inventory entry. Unknown classification, favorites, eggs, and protected categories are kept. Size protection uses `PokemonCharacterSize(IGameMasterData)` and validated `Xxs`/`Xxl` enum constants.
- VGP issues one request at a time while on the map. It does not forge catch/spin responses. Unknown outcomes pause work instead of blindly retrying.
- Item cleanup uses configured inventory caps and pauses failed item requests. VGP waits for cleanup before selecting another target, with a bounded wait.
- UI markers are normalized projections of the active world target, not game-owned render objects. Camera/layout differences need device checks.

## Local data

Game inputs, generated APKs, credentials, device logs, coordinates, handoffs, and private investigation material must stay ignored or outside the checkout. Logs can contain personal location/account information; sanitize excerpts before sharing issues.
