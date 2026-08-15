/*
 * dsh-modal-enhancer — self-contained Client plugin body
 *
 * This file is the complete `code.client` body for Deploy DeepSeek Harness's
 * `cordis_define`: a plain-JavaScript function that returns a Cordis Plugin.
 * It is fully self-contained (no imports) so it can be pasted verbatim as the
 * Client half of a dynamic plugin or stored in an agent preset. All logic is
 * inlined here; `src/enhancer.js`, `src/settings.js` and `src/styles.css` are
 * the readable modular equivalents and `scripts/build.js` assembles them into
 * this single body.
 *
 * Features on every dsh web modal (`[role="dialog"][aria-modal="true"]`):
 *   - draggable title-bar strip
 *   - resizable edges and corners
 *   - maximize / restore
 *   - removable blurred backdrop
 *   - a General-settings row that toggles the whole enhancer on/off (persisted)
 *
 * The file body uses only Client Builtins (`ctx`, `React`, `styles`) and
 * standard browser APIs available in the page (`document`, `window`,
 * `MutationObserver`, `localStorage`, `Element`), so it works in the current
 * dsh web client without a build step.
 */
return {
  inject: ['slots'],
  apply(ctx) {
    // Master config; `enabled` gates everything, the rest are per-feature toggles.
    const enhancerConfig = {
      enabled: readEnabled(),
      drag: true,
      resize: true,
      maximize: true,
      blurless: true,
    }

    /* -------- styles -------- */
    const CSS = String.raw`
.dshme-dialog .dshme-titlebar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 14px 0 24px;min-height:34px;flex:none;-webkit-user-select:none;user-select:none;z-index:3}
.dshme-dialog .dshme-titlebar .dshme-draghandle{flex:1;align-self:stretch;cursor:move;cursor:grab;touch-action:none;display:flex;align-items:center;color:var(--dsw-alias-label-secondary,#878787);font-size:12px}
.dshme-dialog.dshme-dragging .dshme-draghandle{cursor:grabbing}
.dshme-dialog .dshme-titlebar .dshme-actions{display:flex;align-items:center;gap:4px;flex:none}
.dshme-dialog .dshme-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#878787);cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,color .12s ease}
.dshme-dialog .dshme-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));color:var(--dsw-alias-label-primary,#1f2329)}
.dshme-dialog .dshme-btn[aria-pressed='true']{color:var(--dsw-alias-interactive-primary,#2563eb)}
.dshme-dialog .dshme-handle{position:absolute;z-index:2;touch-action:none}
.dshme-handle.dshme-n{top:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}
.dshme-handle.dshme-s{bottom:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}
.dshme-handle.dshme-e{right:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}
.dshme-handle.dshme-w{left:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}
.dshme-handle.dshme-ne{top:-5px;right:-5px;width:14px;height:14px;cursor:nesw-resize}
.dshme-handle.dshme-nw{top:-5px;left:-5px;width:14px;height:14px;cursor:nwse-resize}
.dshme-handle.dshme-se{bottom:-5px;right:-5px;width:14px;height:14px;cursor:nwse-resize}
.dshme-handle.dshme-sw{bottom:-5px;left:-5px;width:14px;height:14px;cursor:nesw-resize}
/* When geometry is actively managed (dragged/resized), switch the card to a
   fixed rect measured in viewport coordinates so size and position never fight
   the parent flex centering. */
.dshme-dialog.dshme-managed{position:fixed!important;margin:0!important}
.dshme-dialog.dshme-maximized{position:fixed!important;margin:0!important;top:12px!important;left:12px!important;right:12px!important;bottom:12px!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;transform:none!important}
[data-dshme-blurless='true'] .dshme-blur-target{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
`

    const disposeStyles = styles.insert(CSS)

    /* -------- enhancement runtime (inlined) -------- */
    const DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'
    const STORAGE_KEY = 'dshme.enabled'
    let enhanced = new WeakSet()
    let observer = null

    function readEnabled() {
      try {
        const value = localStorage.getItem(STORAGE_KEY)
        if (value === null) return true
        return value === 'true'
      } catch {
        return true
      }
    }
    function writeEnabled(enabled) {
      try {
        localStorage.setItem(STORAGE_KEY, String(enabled))
      } catch {
        /* best-effort persistence */
      }
    }

    /* Switch a dialog from the parent's flex-centered layout to a fixed,
       viewport-coordinate rect so drag/resize manage geometry directly and the
       two can no longer fight the flex re-centering. Returns the current rect. */
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

    /* Drag the card by its title-bar handle. */
    function attachDrag(dialog, handle) {
      let drag = null
      const onMove = (e) => {
        if (drag === null) return
        const left = drag.baseLeft + (e.clientX - drag.startX)
        const top = drag.baseTop + (e.clientY - drag.startY)
        // Keep the card's top edge reachable; clamp loosely to the viewport.
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

    /* Resize from edge/corner handles, keeping the opposite edge anchored so
       only the requested size changes — never the position. */
    function attachResize(dialog, handle, dir) {
      const onDown = (e) => {
        e.preventDefault(); e.stopPropagation()
        const r = toManaged(dialog)
        const startX = e.clientX, startY = e.clientY
        const startLeft = r.left, startTop = r.top
        const startW = r.width, startH = r.height
        const maxW = window.innerWidth, maxH = window.innerHeight
        const min = 220
        const onMove = (ev) => {
          const dx = ev.clientX - startX, dy = ev.clientY - startY
          let left = startLeft, top = startTop, width = startW, height = startH
          if (dir.includes('e')) width = startW + dx
          if (dir.includes('s')) height = startH + dy
          if (dir.includes('w')) { width = startW - dx; left = startLeft + dx }
          if (dir.includes('n')) { height = startH - dy; top = startTop + dy }
          // Clamp size to a sane minimum and the viewport while keeping the
          // anchored edge(s) fixed.
          if (width < min) { if (dir.includes('w')) left -= (min - width); width = min }
          if (height < min) { if (dir.includes('n')) top -= (min - height); height = min }
          width = Math.min(width, maxW); height = Math.min(height, maxH)
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
        e.preventDefault(); e.stopPropagation()
        const isMax = dialog.classList.contains('dshme-maximized')
        if (isMax) {
          // Restore: return to the (managed) rect captured before maximizing.
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
          // Maximize: capture current rect, then pin the card across the viewport.
          saved = { left: 0, top: 0, width: 0, height: 0 }
          const r = dialog.getBoundingClientRect()
          saved.left = r.left; saved.top = r.top; saved.width = r.width; saved.height = r.height
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
        e.preventDefault(); e.stopPropagation()
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

    const disposers = []
    function enhance(dialog) {
      if (enhanced.has(dialog)) return
      enhanced.add(dialog)
      dialog.classList.add('dshme-dialog')

      // A dedicated titlebar row lives in normal flow (its own line) so our
      // controls never overlap the native close button / title chrome.
      if (enhancerConfig.drag || enhancerConfig.maximize || enhancerConfig.blurless) {
        const titlebar = document.createElement('div')
        titlebar.className = 'dshme-titlebar'
        titlebar.tabIndex = -1
        const handle = document.createElement('div')
        handle.className = 'dshme-draghandle'
        handle.textContent = '⠿ 拖动'
        titlebar.appendChild(handle)
        if (enhancerConfig.drag) {
          disposers.push(attachDrag(dialog, handle))
        }
        if (enhancerConfig.maximize || enhancerConfig.blurless) {
          const actions = document.createElement('div')
          actions.className = 'dshme-actions'
          if (enhancerConfig.maximize) {
            const btn = document.createElement('button')
            btn.type = 'button'; btn.className = 'dshme-btn'
            btn.setAttribute('aria-pressed', 'false'); btn.title = 'Maximize'; btn.textContent = '⛶'
            btn.addEventListener('pointerdown', (e) => e.stopPropagation())
            disposers.push(attachMaximize(dialog, btn))
            actions.appendChild(btn)
          }
          if (enhancerConfig.blurless) {
            const btn = document.createElement('button')
            btn.type = 'button'; btn.className = 'dshme-btn'
            btn.setAttribute('aria-pressed', 'false'); btn.title = 'Remove backdrop blur'; btn.textContent = '◐'
            btn.addEventListener('pointerdown', (e) => e.stopPropagation())
            disposers.push(attachBlurless(dialog, btn))
            actions.appendChild(btn)
          }
          titlebar.appendChild(actions)
        }
        // Insert before the modal's own content so the native header stays intact.
        dialog.insertBefore(titlebar, dialog.firstChild)
      }
      if (enhancerConfig.resize) {
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
            if (node.matches(DIALOG_SELECTOR)) { enhance(node); continue }
            node.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
          }
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    function rebuild() {
      // Remove prior per-node glue so a toggle reflects immediately.
      for (let i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
      disposers.length = 0
      // A WeakSet has no clear(); replace it so a toggle re-enhances from scratch.
      enhanced = new WeakSet()
      if (observer !== null) { observer.disconnect(); observer = null }
      if (enhancerConfig.enabled) startWatching()
    }

    // Own the enhancement lifecycle on the plugin fiber so stop/update tears it down.
    ctx.effect(() => {
      rebuild()
      return () => {
        for (let i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
        disposers.length = 0
        if (observer !== null) { observer.disconnect(); observer = null }
        disposeStyles()
      }
    })

    /* -------- settings row (inlined React component) -------- */
    function onMasterToggle(enabled) {
      enhancerConfig.enabled = enabled
      rebuild()
    }

    const SettingsRow = () => {
      const [enabled, setEnabled] = React.useState(enhancerConfig.enabled)
      const toggle = () => {
        const next = !enabled
        setEnabled(next)
        writeEnabled(next)
        onMasterToggle(next)
      }
      return React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' } },
        React.createElement(
          'div',
          null,
          React.createElement(
            'div',
            { style: { fontSize: '14px', lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary,#1f2329)' } },
            '弹窗增强',
          ),
          React.createElement(
            'div',
            { style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#878787)' } },
            '弹窗可拖动、缩放、最大化，并支持移除背景模糊',
          ),
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': enabled,
            onClick: toggle,
            style: {
              width: '40px', height: '22px', flex: 'none', border: 'none',
              borderRadius: '11px', position: 'relative', cursor: 'pointer',
              background: enabled ? 'var(--dsw-alias-interactive-primary,#2563eb)' : 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.3))',
              transition: 'background .15s ease',
            },
          },
          React.createElement('span', {
            style: {
              position: 'absolute', top: '2px', left: enabled ? '20px' : '2px',
              width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
              transition: 'left .15s ease',
            },
          }),
        ),
      )
    }

    /* Register the settings row into the General section. */
    ctx.slots.inject('settings.general.item', () => ctx.slots.register(
      { name: 'settings.general.item', id: 'dsh-modal-enhancer' },
      SettingsRow,
    ))
  },
}
