# Third-party components

PGRazor's MIT license applies to its original code, not the following components or the original game.

- **Frida Gadget 17.24.2** is fetched from the [official Frida release](https://github.com/frida/frida/releases/tag/17.24.2) when explicitly requested, with GitHub-provided SHA-256 verification. It is not committed here. See [Frida's source and licenses](https://github.com/frida/frida).
- **frida-java-bridge**, distributed with frida-tools 14.10.4, is retained under `pgrazor/vendor/`. The local derivative reproduces upstream commit `302a588881b40cba300bcf3acfd35deeb3888ee5`. Upstream declares `LGPL-2.0 WITH WxWindows-exception-3.1`. The original bundle, exact patch script, hash provenance, distribution license, and [notice](pgrazor/vendor/NOTICE.txt) are included. Embedded dependency notices remain in the bundle.
- Android SDK build tools and the JDK are external build prerequisites and are not redistributed in source artifacts.
- Pokémon GO code, artwork, names, and assets remain with their respective rights holders. Original game builds are user-supplied private inputs. Selected map icons are copied unchanged and base-species names are extracted from [PokeMiners/pogo_assets](https://github.com/PokeMiners/pogo_assets); their pinned upstream paths and hashes are recorded in `pgrazor/assets/map-icons/provenance.json`. These images and names are game content, excluded from PGRazor's MIT license. The upstream repository attributes the artwork to The Pokémon Company and Niantic.

- Feed base-species sprites are copied unchanged from [PokeAPI/sprites](https://github.com/PokeAPI/sprites), pinned at `97a7832d307311c0e1c6ea9035308bf80cc94f81`. Paths and SHA-256 hashes are recorded in `pgrazor/assets/feed-icons/provenance.json`. Pokémon artwork belongs to its respective rights holders and is excluded from PGRazor's MIT license.
