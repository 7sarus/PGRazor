# Building PGRazor

## Requirements

The APK packaging toolchain currently supports Windows. Install Python 3.12+, Node.js 22+, JDK 17+, and the Android SDK. The Python build tools use the standard library.

Default SDK packages are `platforms;android-36.1` and `build-tools;36.1.0`. CI uses API 36 / Build Tools 36.0.0. Override them when needed:

```powershell
$env:ANDROID_HOME = 'C:\Android\Sdk'
$env:PGRAZOR_ANDROID_PLATFORM = 'android-36'
$env:PGRAZOR_BUILD_TOOLS = '36.0.0'
python -B tools/check.py
```

## Local playable build

Supply your own unmodified, Niantic-signed ARM64 game APK/APKM. The supported input is Pokémon GO 0.433.1, version code 2026101502. The private workflow additionally pins its SHA-256:

```text
aabe3f866bb20b008d10646d35615fe8845ad0164ddc5ac7984e1a5565836e53
```

Keep the original under the ignored `pogo-prototype/input/` directory. From the repository root:

```powershell
python -B pogo-prototype/nonroot.py --apk pogo-prototype/input/game.apkm --download-runtime --camera-steering --interaction-probe --quick-ball --quick-close
python -B pogo-prototype/release_apk.py --run pogo-prototype/build/nonroot/RUN-ID --output pogo-prototype/build/release
```

Use the run directory printed by the first command. The second command merges the library-only ARM64 configuration split, removes split-install requirements, labels the application PGRazor, aligns and signs **PGRazor.apk**, and writes checksums. It rejects resource/code splits rather than silently dropping them. No command installs anything on a phone.

Single-APK packaging is new and still needs a disconnected-phone install/launch check. Existing split builds remain available in the run directory as a rollback option. Preserve a tested installation until the new candidate has been checked.

## Signing

Local development retains the existing ignored `build/preview-debug.jks` key and alias `fieldpad`. Never delete it if you need to update previously installed builds. This local key uses a development password; use a dedicated strong-password keystore for a new release lineage.

For explicit signing, set `PGRAZOR_KEYSTORE`, `PGRAZOR_KEY_ALIAS`, `PGRAZOR_STORE_PASSWORD`, and `PGRAZOR_KEY_PASSWORD`. Passwords are passed to Android signing tools through environment variable references, not command-line values. A missing configured key or password fails the build. Keep the same certificate across updates.

The `build.py` output named `fieldpad-preview.apk` is a controls preview, **not the game**. Do not publish it as a working PGRazor release.

## GitHub Actions: private APK releases

The repository must be private. Configure these Actions secrets:

| Secret | Value |
| --- | --- |
| `PGRAZOR_INPUT_URL` | HTTPS URL to the private supported original APKM, or a GitHub release-asset API URL in this private repository |
| `PGRAZOR_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `PGRAZOR_KEY_ALIAS` | Signing alias, e.g. `fieldpad` for the existing development lineage |
| `PGRAZOR_STORE_PASSWORD` | Keystore password |
| `PGRAZOR_KEY_PASSWORD` | Private-key password |

For a private GitHub input asset, use its `https://api.github.com/repos/OWNER/REPO/releases/assets/ID` URL. The workflow supplies its scoped token; authorization is removed when GitHub redirects to the signed download host. Keep build-input releases private and remove them before any public visibility change.

Run **Actions → Private playable APK → Run workflow**, enter a version tag such as `v0.1.0`, and leave `publish` off for a candidate. Download **PGRazor-private-apk** from the completed run and extract **PGRazor.apk**. Repository read access is required to download private [workflow artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).

After device testing, run with `publish` enabled to create a private prerelease containing the APK, checksums, and build information. An existing tag/release is not overwritten. The workflow is manually triggered, does not run on pull requests, and both build and publish jobs check repository privacy. No secrets or game files are uploaded by source CI.

Before changing repository visibility, remove private releases/artifacts and review existing history; workflow guards prevent future public builds but cannot hide files already uploaded.

## Installation and updates

Install the single APK with Android's package installer, or use `adb install -r PGRazor.apk` from a computer. Never uninstall a working PGRazor build just to bypass a signing error; use a build signed with its existing key. An official-store game cannot be replaced in place by a differently signed build. Local application data may be lost if you choose to uninstall it.

The minimum SDK is Android 9 (API 28), but native gameplay hooks are supported only on the pinned ARM64 game build. No emulator, future-version, or all-device compatibility is implied.

## Retention

`cleanup.ps1` removes recognized obsolete generated APK files after packaging. It preserves diagnostic records, keys, inputs, and runtime dependencies. Copy `build-retention.example.json` to the ignored `build-retention.json` on a new checkout; packaging also initializes it if missing and pins the first completed candidate (not a tested rollback). Pin deployed builds and a tested rollback before replacing them. Never commit device-specific retention history.
