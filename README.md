# PGRazor (Fork)

This fork builds and ships the Zygisk root module (`PGRazor-Root-module.zip`) and its companion installer (`PGRazor-Root.apk`).

## Changes from upstream

- Release workflows build only the Zygisk module and root installer; non-root APK packaging is disabled.
- Root and native builds ship only the `arm64-v8a` binary; the `x86_64` binary is omitted, so MuMu and other `x86_64` emulators are not supported.
- CI and release jobs run on `ubuntu-latest` instead of `windows-latest`, and the Python build scripts locate Android SDK tools on both Linux and Windows without hardcoded `.bat` or `.exe` names.
- Pushes to `feature/**` and `pr/**` trigger the release workflow and stamp the branch name and short commit SHA into the version string.
- Community links in Settings and the release footer point to [Telegram](https://t.me/devvdump) instead of Discord.

## Root installation

You need an `arm64-v8a` rooted Android device running KernelSU, APatch, or Magisk with Zygisk enabled.

1. Download `PGRazor-Root.apk` and `PGRazor-Root-module.zip` from [Releases](../../releases).
2. Flash `PGRazor-Root-module.zip` in KernelSU (`ksud module install PGRazor-Root-module.zip`) or Magisk, then reboot.
3. Install `PGRazor-Root.apk` to manage service status and account switching.
4. Launch the target app. The overlay appears once the module attaches to the game process.

## Building

### Prerequisites

- Android SDK (`platforms;android-36`, `build-tools;36.0.0`)
- JDK 17+
- Python 3.12+ and Node.js 22+
- Pinned Android NDKs (`27.3.13750724` and `29.0.14206865`)
- CMake `4.4.4` and Ninja `1.13.2`

### Build commands

Run the test and schema suite:

```bash
python -B tools/check.py
```

Build the root module and companion installer against an unmodified game APK or APKM:

```bash
python -B pgrazor/rooted.py <path-to-target-apkm>
```

`pgrazor/rooted.py` writes outputs under `pgrazor/build/rooted/<timestamp>/`.

## Repository layout

```text
.github/workflows/       CI and release automation
docs/                    Technical notes and release logs
pgrazor/src/             Java controls and overlay views
pgrazor/native/          C++ gameplay core and hooks
pgrazor/art/             ART bridge routines
pgrazor/zygisk/          Zygisk loader
pgrazor/root-installer/  Companion root installer APK
pgrazor/test/            Unit and integration test suites
tools/                   Build, verification, and packaging scripts
```

## License

Available under the [MIT License](LICENSE). Third-party dependencies keep their own licenses. This project is independent and has no affiliation with the game publisher.
