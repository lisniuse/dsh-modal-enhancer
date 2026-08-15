/**
 * dsh-modal-enhancer — browser (client) half.
 *
 * Upgrades every dsh web modal card (stable contract
 * `[role="dialog"][aria-modal="true"]`) at runtime:
 *   - a dedicated titlebar row (so our controls never overlap native chrome)
 *   - drag via the titlebar handle
 *   - eight-way resize (edges + corners)
 *   - pin, so outside clicks cannot dismiss the dialog
 *   - maximize to the full viewport and back
 *   - a removable backdrop blur
 *   - per-dialog persistent state (geometry / maximized / pinned / blurless),
 *     keyed by dialog identity in localStorage
 * and registers a "General settings" row that toggles the whole enhancer.
 *
 * This is the DUAL-PLANE form packaged for `dsh plugin add github:...`: the
 * bundle registers through `window.__ModuleLoader__.load` and resolves React
 * from the platform module table, exactly like other shippable dsh client
 * plugins. The single-file dynamic form remains available in dist/plugin.js.
 *
 * @author lisniuse
 * License: MIT
 */

window.__ModuleLoader__.load({
  id: 'dsh-modal-enhancer',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')

    var CSS = [
      '.dshme-dialog .dshme-titlebar{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:0 14px 0 24px;min-height:34px;flex:none;-webkit-user-select:none;user-select:none;z-index:3}',
      '.dshme-dialog.dshme-horizontal>.dshme-titlebar{position:absolute;inset:0 0 auto}',
      '.dshme-dialog.dshme-horizontal>:not(.dshme-titlebar):not(.dshme-handle){margin-top:calc(var(--dshme-original-margin-top,0px) + 34px)!important}',
      '.dshme-dialog .dshme-titlebar .dshme-draghandle{flex:1 1 auto;min-width:0;margin-right:auto;align-self:stretch;cursor:move;cursor:grab;touch-action:none;display:flex;align-items:center;color:var(--dsw-alias-label-secondary,#878787);font-size:12px}',
      '.dshme-dialog.dshme-dragging .dshme-draghandle{cursor:grabbing}',
      '.dshme-dialog .dshme-titlebar .dshme-actions{display:flex;align-items:center;gap:4px;flex:0 0 auto;margin-left:0}',
      '.dshme-dialog .dshme-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#878787);cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,color .12s ease}',
      '.dshme-dialog .dshme-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));color:var(--dsw-alias-label-primary,#1f2329)}',
      '.dshme-dialog .dshme-btn[aria-pressed="true"]{color:var(--dsw-alias-interactive-primary,#2563eb)}',
      '.dshme-dialog .dshme-pin-icon{display:block;width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
      '.dshme-dialog .dshme-pin-fill{fill:transparent;stroke:none;transition:fill .12s ease}',
      '.dshme-dialog .dshme-btn[aria-pressed="true"] .dshme-pin-fill{fill:currentColor;opacity:.2}',
      '.dshme-dialog .dshme-handle{position:absolute;z-index:5;touch-action:none}',
      '.dshme-handle.dshme-n{top:-6px;left:16px;right:16px;height:12px;cursor:ns-resize}',
      '.dshme-handle.dshme-s{bottom:-6px;left:16px;right:16px;height:12px;cursor:ns-resize}',
      '.dshme-handle.dshme-e{right:-6px;top:16px;bottom:16px;width:12px;cursor:ew-resize}',
      '.dshme-handle.dshme-w{left:-6px;top:16px;bottom:16px;width:12px;cursor:ew-resize}',
      '.dshme-handle.dshme-ne{top:-8px;right:-8px;width:20px;height:20px;cursor:nesw-resize}',
      '.dshme-handle.dshme-nw{top:-8px;left:-8px;width:20px;height:20px;cursor:nwse-resize}',
      '.dshme-handle.dshme-se{bottom:-8px;right:-8px;width:20px;height:20px;cursor:nwse-resize}',
      '.dshme-handle.dshme-sw{bottom:-8px;left:-8px;width:20px;height:20px;cursor:nesw-resize}',
      '.dshme-dialog.dshme-managed{position:fixed!important;margin:0!important}',
      '.dshme-dialog.dshme-maximized{position:fixed!important;margin:0!important;top:12px!important;left:12px!important;right:12px!important;bottom:12px!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;transform:none!important}',
      '[data-dshme-blurless="true"] .dshme-blur-target{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
      '[data-dshme-blurless="true"] .dshme-dialog{box-shadow:0 10px 28px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.1)!important}',
    ].join('\n')

    var DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'
    var STORAGE_KEY = 'dshme.enabled'
    var DIALOG_STATE_PREFIX = 'dshme.dialog-state.v1:'

    exports.inject = ['slots']

    exports.apply = function (ctx) {
      var enhancerConfig = {
        enabled: readEnabled(),
        drag: true,
        resize: true,
        pin: true,
        maximize: true,
        blurless: true,
      }

      // Owned stylesheet, cleaned up with the plugin fiber.
      ctx.effect(function () {
        var styleEl = document.createElement('style')
        styleEl.setAttribute('data-plugin-css', 'dsh-modal-enhancer')
        styleEl.textContent = CSS
        document.head.appendChild(styleEl)
        return function () { styleEl.remove() }
      }, 'dsh-modal-enhancer: styles')

      var enhanced = new WeakSet()
      var observer = null

      function createStateStore(dialog) {
        var labelledBy = dialog.getAttribute('aria-labelledby')
        var labelledText = labelledBy === null
          ? ''
          : labelledBy.split(/\s+/).map(function (id) {
              var el = document.getElementById(id)
              return el !== null && el.textContent !== null ? el.textContent.trim() : ''
            }).filter(Boolean).join(' ')
        var identity = [
          dialog.getAttribute('data-dshme-state-key'),
          dialog.getAttribute('aria-label') !== null ? dialog.getAttribute('aria-label').trim() : '',
          labelledText,
          (function () {
            var h = dialog.querySelector('h1,h2,h3,[role="heading"]')
            return h !== null && h.textContent !== null ? h.textContent.trim() : ''
          })(),
        ].find(function (value) { return typeof value === 'string' && value !== '' }) || ''
        var key = identity === '' ? null : DIALOG_STATE_PREFIX + encodeURIComponent(identity)
        var value = {}
        if (key !== null) {
          try {
            var parsed = JSON.parse(localStorage.getItem(key) || '{}')
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed
          } catch (e) { value = {} }
        }
        return {
          get value() { return value },
          update: function (patch) {
            value = Object.assign({}, value, patch)
            if (key === null) return
            try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { /* best effort */ }
          },
        }
      }

      function snapshotRect(dialog) {
        var rect = dialog.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }

      function clampRect(rect) {
        var width = Math.max(220, Math.min(Number(rect.width) || 0, window.innerWidth))
        var height = Math.max(220, Math.min(Number(rect.height) || 0, window.innerHeight))
        return {
          width: width,
          height: height,
          left: Math.max(-width + 80, Math.min(Number(rect.left) || 0, window.innerWidth - 80)),
          top: Math.max(0, Math.min(Number(rect.top) || 0, window.innerHeight - 60)),
        }
      }

      function applyStoredState(dialog, state) {
        var rect = state.geometry
        if (rect !== null && typeof rect === 'object') {
          var c = clampRect(rect)
          dialog.classList.add('dshme-managed')
          dialog.style.left = Math.round(c.left) + 'px'
          dialog.style.top = Math.round(c.top) + 'px'
          dialog.style.width = Math.round(c.width) + 'px'
          dialog.style.height = Math.round(c.height) + 'px'
          dialog.style.transform = 'none'
        }
        if (state.maximized === true) dialog.classList.add('dshme-managed', 'dshme-maximized')
      }

      function adaptHorizontalLayout(dialog) {
        var computed = window.getComputedStyle(dialog)
        if (computed.display !== 'flex' || computed.flexDirection.indexOf('row') !== 0) return function () {}
        var children = Array.prototype.slice.call(dialog.children)
        var originalMargins = children.map(function (child) {
          return [
            child,
            child.style.getPropertyValue('--dshme-original-margin-top'),
            child.style.getPropertyPriority('--dshme-original-margin-top'),
          ]
        })
        children.forEach(function (child) {
          var marginTop = window.getComputedStyle(child).marginTop
          child.style.setProperty('--dshme-original-margin-top', marginTop === 'auto' ? '0px' : marginTop)
        })
        dialog.classList.add('dshme-horizontal')
        return function () {
          dialog.classList.remove('dshme-horizontal')
          originalMargins.forEach(function (entry) {
            var child = entry[0]; var value = entry[1]; var priority = entry[2]
            if (value === '') child.style.removeProperty('--dshme-original-margin-top')
            else child.style.setProperty('--dshme-original-margin-top', value, priority)
          })
        }
      }

      function toManaged(dialog) {
        if (!dialog.classList.contains('dshme-managed')) {
          var r = dialog.getBoundingClientRect()
          dialog.classList.add('dshme-managed')
          dialog.style.left = r.left + 'px'
          dialog.style.top = r.top + 'px'
          dialog.style.width = r.width + 'px'
          dialog.style.height = r.height + 'px'
          dialog.style.transform = 'none'
        }
        return dialog.getBoundingClientRect()
      }

      function attachDrag(dialog, handle, stateStore) {
        var drag = null
        function onMove(e) {
          if (drag === null) return
          var left = drag.baseLeft + (e.clientX - drag.startX)
          var top = drag.baseTop + (e.clientY - drag.startY)
          dialog.style.left = Math.round(Math.max(-drag.w + 80, Math.min(left, window.innerWidth - 80))) + 'px'
          dialog.style.top = Math.round(Math.max(0, Math.min(top, window.innerHeight - 60))) + 'px'
        }
        function onUp() {
          if (drag === null) return
          drag = null
          dialog.classList.remove('dshme-dragging')
          stateStore.update({ geometry: snapshotRect(dialog), maximized: false })
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        function onDown(e) {
          if (dialog.classList.contains('dshme-maximized')) return
          if (e.target.closest('.dshme-actions') !== null) return
          var r = toManaged(dialog)
          drag = { baseLeft: r.left, baseTop: r.top, startX: e.clientX, startY: e.clientY, w: r.width }
          e.preventDefault()
          dialog.classList.add('dshme-dragging')
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }
        handle.addEventListener('pointerdown', onDown)
        return function () {
          handle.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
      }

      function attachResize(dialog, handle, dir, stateStore) {
        function onDown(e) {
          if (dialog.classList.contains('dshme-maximized')) return
          e.preventDefault(); e.stopPropagation()
          var r = toManaged(dialog)
          var startX = e.clientX, startY = e.clientY
          var startLeft = r.left, startTop = r.top, startW = r.width, startH = r.height
          var maxW = window.innerWidth, maxH = window.innerHeight, min = 220
          function onMove(ev) {
            var dx = ev.clientX - startX, dy = ev.clientY - startY
            var left = startLeft, top = startTop, width = startW, height = startH
            if (dir.indexOf('e') !== -1) width = startW + dx
            if (dir.indexOf('s') !== -1) height = startH + dy
            if (dir.indexOf('w') !== -1) { width = startW - dx; left = startLeft + dx }
            if (dir.indexOf('n') !== -1) { height = startH - dy; top = startTop + dy }
            if (width < min) { if (dir.indexOf('w') !== -1) left -= (min - width); width = min }
            if (height < min) { if (dir.indexOf('n') !== -1) top -= (min - height); height = min }
            width = Math.min(width, maxW); height = Math.min(height, maxH)
            dialog.style.left = Math.round(left) + 'px'
            dialog.style.top = Math.round(top) + 'px'
            dialog.style.width = Math.round(width) + 'px'
            dialog.style.height = Math.round(height) + 'px'
          }
          function onUp() {
            stateStore.update({ geometry: snapshotRect(dialog), maximized: false })
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', onUp)
        }
        handle.addEventListener('pointerdown', onDown)
        return function () { handle.removeEventListener('pointerdown', onDown) }
      }

      function attachMaximize(dialog, button, stateStore) {
        var storedRestore = stateStore.value.restore !== undefined ? stateStore.value.restore : stateStore.value.geometry
        var saved = storedRestore !== null && typeof storedRestore === 'object'
          ? clampRect(storedRestore)
          : snapshotRect(dialog)
        if (stateStore.value.maximized === true) {
          button.setAttribute('aria-pressed', 'true'); button.title = 'Restore'; button.textContent = '❐'
        }
        function onToggle(e) {
          e.preventDefault(); e.stopPropagation()
          var isMax = dialog.classList.contains('dshme-maximized')
          if (isMax) {
            dialog.classList.remove('dshme-maximized')
            if (saved !== null) {
              dialog.classList.add('dshme-managed')
              dialog.style.left = saved.left + 'px'
              dialog.style.top = saved.top + 'px'
              dialog.style.width = saved.width + 'px'
              dialog.style.height = saved.height + 'px'
            }
            button.setAttribute('aria-pressed', 'false'); button.title = 'Maximize'; button.textContent = '⛶'
            stateStore.update({ maximized: false, geometry: saved, restore: saved })
          } else {
            saved = snapshotRect(dialog)
            dialog.classList.add('dshme-managed', 'dshme-maximized')
            button.setAttribute('aria-pressed', 'true'); button.title = 'Restore'; button.textContent = '❐'
            stateStore.update({ maximized: true, restore: saved })
          }
        }
        button.addEventListener('click', onToggle)
        return function () { button.removeEventListener('click', onToggle) }
      }

      function attachPin(dialog, button, stateStore) {
        var overlay = dialog.parentElement
        if (stateStore.value.pinned === true) {
          button.setAttribute('aria-pressed', 'true'); button.title = 'Unpin dialog'
          button.setAttribute('aria-label', button.title)
        }
        function onOutsideClick(e) {
          if (button.getAttribute('aria-pressed') !== 'true') return
          if (e.target === dialog || dialog.contains(e.target)) return
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
        }
        function onToggle(e) {
          e.preventDefault(); e.stopPropagation()
          var pinned = button.getAttribute('aria-pressed') !== 'true'
          button.setAttribute('aria-pressed', String(pinned))
          button.title = pinned ? 'Unpin dialog' : 'Pin dialog'
          button.setAttribute('aria-label', button.title)
          stateStore.update({ pinned: pinned })
        }
        button.addEventListener('click', onToggle)
        if (overlay !== null) overlay.addEventListener('click', onOutsideClick, true)
        return function () {
          button.removeEventListener('click', onToggle)
          if (overlay !== null) overlay.removeEventListener('click', onOutsideClick, true)
        }
      }

      function attachBlurless(dialog, button, stateStore) {
        var overlay = dialog.parentElement
        var mask = overlay !== null ? overlay.firstElementChild : null
        if (mask !== null && mask === dialog) mask = overlay.querySelector('.dshme-blur-target')
        if (stateStore.value.blurless === true) {
          button.setAttribute('aria-pressed', 'true'); button.title = 'Restore backdrop'; button.textContent = '◌'
          if (mask !== null) mask.classList.add('dshme-blur-target')
          if (overlay !== null) overlay.setAttribute('data-dshme-blurless', 'true')
        }
        function onToggle(e) {
          e.preventDefault(); e.stopPropagation()
          var off = button.getAttribute('aria-pressed') === 'true'
          button.setAttribute('aria-pressed', String(!off))
          button.title = off ? 'Restore backdrop' : 'Remove backdrop and blur'
          button.textContent = off ? '◐' : '◌'
          if (mask !== null) mask.classList.toggle('dshme-blur-target', !off)
          if (overlay !== null) {
            if (off) overlay.removeAttribute('data-dshme-blurless')
            else overlay.setAttribute('data-dshme-blurless', 'true')
          }
          stateStore.update({ blurless: !off })
        }
        button.addEventListener('click', onToggle)
        return function () { button.removeEventListener('click', onToggle) }
      }

      var disposers = []
      function enhance(dialog) {
        if (enhanced.has(dialog)) return
        enhanced.add(dialog)
        dialog.classList.add('dshme-dialog')
        var stateStore = createStateStore(dialog)
        var hasTitlebar = enhancerConfig.drag || enhancerConfig.pin || enhancerConfig.maximize || enhancerConfig.blurless
        var restoreLayout = hasTitlebar ? adaptHorizontalLayout(dialog) : function () {}
        var addedNodes = []
        var originalGeometry = new Map(
          ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform', 'position', 'margin']
            .map(function (name) { return [name, [dialog.style.getPropertyValue(name), dialog.style.getPropertyPriority(name)]] }),
        )

        if (hasTitlebar) {
          var titlebar = document.createElement('div')
          titlebar.className = 'dshme-titlebar'
          titlebar.tabIndex = -1
          var handle = document.createElement('div')
          handle.className = 'dshme-draghandle'
          handle.textContent = '⠿ 拖动'
          titlebar.appendChild(handle)
          if (enhancerConfig.drag) disposers.push(attachDrag(dialog, handle, stateStore))
          if (enhancerConfig.pin || enhancerConfig.maximize || enhancerConfig.blurless) {
            var actions = document.createElement('div')
            actions.className = 'dshme-actions'
            if (enhancerConfig.pin) {
              var pinBtn = document.createElement('button')
              pinBtn.type = 'button'; pinBtn.className = 'dshme-btn'
              pinBtn.setAttribute('aria-pressed', 'false'); pinBtn.title = 'Pin dialog'
              pinBtn.setAttribute('aria-label', 'Pin dialog')
              pinBtn.innerHTML = '<svg class="dshme-pin-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="dshme-pin-fill" d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6Z"/><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v6"/></svg>'
              pinBtn.addEventListener('pointerdown', function (e) { e.stopPropagation() })
              disposers.push(attachPin(dialog, pinBtn, stateStore))
              actions.appendChild(pinBtn)
            }
            if (enhancerConfig.maximize) {
              var maxBtn = document.createElement('button')
              maxBtn.type = 'button'; maxBtn.className = 'dshme-btn'
              maxBtn.setAttribute('aria-pressed', 'false'); maxBtn.title = 'Maximize'; maxBtn.textContent = '⛶'
              maxBtn.addEventListener('pointerdown', function (e) { e.stopPropagation() })
              disposers.push(attachMaximize(dialog, maxBtn, stateStore))
              actions.appendChild(maxBtn)
            }
            if (enhancerConfig.blurless) {
              var blurBtn = document.createElement('button')
              blurBtn.type = 'button'; blurBtn.className = 'dshme-btn'
              blurBtn.setAttribute('aria-pressed', 'false'); blurBtn.title = 'Remove backdrop and blur'; blurBtn.textContent = '◐'
              blurBtn.addEventListener('pointerdown', function (e) { e.stopPropagation() })
              disposers.push(attachBlurless(dialog, blurBtn, stateStore))
              actions.appendChild(blurBtn)
            }
            titlebar.appendChild(actions)
          }
          dialog.insertBefore(titlebar, dialog.firstChild)
          addedNodes.push(titlebar)
        }
        if (enhancerConfig.resize) {
          var dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
          dirs.forEach(function (dir) {
            var h = document.createElement('div')
            h.className = 'dshme-handle dshme-' + dir
            dialog.appendChild(h)
            addedNodes.push(h)
            disposers.push(attachResize(dialog, h, dir, stateStore))
          })
        }
        applyStoredState(dialog, stateStore.value)
        disposers.push(function () {
          addedNodes.forEach(function (node) { node.remove() })
          restoreLayout()
          dialog.classList.remove('dshme-dialog', 'dshme-managed', 'dshme-maximized', 'dshme-dragging')
          originalGeometry.forEach(function (entry, name) {
            var value = entry[0]; var priority = entry[1]
            if (value === '') dialog.style.removeProperty(name)
            else dialog.style.setProperty(name, value, priority)
          })
          var overlay = dialog.parentElement
          if (overlay !== null) {
            overlay.removeAttribute('data-dshme-blurless')
            var mask = overlay.querySelector('.dshme-blur-target')
            if (mask !== null) mask.classList.remove('dshme-blur-target')
          }
        })
      }

      function applyAll() {
        document.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
      }

      function startWatching() {
        applyAll()
        observer = new MutationObserver(function (records) {
          records.forEach(function (record) {
            for (var i = 0; i < record.addedNodes.length; i++) {
              var node = record.addedNodes[i]
              if (!(node instanceof Element)) continue
              if (node.matches(DIALOG_SELECTOR)) enhance(node)
              else node.querySelectorAll(DIALOG_SELECTOR).forEach(enhance)
            }
          })
        })
        observer.observe(document.body, { childList: true, subtree: true })
      }

      function rebuild() {
        for (var i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
        disposers.length = 0
        enhanced = new WeakSet()
        if (observer !== null) { observer.disconnect(); observer = null }
        if (enhancerConfig.enabled) startWatching()
      }

      ctx.effect(function () {
        rebuild()
        return function () {
          for (var i = disposers.length - 1; i >= 0; i -= 1) disposers[i]()
          disposers.length = 0
          if (observer !== null) { observer.disconnect(); observer = null }
        }
      }, 'dsh-modal-enhancer: lifecycle')

      function onMasterToggle(enabled) {
        enhancerConfig.enabled = enabled
        rebuild()
      }

      var SettingsRow = function () {
        var state = react.useState(enhancerConfig.enabled)
        var enabled = state[0]; var setEnabled = state[1]
        function toggle() {
          var next = !enabled
          setEnabled(next)
          writeEnabled(next)
          onMasterToggle(next)
        }
        return react.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' } },
          react.createElement('div', null,
            react.createElement('div', { style: { fontSize: '14px', lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary,#1f2329)' } }, '弹窗增强'),
            react.createElement('div', { style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary,#878787)' } }, '弹窗可拖动、缩放、最大化、钉住，并支持移除背景模糊'),
          ),
          react.createElement('button', {
            type: 'button', role: 'switch', 'aria-checked': enabled, onClick: toggle,
            style: {
              width: '40px', height: '22px', flex: 'none', border: 'none', borderRadius: '11px', position: 'relative', cursor: 'pointer',
              background: enabled ? 'var(--dsw-alias-interactive-primary,#2563eb)' : 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.3))',
              transition: 'background .15s ease',
            },
          }, react.createElement('span', {
            style: {
              position: 'absolute', top: '2px', left: enabled ? '20px' : '2px',
              width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left .15s ease',
            },
          })),
        )
      }

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({ name: 'settings.general.item', id: 'dsh-modal-enhancer' }, SettingsRow)
      })
    }

    function readEnabled() {
      try {
        var v = localStorage.getItem(STORAGE_KEY)
        if (v === null) return true
        return v === 'true'
      } catch (e) { return true }
    }
    function writeEnabled(enabled) {
      try { localStorage.setItem(STORAGE_KEY, String(enabled)) } catch (e) { /* best effort */ }
    }

    return module.exports
  },
})
