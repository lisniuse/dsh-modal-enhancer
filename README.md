# dsh-modal-enhancer

[简体中文](README.zh.md) · English

A client-side Cordis plugin that gives every **DeepSeek Harness Web GUI** modal
window-like controls without changing the Harness source code.

## Features

- **Drag** — move a dialog by its dedicated top strip.
- **Eight-way resize** — resize from all four edges and four corners.
- **Pin / unpin** — a pinned dialog ignores clicks outside the window; its close
  button and `Escape` continue to work.
- **Maximize / restore** — fill the viewport with a small outer margin, then
  return to the previous rectangle.
- **Remove backdrop** — remove both the dim mask and backdrop blur. The dialog
  receives a light shadow so it remains visually separated from the page.
- **Per-dialog persistence** — position, width, height, maximized state, pinned
  state, and backdrop state survive modal remounts and browser restarts.
- **Master switch** — enable or disable the enhancer from
  **Settings → General → 弹窗增强**.

The plugin discovers dialogs through the stable accessibility contract
`[role="dialog"][aria-modal="true"]`; it does not depend on CSS-module hashes.
This covers Settings, workspace creation, model and agent-preset editors, risk
confirmations, and other Harness dialogs that use the same contract.

## Controls

| Control | Result |
| --- | --- |
| Top drag strip | Move the dialog |
| Four edges | Change width or height |
| Four corners | Change width and height together |
| Pushpin | Toggle outside-click dismissal |
| `⛶` / `❐` | Maximize / restore |
| `◐` / `◌` | Remove / restore the visual mask and blur |

Resize hit areas extend slightly across the dialog boundary for easier pointer
targeting. While maximized, drag and resize are disabled until the dialog is
restored.

## State persistence

Each dialog is identified by the first available value below:

1. `data-dshme-state-key`, when a dialog provides an explicit key;
2. `aria-label`;
3. text referenced by `aria-labelledby`;
4. the first heading inside the dialog.

State is stored in `localStorage` under the `dshme.dialog-state.v1:` prefix.
When restoring geometry on a different display or viewport size, the plugin
clamps the rectangle so that at least part of the dialog remains reachable.

Disabling or unloading the plugin removes injected controls, classes, event
listeners, and inline geometry from mounted dialogs. Saved state remains
available for the next time the enhancer is enabled.

## Installation

The complete distributable is [dist/plugin.js](dist/plugin.js). Pass its entire
contents as the `code.client` body of a dynamic `cordis_define` plugin. It is a
plain JavaScript function body beginning with `return { ... }`.

No Harness source modification, `pnpm install`, Web app rebuild, or server
restart is required. See [docs/install.md](docs/install.md) for the detailed
dynamic-plugin and agent-preset workflows.

After activation, approve the Client Package request if the Harness UI asks for
permission, then open any modal to verify that the toolbar and resize cursors
appear.

## How it works

The plugin:

1. injects scoped `.dshme-*` styles through the Client `styles` builtin;
2. observes `document.body` and enhances dialogs as React mounts them;
3. preserves horizontal host layouts such as the Settings navigation/content
   panel without reparenting React-owned nodes;
4. registers the master switch in the `settings.general.item` slot;
5. restores saved state independently for each identified dialog.

The transparent mask remains interactive when its visual backdrop is removed,
so modal behavior and accidental-click protection are preserved.

## Project structure

```text
dist/plugin.js                 Generated, single-file plugin body
src/plugin-body.js             Canonical self-contained source
src/enhancer.js                Readable modular runtime reference
src/settings.js                Readable settings-row reference
src/styles.css                 Readable stylesheet reference
scripts/build.js               Generates dist/plugin.js
scripts/layout-check.test.js   Layout, resize, pin, and persistence regression
scripts/syntax-check.js        JavaScript syntax smoke gate
docs/install.md                Detailed installation guide
README.zh.md                   Simplified Chinese documentation
```

## Development

Requires Node.js 18 or newer.

```sh
npm run build        # regenerate dist/plugin.js
npm test             # run layout and interaction regressions
npm run test:syntax  # parse every source and generated JS file
```

Before distributing a change, run all three commands and ensure
`dist/plugin.js` is committed with its source.

## Compatibility

- Target: DeepSeek Harness web client (`platform: 'web'`).
- Client capabilities: `ctx`, `React`, and `styles`, plus standard browser APIs.
- Settings slot: `settings.general.item` (`scope: root`, `kind: list`).
- Persistence: browser `localStorage`; no state is sent to a server.

## License

[MIT](LICENSE)
