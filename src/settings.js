/*
 * dsh-modal-enhancer — settings row
 *
 * Registers one preference row into the DSH web "General" settings section
 * (slot `settings.general.item`). The row exposes a single master toggle that
 * turns the whole enhancer on or off. The choice is persisted to
 * localStorage (`dshme.enabled`) so it survives page reloads without needing
 * a host-backed durable store; the plugin entry applies it on boot.
 */

const STORAGE_KEY = 'dshme.enabled'

/** Read the persisted preference; defaults to enabled when unset. */
export function readEnabled() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === null) return true
    return value === 'true'
  } catch {
    return true
  }
}

/** Persist the master-toggle preference. */
export function writeEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    /* localStorage may be unavailable (privacy mode); the session default
       still applies, persistence is best-effort. */
  }
}

/**
 * Create the settings-row React component for a general-item slot.
 *
 * The component reads only PropsRuntime + host-provided `useStore`/`onChange`
 * (optional). To keep the distributed shape free of compiler transforms we
 * build plain createElement trees and read props instead of JSX.
 *
 * @param {object} deps - runtime handles the plugin entry supplies.
 * @param {boolean} deps.enabled - current master-switch value.
 * @param {function} deps.onChange - change handler the row calls on toggle.
 * @returns {object} a React component the plugin registers into the slot.
 */
export function createSettingsRow(deps) {
  const t = typeof deps.t === 'function' ? deps.t : (key) => {
    const DICT = {
      zh: { settingsTitle: '弹窗增强', settingsDesc: '弹窗可拖动、缩放、最大化，并支持移除背景模糊' },
      en: { settingsTitle: 'Modal Enhancer', settingsDesc: 'Drag, resize, maximize, and remove backdrop blur on modals' },
    }
    return DICT.zh[key] ?? key
  }
  return function EnhancerSettingsRow(props) {
    // `props.useStore` is provided by the renderer for store-enabled slots;
    // fall back to the deps value when absent.
    const current = props.useStore !== undefined
      ? props.useStore((s) => s.enabled)
      : deps.enabled
    const toggle = () => {
      const next = !current
      writeEnabled(next)
      if (deps.onChange !== undefined) deps.onChange(next)
      if (props.actions !== undefined && props.actions.setEnabled !== undefined) {
        props.actions.setEnabled(next)
      }
    }

    return React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' } },
      React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: { fontSize: '14px', lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary, #1f2329)' } },
          t('settingsTitle'),
        ),
        React.createElement(
          'div',
          { style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #878787)' } },
          t('settingsDesc'),
        ),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': current,
          onClick: toggle,
          style: {
            width: '40px',
            height: '22px',
            flex: 'none',
            border: 'none',
            borderRadius: '11px',
            background: current ? 'var(--dsw-alias-interactive-primary, #2563eb)' : 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.3))',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background .15s ease',
          },
        },
        React.createElement('span', {
          style: {
            position: 'absolute',
            top: '2px',
            left: current ? '20px' : '2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .15s ease',
          },
        }),
      ),
    )
  }
}
