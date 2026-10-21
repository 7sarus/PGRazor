# Contributing

Use small changes with a clear problem, expected behavior, and focused validation. Run `python -B tools/check.py`; Android UI changes also require `python -B pogo-prototype/build.py`. Include device observations separately from automated test results.

Do not submit game APKs/assets, signing keys, private logs, account details, or coordinates. The source artifact builder fails if generated/private files are Git-visible. Keep third-party provenance and license notices intact.

Native changes must validate metadata and preserve foreground/map leases, GC ownership, cancellation, and error handling. Destructive inventory automation must keep uncertain data and honor selected protection rules. Never use an automated test to spend balls, transfer live Pokémon, or change a user's inventory.

Internal identifiers retain the earlier `fieldpad` name for compatibility. New user-facing labels should say PGRazor. Changes to the supported game version need updated contracts and explicit device testing.

Private APK publishing is a maintainer operation, not a pull-request workflow. See [BUILDING.md](docs/BUILDING.md).
