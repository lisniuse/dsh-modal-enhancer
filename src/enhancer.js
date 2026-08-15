/*
 * dsh-modal-enhancer — runtime behavior
 *
 * The enhancer upgrades every dsh web modal card to be movable, resizable,
 * maximizable, and to have a removable blurred backdrop. It deliberately
 * targets the DOM by the stable role/aria contract the product renders on
 * every modal (`[role="dialog"][aria-modal="true"]`), never CSS-module hashed
 * classes, so it keeps working across shell versions.
 *
 * Lifecycle: the plugin entry starts `start()` and stops `stop()`. Each
 * runtime observes `document.body` for newly mounted dialogs (React remounts
 * the portal on every open) and (re)applies the enhancement. A WeakSet guards
 * against double enhancement of a surviving node. All browser listeners
 * created here are returned as disposers so the plugin run can tear them down.
 */

/** Stable selector for a dsh web modal card. */
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'

/**
 * Create the enhancement runtime for one page.
 * @param {object} config - enabled flags, each true to activate the feature.
 * @param {boolean} config.drag
 * @param {boolean} config.resize
 * @param {boolean} config.maximize
 * @param {boolean} config.blurless
 * @returns {{ applyAll: () => void, dispose: () => void }}
 */
export function createEnhancer(config) {
  /** Enhanced dialogs, so a surviving node is not enhanced twice. */
  const enhanced = new WeakSet()
  const disposers = []
  let observer = null

  /* ---------------------------------------------------------------
   * Drag handling on the title-bar strip
   * ---------------------------------------------------------------
   * The modal is centered by its fixed flex overlay. Moving via translate
   * lets us drag a centered dialog without fighting the flex layout; each
   * new drag replaces the previous transform so repeated drags stay relative
   * to the current position.
   */
  function attachDrag(dialog, strip) {
    let startX = 0
    let startY = 0
    let offsetX = 0
    let offsetY = 0
    let drag = null

    const onMove = (e) => {
      if (drag === null) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      offsetX = drag.baseX + dx
      offsetY = drag.baseY + dy
      dialog.style.transform = `translate(${offsetX}px, ${offsetY}px)`
    }

    const onUp = () => {
      if (drag === null) return
      drag = null
      dialog.classList.remove('dshme-dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    const onDown = (e) => {
      // Ignore toolbar clicks inside the strip so controls keep working.
      if (e.target.closest('.dshme-toolbar') !== null) return
      drag = {
        baseX: offsetX,
        baseY: offsetY,
      }
      startX = e.clientX
      startY = e.clientY
      e.preventDefault()
      dialog.classList.add('dshme-dragging')
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    strip.addEventListener('pointerdown', onDown)
    return () => {
      strip.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }

  /* ---------------------------------------------------------------
   * Resize handling on the edge/corner handles
   * --------------------------------------------------------------- */
  function attachResize(dialog, handle, dir) {
    const onDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const rect = dialog.getBoundingClientRect()
      const startWidth = rect.width
      const startHeight = rect.height
      const maxW = window.innerWidth
      const maxH = window.innerHeight

      const onMove = (ev) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let width = startWidth
        let height = startHeight

        if (dir.includes('e')) width = Math.min(startWidth + dx, maxW)
        if (dir.includes('w')) width = Math.min(startWidth - dx, maxW)
        if (dir.includes('s')) height = Math.min(startHeight + dy, maxH)
        if (dir.includes('n')) height = Math.min(startHeight - dy, maxH)

        // Keep a sane minimum so a corner drag cannot collapse the dialog.
        const min = 220
        width = Math.max(width, min)
        height = Math.max(height, min)

        dialog.style.width = `${Math.round(width)}px`
        dialog.style.height = `${Math.round(height)}px`
        dialog.style.maxWidth = 'none'
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

  /* ---------------------------------------------------------------
   * Maximize / restore
   * --------------------------------------------------------------- */
  function attachMaximize(dialog, button) {
    const onToggle = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const maximized = dialog.classList.toggle('dshme-maximized')
      button.setAttribute('aria-pressed', String(maximized))
      button.title = maximized ? 'Restore' : 'Maximize'
      button.textContent = maximized ? '❐' : '⛶'
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  /* ---------------------------------------------------------------
   * Clear / restore the blurred backdrop
   * --------------------------------------------------------------- */
  function attachBlurless(dialog, button) {
    const overlay = dialog.parentElement
    // The mask is the first child of the fixed overlay (.root renders the
    // mask, then the dialog). Fall back to a broad match inside the overlay.
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
      if (mask !== null) {
        mask.classList.toggle('dshme-blur-target', !off)
      }
      if (overlay !== null) {
        if (off) overlay.removeAttribute('data-dshme-blurless')
        else overlay.setAttribute('data-dshme-blurless', 'true')
      }
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  /* ---------------------------------------------------------------
   * Enhance one dialog node
   * --------------------------------------------------------------- */
  function enhance(dialog) {
    if (enhanced.has(dialog)) return
    enhanced.add(dialog)
    dialog.classList.add('dshme-dialog')

    // Drag strip (only when drag is enabled).
    if (config.drag) {
      const strip = document.createElement('div')
      strip.className = 'dshme-dragstrip'
      dialog.appendChild(strip)
      disposers.push(attachDrag(dialog, strip))
    }

    // Toolbar with maximize + blurless toggles.
    if (config.maximize || config.blurless) {
      const toolbar = document.createElement('div')
      toolbar.className = 'dshme-toolbar'
      toolbar.tabIndex = -1
      if (config.maximize) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'dshme-btn'
        btn.setAttribute('aria-pressed', 'false')
        btn.title = 'Maximize'
        btn.textContent = '⛶'
        btn.addEventListener('pointerdown', (e) => e.stopPropagation())
        disposers.push(attachMaximize(dialog, btn))
        toolbar.appendChild(btn)
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
        toolbar.appendChild(btn)
      }
      dialog.appendChild(toolbar)
    }

    // Resize handles.
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

  /** Start watching the live document for newly mounted dialogs. */
  function startWatching() {
    applyAll()
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.matches(DIALOG_SELECTOR)) {
            enhance(node)
            continue
          }
          node.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  /** Enhance every dialog already on the page. */
  function applyAll() {
    document.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
  }

  /** Stop every effect and tear the observer down. */
  function dispose() {
    if (observer !== null) observer.disconnect()
    observer = null
    for (let i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
    disposers.length = 0
  }

  return { applyAll, dispose, startWatching }
}
