# dsh-modal-enhancer

Enhance every **DeepSeek Harness Web GUI** modal/dialog with window-like behavior:

- **可拖动** — drag the modal by its title-bar strip.
- **可缩放** — resize from any edge or corner.
- **可最大化** — expand / restore to a large centered size.
- **可移除模糊背景** — toggle the backdrop blur on/off.
- **独立设置项开关** — a General-settings row turns the whole enhancer on/off.

It applies globally to **all** dsh web modals — the create-workspace dialog, model
settings, agent-preset dialogs, risk confirmations, risk/session confirmations —
because it hooks the stable role/aria contract every modal card shares
(`[role="dialog"][aria-modal="true"]`), never CSS-module hashed class names.
This keeps it working across shell versions.

## How it works

This is a **Client-side Cordis plugin** for Deploy DeepSeek Harness. It:

1. Injects package-owned CSS via the `styles` builtin.
2. Watches `document.body` with a `MutationObserver` and enhances every mounted
   modal card as React (re)mounts the portal on each open.
3. Registers a **General settings row** (slot `settings.general.item`) with a
   master switch, persisted to `localStorage` so the choice survives reloads.

No host changes, no build step, no server restart.

## Feature overview

| Feature | Enabled by | Control |
| --- | --- | --- |
| Draggable title bar | master switch | drag the top strip of the card |
| Resizable edges & corners | master switch | drag any edge / corner / the 8 handles |
| Maximize / restore | master switch | toolbar button `⛶` (top-right of the card) |
| Remove backdrop blur | master switch | toolbar button `◐` (top-right of the card) |
| Per-dialog toggle-persistence | always (auto) | settings persist across reloads |

The master switch lives in **Settings → General → 弹窗增强**.

## Files

```
dist/plugin.js        The single-file plugin body — paste this into cordis_define
src/plugin-body.js    Source of the single-file body (readable, canonical)
src/enhancer.js       Modular enhancement runtime (reference)
src/settings.js       Modular settings row (reference)
src/styles.css        Modular stylesheet (reference)
scripts/build.js      Assembles dist/plugin.js from src/plugin-body.js
scripts/syntax-check.js   Parses every source file as a smoke gate
docs/install.md       Step-by-step installation guide
```

## Usage / installation

The quick way (agent-driven) is documented in [docs/install.md](docs/install.md).
You can also load it as a dynamic plugin in your running harness:

```js
// code.client = the content of dist/plugin.js
// the body starts with `return { ... }` and returns a Cordis Plugin object
```

Because this is a **dynamic Client plugin**, it needs no `pnpm install`, no
rebuild of `apps/web`, and no shell changes — run it and refresh.

> Note on the app shell rebuild: if you develop against this repo and change
> shell code, you must rebuild `apps/web`. This plugin makes **no** changes to
> the shell — it is purely additive at runtime, so no rebuild is needed for it.

## Development

```sh
node scripts/build.js          # rebuild dist/plugin.js
node scripts/syntax-check.js   # smoke-gate all JS sources
```

## Compatibility

- Targets the dsh web **client** (`platform: 'web'`), built with the
  `cordis-plugin-development` capabilities (`ctx`, `React`, `styles`) plus
  standard browser APIs (`document`, `window`, `MutationObserver`,
  `localStorage`, `Element`).
- Provides the settings row by registering into `settings.general.item`
  (scope `root`, kind `list`).

## License

MIT
