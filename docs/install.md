# Installation

`dsh-modal-enhancer` is a **Client-side dynamic Cordis plugin** for Deploy Deep
Seek Harness. There are two ways to run it: pasting the single-file body into a
`cordis_define` call, or embedding it as a session agent preset. Both need no
build and no shell change.

## Prerequisites

- A running DeepSeek Harness Web GUI (the page this plugin enhances).
- A session that can call `cordis_define` (an agent running the dynamic-Cordis
  tool set) — or a preset composed from the shipped `cordis` profile.

## Method 1 — dynamic plugin in a running session (recommended for trying it)

1. Open a session in the web GUI.
2. Pass the **entire content of `dist/plugin.js`** as the `code.client` of a
   `cordis_define` call. It is a single JavaScript function body starting with
   `return { ... }` that returns the Client plugin.
3. Actually running it requires the client half to be accepted: the plugin
   registers a Client Package, which asks for your approval in the UI. Approve
   it (single check mark) to run just this version.
4. Refresh or just wait for the client to activate. Open any modal
   (e.g. Settings, or create a workspace) — you will see a draggable top strip,
   edge/corner resize handles, and a toolbar with `⛶` and `◐` buttons.

The master switch is under **Settings → General → 弹窗增强**.

## Method 2 — agent preset (persistent for a session)

Create a preset directory and mount the plugin so every new session of that
preset runs it. Concretely:

1. Create `${DSH_HOME}/.agent-presets/<id>/` (e.g.
   `${HOME}/.dsh/.agent-presets/modal-enhancer/`).
2. Add a `cordis.yml` that includes a dynamic client plugin row whose
   `client` field is the content of `dist/plugin.js` (as a Cordis function
   plugin). See the deployment's preset primer for the exact row shape.
3. Mount that preset for the session you want enhanced, then open a modal.

> Guidance: this plugin is purely additive Client-side behavior. If you mount it
> as a preset, keep it as its own row and do **not** fold it into the shipped
> `cordis` preset—edits to shipped presets are overwritten on upgrade.

## Verifying it is live

Open any modal and check for the enhancement affordances:

- A transparent drag strip across the top of the card (try dragging the title).
- Resize cursors when hovering the card edges / corners.
- Two small buttons in the top-right corner of the card: `⛶` (maximize) and
  `◐` (remove backdrop blur).
- The General settings row titled **弹窗增强** with a switch.

If nothing appears, confirm the client half activated without a render error by
inspecting the plugin run diagnostics in the UI.

## Rebuilding the single-file body

```sh
node scripts/build.js          # regenerates dist/plugin.js from src/plugin-body.js
node scripts/syntax-check.js   # smoke-gate all sources
```

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Modal has no affordances | Client half did not activate; approve the run, or check run diagnostics |
| Settings row missing | `settings.general.item` did not mount; ensure the row id/name did not collide |
| Features already on by default | The master switch defaults to enabled; turn it off in General settings |
| Drag conflicts with a native control in the card | The drag strip is only the top band; treat top edge as the handle |
