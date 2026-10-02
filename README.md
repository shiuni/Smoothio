# Smoothio

A custom easing panel for After Effects.

This is a versatile easing script that can be used in any production, featuring capabilities such as creating easing graphs with three or more intermediate points and importing graphs from existing keyframes into the panel.

## Features

- **Curve editor** — drag a bezier curve with as many midpoints as you need. `+` and `−` add and remove points, **Invert Graph** flips the curve, and `0` resets it to linear.
- **Import Ease** reads the easing off the selected keyframes and loads it into the editor, so an ease you like becomes a preset instead of something you rebuild.
- **Presets** — save a curve, and it appears as a thumbnail you click to apply. Presets are stored as files on disk, and can be exported and imported to move between machines or share with others; import offers merge or overwrite on a name clash.
- **Separate Dimensions** applies the curve per axis rather than to the property as a whole.
- **Pop-out editor** opens the curve in its own window when the docked panel is too cramped, and a separate **Settings** window covers preset size, save location, and panel layout (auto, vertical or horizontal).

## Setup

**Install.** Download a release, run the bundled installer, and restart After Effects. The panel appears under **Window ▸ Extensions ▸ Smoothio**. Releases are signed, so CEP `PlayerDebugMode` is not needed. Each release also ships a `.zxp` for ZXP installers.

**Develop.** The panel is React and TypeScript built with webpack. Clone the repository, then:

| Command | |
| --- | --- |
| `npm install` | install dependencies |
| `npm run build` | production build |
| `npm run dev` | development build, rebuilt on change |
| `npm run package` | build and sign a distributable ZXP |

For After Effects 2023 and later.

## License

Licensed under the Apache License 2.0 — see [LICENSE](LICENSE).
