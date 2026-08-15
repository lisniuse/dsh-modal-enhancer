import assert from 'node:assert/strict'
import test from 'node:test'
import { createEnhancer } from '../src/enhancer.js'

class FakeStyle {
  values = new Map()
  priorities = new Map()
  setProperty(name, value, priority = '') { this.values.set(name, String(value)); this.priorities.set(name, priority) }
  getPropertyValue(name) { return this.values.get(name) ?? '' }
  getPropertyPriority(name) { return this.priorities.get(name) ?? '' }
  removeProperty(name) { this.values.delete(name); this.priorities.delete(name) }
  set display(value) { this.setProperty('display', value) }
  set flexDirection(value) { this.setProperty('flex-direction', value) }
  set flexWrap(value) { this.setProperty('flex-wrap', value) }
  set alignItems(value) { this.setProperty('align-items', value) }
  set alignContent(value) { this.setProperty('align-content', value) }
  set justifyContent(value) { this.setProperty('justify-content', value) }
  set rowGap(value) { this.setProperty('row-gap', value) }
  set columnGap(value) { this.setProperty('column-gap', value) }
}

class FakeClassList {
  values = new Set()
  add(...values) { values.forEach(value => this.values.add(value)) }
  remove(...values) { values.forEach(value => this.values.delete(value)) }
  contains(value) { return this.values.has(value) }
  toggle(value, force) { if (force) this.add(value); else this.remove(value) }
}

class FakeElement {
  constructor(name = 'div') {
    this.name = name
    this.children = []
    this.parentElement = null
    this.style = new FakeStyle()
    this.classList = new FakeClassList()
    this.attributes = new Map()
    this.listeners = new Map()
  }
  get firstChild() { return this.children[0] ?? null }
  get firstElementChild() { return this.firstChild }
  set className(value) { this.classList.values = new Set(value.split(/\s+/).filter(Boolean)) }
  get className() { return [...this.classList.values].join(' ') }
  appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child }
  insertBefore(child, before) { child.remove(); child.parentElement = this; const index = before === null ? this.children.length : this.children.indexOf(before); this.children.splice(index, 0, child); return child }
  remove() { if (this.parentElement === null) return; const index = this.parentElement.children.indexOf(this); if (index >= 0) this.parentElement.children.splice(index, 1); this.parentElement = null }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(value => value !== listener)) }
  dispatch(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  contains(target) { return target === this || this.children.some(child => child.contains(target)) }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null
    const className = selector.slice(1)
    for (const child of this.children) {
      if (child.classList.contains(className)) return child
      const nested = child.querySelector(selector)
      if (nested !== null) return nested
    }
    return null
  }
  getBoundingClientRect() {
    return { left: 100, top: 80, width: 800, height: 600 }
  }
}

test('keeps a horizontal host dialog together below the enhancer titlebar', () => {
  const nav = new FakeElement('nav')
  const content = new FakeElement('content')
  const overlay = new FakeElement('overlay')
  const mask = new FakeElement('mask')
  const dialog = new FakeElement('dialog')
  dialog.appendChild(nav)
  dialog.appendChild(content)
  dialog.setAttribute('aria-label', 'Settings')
  overlay.appendChild(mask)
  overlay.appendChild(dialog)

  const storage = new Map([
    ['dshme.dialog-state.v1:Settings', JSON.stringify({
      geometry: { left: 120, top: 90, width: 640, height: 520 },
      pinned: true,
      blurless: true,
      maximized: false,
    })],
  ])
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) },
  }

  globalThis.Element = FakeElement
  globalThis.document = {
    createElement: () => new FakeElement(),
    querySelectorAll: () => [dialog],
  }
  globalThis.window = {
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle: element => element === dialog
      ? { display: 'flex', flexDirection: 'row' }
      : { marginTop: '0px' },
  }

  const enhancer = createEnhancer({ drag: false, resize: true, pin: true, maximize: true, blurless: true })
  enhancer.applyAll()

  assert.equal(dialog.classList.contains('dshme-horizontal'), true)
  assert.equal(dialog.children[0].classList.contains('dshme-titlebar'), true)
  assert.deepEqual(dialog.children.slice(1, 3), [nav, content])
  assert.deepEqual(
    dialog.children.filter(child => child.classList.contains('dshme-handle')).map(child => child.className).sort(),
    ['dshme-handle dshme-e', 'dshme-handle dshme-n', 'dshme-handle dshme-ne', 'dshme-handle dshme-nw',
      'dshme-handle dshme-s', 'dshme-handle dshme-se', 'dshme-handle dshme-sw', 'dshme-handle dshme-w'].sort(),
  )
  assert.equal(nav.style.getPropertyValue('--dshme-original-margin-top'), '0px')
  assert.equal(content.style.getPropertyValue('--dshme-original-margin-top'), '0px')
  assert.equal(dialog.style.left, '120px')
  assert.equal(dialog.style.top, '90px')
  assert.equal(dialog.style.width, '640px')
  assert.equal(dialog.style.height, '520px')
  assert.equal(overlay.getAttribute('data-dshme-blurless'), 'true')
  assert.equal(mask.classList.contains('dshme-blur-target'), true)

  const pin = dialog.children[0].children[1].children[0]
  assert.equal(pin.getAttribute('aria-pressed'), 'true')
  assert.equal(pin.getAttribute('aria-label'), 'Unpin dialog')
  const outsideClick = {
    target: mask,
    prevented: false,
    stopped: false,
    immediate: false,
    preventDefault() { this.prevented = true },
    stopPropagation() { this.stopped = true },
    stopImmediatePropagation() { this.immediate = true },
  }
  overlay.dispatch('click', outsideClick)
  assert.deepEqual(
    [outsideClick.prevented, outsideClick.stopped, outsideClick.immediate],
    [true, true, true],
  )
  pin.dispatch('click', { preventDefault() {}, stopPropagation() {} })
  assert.equal(pin.getAttribute('aria-pressed'), 'false')
  assert.equal(JSON.parse(storage.get('dshme.dialog-state.v1:Settings')).pinned, false)

  enhancer.dispose()
  assert.deepEqual(dialog.children, [nav, content])
  assert.equal(dialog.classList.contains('dshme-horizontal'), false)
  assert.equal(nav.style.getPropertyValue('--dshme-original-margin-top'), '')
  assert.equal(dialog.classList.contains('dshme-dialog'), false)
})
