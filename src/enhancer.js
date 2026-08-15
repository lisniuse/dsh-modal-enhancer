/*
 * dsh-modal-enhancer — runtime behavior (readable reference)
 *
 * This module mirrors the logic inlined in `src/plugin-body.js` for readability;
 * the authoritative, distributable code lives there and in `dist/plugin.js`.
 * Do not diverge the two.
 *
 * The enhancer upgrades every dsh web modal card (stable contract
 * `[role="dialog"][aria-modal="true"]`) with:
 *   - a dedicated titlebar row (its own line, so it never overlaps native chrome)
 *   - drag via the titlebar handle
 *   - resize via 8 edge/corner handles
 *   - maximize to the full viewport and back
 *   - a removable blurred backdrop
 *
 * Geometry, once the user drags or resizes, is managed in viewport coordinates
 * (position:fixed + left/top/width/height) so resize never shifts the anchored
 * position and drag never fights the parent flex centering.
 */

/** Stable selector for a dsh web modal card. */
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'

/**
 * Create the enhancement runtime for one page.
 * @param {object} config - enabled flags.
 * @returns {{ applyAll: () => void, dispose: () => void, startWatching: () => void }}
 */
export function createEnhancer(config) {
  const enhanced = new WeakSet()
  const disposers = []
  let observer = null

  /**
   * Switch a dialog from the parent's flex-centered layout to a fixed,
   * viewport-coordinate rect. Returns the current rect.
   */
  function toManaged(dialog) {
    if (!dialog.classList.contains('dshme-managed')) {
      const r = dialog.getBoundingClientRect()
      dialog.classList.add('dshme-managed')
      dialog.style.left = `${r.left}px`
      dialog.style.top = `${r.top}px`
      dialog.style.width = `${r.width}px`
      dialog.style.height = `${r.height}px`
      dialog.style.transform = 'none'
    }
    return dialog.getBoundingClientRect()
  }

  function attachDrag(dialog, handle) {
    let drag = null
    const onMove = (e) => {
      if (drag === null) return
      const left = drag.baseLeft + (e.clientX - drag.startX)
      const top = drag.baseTop + (e.clientY - drag.startY)
      dialog.style.left = `${Math.round(Math.max(-drag.w + 80, Math.min(left, window.innerWidth - 80)))}px`
      dialog.style.top = `${Math.round(Math.max(0, Math.min(top, window.innerHeight - 60)))}px`
    }
    const onUp = () => {
      if (drag === null) return
      drag = null
      dialog.classList.remove('dshme-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    const onDown = (e) => {
      if (e.target.closest('.dshme-actions') !== null) return
      const r = toManaged(dialog)
      drag = { baseLeft: r.left, baseTop: r.top, startX: e.clientX, startY: e.clientY, w: r.width }
      e.preventDefault()
      dialog.classList.add('dshme-dragging')
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointerdown', onDown)
    return () => {
      handle.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }

  function attachResize(dialog, handle, dir) {
    const onDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const r = toManaged(dialog)
      const startX = e.clientX
      const startY = e.clientY
      const startLeft = r.left
      const startTop = r.top
      const startW = r.width
      const startH = r.height
      const maxW = window.innerWidth
      const maxH = window.innerHeight
      const min = 220

      const onMove = (ev) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let left = startLeft
        let top = startTop
        let width = startW
        let height = startH
        if (dir.includes('e')) width = startW + dx
        if (dir.includes('s')) height = startH + dy
        if (dir.includes('w')) { width = startW - dx; left = startLeft + dx }
        if (dir.includes('n')) { height = startH - dy; top = startTop + dy }
        if (width < min) { if (dir.includes('w')) left -= (min - width); width = min }
        if (height < min) { if (dir.includes('n')) top -= (min - height); height = min }
        width = Math.min(width, maxW)
        height = Math.min(height, maxH)
        dialog.style.left = `${Math.round(left)}px`
        dialog.style.top = `${Math.round(top)}px`
        dialog.style.width = `${Math.round(width)}px`
        dialog.style.height = `${Math.round(height)}px`
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointerdown', onDown)
    return () => handle.removeEventListener('pointerdown', onDown)
  }

  function attachMaximize(dialog, button) {
    let saved = null
    const onToggle = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const isMax = dialog.classList.contains('dshme-maximized')
      if (isMax) {
        dialog.classList.remove('dshme-maximized')
        if (saved !== null) {
          dialog.classList.add('dshme-managed')
          dialog.style.left = `${saved.left}px`
          dialog.style.top = `${saved.top}px`
          dialog.style.width = `${saved.width}px`
          dialog.style.height = `${saved.height}px`
        }
        button.setAttribute('aria-pressed', 'false')
        button.title = 'Maximize'
        button.textContent = '⛶'
      } else {
        const r = dialog.getBoundingClientRect()
        saved = { left: r.left, top: r.top, width: r.width, height: r.height }
        dialog.classList.add('dshme-managed', 'dshme-maximized')
        button.setAttribute('aria-pressed', 'true')
        button.title = 'Restore'
        button.textContent = '❐'
      }
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  function attachBlurless(dialog, button) {
    const overlay = dialog.parentElement
    let mask = overlay !== null ? overlay.firstElementChild : null
    if (mask !== null && mask === dialog) {
      mask = overlay.querySelector('.dshme-blur-target')
    }
    const onToggle = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const off = button.getAttribute('aria-pressed') === 'true'
      button.setAttribute('aria-pressed', String(!off))
      button.title = off ? 'Blur backdrop' : 'Remove backdrop blur'
      button.textContent = off ? '◐' : '◌'
      if (mask !== null) mask.classList.toggle('dshme-blur-target', !off)
      if (overlay !== null) {
        if (off) overlay.removeAttribute('data-dshme-blurless')
        else overlay.setAttribute('data-dshme-blurless', 'true')
      }
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  /** Enhance one dialog node. */
  function enhance(dialog) {
    if (enhanced.has(dialog)) return
    enhanced.add(dialog)
    dialog.classList.add('dshme-dialog')

    if (config.drag || config.maximize || config.blurless) {
      const titlebar = document.createElement('div')
      titlebar.className = 'dshme-titlebar'
      titlebar.tabIndex = -1
      const handle = document.createElement('div')
      handle.className = 'dshme-draghandle'
      handle.textContent = '⠿ 拖动'
      titlebar.appendChild(handle)
      if (config.drag) disposers.push(attachDrag(dialog, handle))
      if (config.maximize || config.blurless) {
        const actions = document.createElement('div')
        actions.className = 'dshme-actions'
        if (config.maximize) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dshme-btn'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = 'Maximize'
          btn.textContent = '⛶'
          btn.addEventListener('pointerdown', (e) => e.stopPropagation())
          disposers.push(attachMaximize(dialog, btn))
          actions.appendChild(btn)
        }
        if (config.blurless) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dshme-btn'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = 'Remove backdrop blur'
          btn.textContent = '◐'
          btn.addEventListener('pointerdown', (e) => e.stopPropagation())
          disposers.push(attachBlurless(dialog, btn))
          actions.appendChild(btn)
        }
        titlebar.appendChild(actions)
      }
      dialog.insertBefore(titlebar, dialog.firstChild)
    }

    if (config.resize) {
      const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      for (const dir of dirs) {
        const handle = document.createElement('div')
        handle.className = `dshme-handle dshme-${dir}`
        dialog.appendChild(handle)
        disposers.push(attachResize(dialog, handle, dir))
      }
    }
  }

  function applyAll() {
    document.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
  }

  function startWatching() {
    applyAll()
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.matches(DIALOG_SELECTOR)) enhance(node)
          else node.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  function dispose() {
    for (let i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
    disposers.length = 0
    if (observer !== null) observer.disconnect()
    observer = null
  }

  return { applyAll, dispose, startWatching }
}
