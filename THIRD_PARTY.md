# Third-party components

PGRazor's MIT license applies to its original code, not the following components or the original game.

- **Frida Gadget 17.24.2** is fetched from the [official Frida release](https://github.com/frida/frida/releases/tag/17.24.2) when explicitly requested, with GitHub-provided SHA-256 verification. It is not committed here. See [Frida's source and licenses](https://github.com/frida/frida).
- **frida-java-bridge**, distributed with frida-tools 14.10.4, is retained under `pogo-prototype/vendor/`. The local derivative reproduces upstream commit `302a588881b40cba300bcf3acfd35deeb3888ee5`. Upstream declares `LGPL-2.0 WITH WxWindows-exception-3.1`. The original bundle, exact patch script, hash provenance, distribution license, and [notice](pogo-prototype/vendor/NOTICE.txt) are included. Embedded dependency notices remain in the bundle.
- Android SDK build tools and the JDK are external build prerequisites and are not redistributed in source artifacts.
- Pokémon GO code, artwork, names, and assets remain with their respective rights holders. They are user-supplied private build inputs, not licensed as PGRazor source.
