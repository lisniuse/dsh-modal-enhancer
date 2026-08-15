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
 *   - pin so outside clicks cannot dismiss the dialog
 *   - maximize to the full viewport and back
 *   - a removable blurred backdrop
 *
 * Geometry, once the user drags or resizes, is managed in viewport coordinates
 * (position:fixed + left/top/width/height) so resize never shifts the anchored
 * position and drag never fights the parent flex centering.
 */

/** Stable selector for a dsh web modal card. */
const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'
const DIALOG_STATE_PREFIX = 'dshme.dialog-state.v1:'

/**
 * Create the enhancement runtime for one page.
 * @param {object} config - enabled flags.
 * @returns {{ applyAll: () => void, dispose: () => void, startWatching: () => void }}
 */
export function createEnhancer(config) {
  const enhanced = new WeakSet()
  const disposers = []
  let observer = null
  // Bilingual copy; caller may supply its own translator, else English keys pass through.
  const DICT = {
    zh: {
      dragHandle: '⠿ 拖动', maximize: '最大化', restore: '还原',
      pin: '钉住弹窗', unpin: '取消钉住', removeBlur: '移除背景与模糊', restoreBlur: '恢复背景',
    },
    en: {
      dragHandle: '⠿ Drag', maximize: 'Maximize', restore: 'Restore',
      pin: 'Pin dialog', unpin: 'Unpin dialog', removeBlur: 'Remove backdrop and blur', restoreBlur: 'Restore backdrop',
    },
  }
  const t = typeof config.t === 'function'
    ? config.t
    : (key) => DICT.en[key] ?? key

  function createStateStore(dialog) {
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const labelledText = labelledBy === null
      ? ''
      : labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ')
    const identity = [
      dialog.getAttribute('data-dshme-state-key'),
      dialog.getAttribute('aria-label')?.trim(),
      labelledText,
      dialog.querySelector('h1,h2,h3,[role="heading"]')?.textContent?.trim(),
    ].find(value => typeof value === 'string' && value !== '') ?? ''
    const key = identity === '' ? null : `${DIALOG_STATE_PREFIX}${encodeURIComponent(identity)}`
    let value = {}
    if (key !== null) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}')
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed
      } catch {
        value = {}
      }
    }
    return {
      get value() { return value },
      update(patch) {
        value = { ...value, ...patch }
        if (key === null) return
        try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* best effort */ }
      },
    }
  }

  function snapshotRect(dialog) {
    const rect = dialog.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  function clampRect(rect) {
    const width = Math.max(220, Math.min(Number(rect.width) || 0, window.innerWidth))
    const height = Math.max(220, Math.min(Number(rect.height) || 0, window.innerHeight))
    return {
      width,
      height,
      left: Math.max(-width + 80, Math.min(Number(rect.left) || 0, window.innerWidth - 80)),
      top: Math.max(0, Math.min(Number(rect.top) || 0, window.innerHeight - 60)),
    }
  }

  function applyStoredState(dialog, state) {
    const rect = state.geometry
    if (rect !== null && typeof rect === 'object') {
      const { left, top, width, height } = clampRect(rect)
      dialog.classList.add('dshme-managed')
      dialog.style.left = `${Math.round(left)}px`
      dialog.style.top = `${Math.round(top)}px`
      dialog.style.width = `${Math.round(width)}px`
      dialog.style.height = `${Math.round(height)}px`
      dialog.style.transform = 'none'
    }
    if (state.maximized === true) dialog.classList.add('dshme-managed', 'dshme-maximized')
  }

  /** Preserve a horizontal host layout without reparenting React-owned nodes. */
  function adaptHorizontalLayout(dialog) {
    const computed = window.getComputedStyle(dialog)
    if (computed.display !== 'flex' || !computed.flexDirection.startsWith('row')) return () => {}

    const children = [...dialog.children]
    const originalMargins = children.map(child => [
      child,
      child.style.getPropertyValue('--dshme-original-margin-top'),
      child.style.getPropertyPriority('--dshme-original-margin-top'),
    ])
    for (const child of children) {
      const marginTop = window.getComputedStyle(child).marginTop
      child.style.setProperty('--dshme-original-margin-top', marginTop === 'auto' ? '0px' : marginTop)
    }
    dialog.classList.add('dshme-horizontal')

    return () => {
      dialog.classList.remove('dshme-horizontal')
      for (const [child, value, priority] of originalMargins) {
        if (value === '') child.style.removeProperty('--dshme-original-margin-top')
        else child.style.setProperty('--dshme-original-margin-top', value, priority)
      }
    }
  }

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

  function attachDrag(dialog, handle, stateStore) {
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
      stateStore.update({ geometry: snapshotRect(dialog), maximized: false })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    const onDown = (e) => {
      if (dialog.classList.contains('dshme-maximized')) return
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

  function attachResize(dialog, handle, dir, stateStore) {
    const onDown = (e) => {
      if (dialog.classList.contains('dshme-maximized')) return
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
        stateStore.update({ geometry: snapshotRect(dialog), maximized: false })
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointerdown', onDown)
    return () => handle.removeEventListener('pointerdown', onDown)
  }

  function attachMaximize(dialog, button, stateStore) {
    const storedRestore = stateStore.value.restore ?? stateStore.value.geometry
    let saved = storedRestore !== null && typeof storedRestore === 'object'
      ? clampRect(storedRestore)
      : snapshotRect(dialog)
    if (stateStore.value.maximized === true) {
      button.setAttribute('aria-pressed', 'true')
      button.title = t('restore')
      button.textContent = '❐'
    }
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
        button.title = t('maximize')
        button.textContent = '⛶'
        stateStore.update({ maximized: false, geometry: saved, restore: saved })
      } else {
        saved = snapshotRect(dialog)
        dialog.classList.add('dshme-managed', 'dshme-maximized')
        button.setAttribute('aria-pressed', 'true')
        button.title = t('restore')
        button.textContent = '❐'
        stateStore.update({ maximized: true, restore: saved })
      }
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  function attachPin(dialog, button, stateStore) {
    const overlay = dialog.parentElement
    if (stateStore.value.pinned === true) {
      button.setAttribute('aria-pressed', 'true')
      button.title = t('unpin')
      button.setAttribute('aria-label', button.title)
    }
    const onOutsideClick = (e) => {
      if (button.getAttribute('aria-pressed') !== 'true') return
      if (e.target === dialog || dialog.contains(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    const onToggle = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pinned = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(pinned))
      button.title = pinned ? t('unpin') : t('pin')
      button.setAttribute('aria-label', button.title)
      stateStore.update({ pinned })
    }
    button.addEventListener('click', onToggle)
    overlay?.addEventListener('click', onOutsideClick, true)
    return () => {
      button.removeEventListener('click', onToggle)
      overlay?.removeEventListener('click', onOutsideClick, true)
    }
  }

  function attachBlurless(dialog, button, stateStore) {
    const overlay = dialog.parentElement
    let mask = overlay !== null ? overlay.firstElementChild : null
    if (mask !== null && mask === dialog) {
      mask = overlay.querySelector('.dshme-blur-target')
    }
    if (stateStore.value.blurless === true) {
      button.setAttribute('aria-pressed', 'true')
      button.title = t('restoreBlur')
      button.textContent = '◌'
      if (mask !== null) mask.classList.add('dshme-blur-target')
      overlay?.setAttribute('data-dshme-blurless', 'true')
    }
    const onToggle = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const off = button.getAttribute('aria-pressed') === 'true'
      button.setAttribute('aria-pressed', String(!off))
      button.title = off ? t('restoreBlur') : t('removeBlur')
      button.textContent = off ? '◐' : '◌'
      if (mask !== null) mask.classList.toggle('dshme-blur-target', !off)
      if (overlay !== null) {
        if (off) overlay.removeAttribute('data-dshme-blurless')
        else overlay.setAttribute('data-dshme-blurless', 'true')
      }
      stateStore.update({ blurless: !off })
    }
    button.addEventListener('click', onToggle)
    return () => button.removeEventListener('click', onToggle)
  }

  /** Enhance one dialog node. */
  function enhance(dialog) {
    if (enhanced.has(dialog)) return
    enhanced.add(dialog)
    dialog.classList.add('dshme-dialog')
    const stateStore = createStateStore(dialog)
    const hasTitlebar = config.drag || config.pin || config.maximize || config.blurless
    const restoreLayout = hasTitlebar ? adaptHorizontalLayout(dialog) : () => {}
    const addedNodes = []
    const originalGeometry = new Map(
      ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform', 'position', 'margin']
        .map(name => [name, [dialog.style.getPropertyValue(name), dialog.style.getPropertyPriority(name)]]),
    )

    // Column dialogs receive a normal-flow row; horizontal dialogs keep their
    // host children in place and float this row over reserved top space.
    if (hasTitlebar) {
      const titlebar = document.createElement('div')
      titlebar.className = 'dshme-titlebar'
      titlebar.tabIndex = -1
      const handle = document.createElement('div')
      handle.className = 'dshme-draghandle'
      handle.textContent = t('dragHandle')
      titlebar.appendChild(handle)
      if (config.drag) disposers.push(attachDrag(dialog, handle, stateStore))
      if (config.pin || config.maximize || config.blurless) {
        const actions = document.createElement('div')
        actions.className = 'dshme-actions'
        if (config.pin) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dshme-btn'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = t('pin')
          btn.setAttribute('aria-label', t('pin'))
          btn.innerHTML = '<svg class="dshme-pin-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="dshme-pin-fill" d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6Z"/><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v6"/></svg>'
          btn.addEventListener('pointerdown', (e) => e.stopPropagation())
          disposers.push(attachPin(dialog, btn, stateStore))
          actions.appendChild(btn)
        }
        if (config.maximize) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dshme-btn'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = t('maximize')
          btn.textContent = '⛶'
          btn.addEventListener('pointerdown', (e) => e.stopPropagation())
          disposers.push(attachMaximize(dialog, btn, stateStore))
          actions.appendChild(btn)
        }
        if (config.blurless) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'dshme-btn'
          btn.setAttribute('aria-pressed', 'false')
          btn.title = t('removeBlur')
          btn.textContent = '◐'
          btn.addEventListener('pointerdown', (e) => e.stopPropagation())
          disposers.push(attachBlurless(dialog, btn, stateStore))
          actions.appendChild(btn)
        }
        titlebar.appendChild(actions)
      }
      dialog.insertBefore(titlebar, dialog.firstChild)
      addedNodes.push(titlebar)
    }

    if (config.resize) {
      const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
      for (const dir of dirs) {
        const handle = document.createElement('div')
        handle.className = `dshme-handle dshme-${dir}`
        dialog.appendChild(handle)
        addedNodes.push(handle)
        disposers.push(attachResize(dialog, handle, dir, stateStore))
      }
    }
    applyStoredState(dialog, stateStore.value)
    disposers.push(() => {
      for (const node of addedNodes) node.remove()
      restoreLayout()
      dialog.classList.remove('dshme-dialog', 'dshme-managed', 'dshme-maximized', 'dshme-dragging')
      for (const [name, [value, priority]] of originalGeometry) {
        if (value === '') dialog.style.removeProperty(name)
        else dialog.style.setProperty(name, value, priority)
      }
      const overlay = dialog.parentElement
      overlay?.removeAttribute('data-dshme-blurless')
      overlay?.querySelector('.dshme-blur-target')?.classList.remove('dshme-blur-target')
    })
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
