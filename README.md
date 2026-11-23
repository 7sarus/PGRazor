# PGRazor (Fork)

An opinionated fork of [PGRazor](https://github.com/jpitty03/PGRazor) focused on root-based location overlays, directional joystick gestures, and clean integration.

This fork maintains the Zygisk root module and companion installer app. Non-root packaging is currently disabled.

## Overview

The mod adds on-screen overlays to the target application:
- Joystick with directional hold-to-lock and continuous steering
- Location spoofing with customizable speeds and route playback
- In-game settings panel with dark and light themes
- Coordinate bookmarking and search

## Installation (Root)

This build requires a rooted Android device running KernelSU, APatch, or Magisk with a Zygisk implementation.

1. Download `PGRazor-Root.apk` and `PGRazor-Root-module.zip` from [Releases](../../releases).
2. Install the module through your root manager:
   - KernelSU: flash the ZIP in the Modules tab, or run `ksud module install PGRazor-Root-module.zip`.
   - Magisk: install the ZIP in the Magisk app and reboot.
3. Install `PGRazor-Root.apk` to manage service status and account switching.
4. Launch the target app. The overlay appears once the module binds to the game process.

## Building

### Prerequisites

- Android SDK (platform android-36, build-tools 36.0.0, platforms;android-36)
- JDK 17
- Python 3.12+
- Pinned Android NDKs (27.3.13750724 and 29.0.14206865)
- CMake 4.4.4 and Ninja

### Build commands

Run regression and schema tests:
```bash
python -B tools/check.py
```

Build the root module and companion installer:
```bash
python -B pgrazor/rooted.py <path-to-target-apkm>
```

Output files are written to `pgrazor/build/rooted/<timestamp>/`.

## Repository layout

```text
.github/workflows/    CI and build automation
docs/                 Technical notes and release logs
pgrazor/src/          Java controls and overlay views
pgrazor/native/       Core C++ runtime and hooks
pgrazor/art/          ART bridge routines
pgrazor/zygisk/       Zygisk injection loader
pgrazor/root-installer/ Companion root installer APK
pgrazor/test/         Unit and integration test suites
tools/                Build, verification, and packaging tools
```

## License

Available under the [MIT License](LICENSE). Third-party dependencies retain their own licenses. This project is an independent modification and has no affiliation with any application developer or publisher.
