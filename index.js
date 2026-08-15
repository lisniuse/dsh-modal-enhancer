/**
 * dsh-modal-enhancer — Node (host) half.
 *
 * This package is a browser-only, runtime-enhancing client plugin: every piece
 * of behavior lives in the client half (client.js), which upgrades all dsh web
 * modals to be draggable, resizable, pinnable, and maximizable, with a
 * removable backdrop blur and per-dialog persistent state.
 *
 * The host half is intentionally empty — it exists only so the package mounts
 * cleanly as a dual-plane cordis bundle. No services, events, or tools are
 * contributed on the Node side.
 *
 * @author lisniuse
 * License: MIT
 */

/** Plugin id (package name). */
export const name = 'dsh-modal-enhancer'

/**
 * Host apply: a no-op. All behavior is in the browser half.
 */
export function apply() {}
