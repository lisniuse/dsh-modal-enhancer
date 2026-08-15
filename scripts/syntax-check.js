/*
 * Lightweight syntax gate: parse the distributed plugin body and the modular
 * sources with Node's own parser so a malformed edit fails before use.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const files = ['src/plugin-body.js', 'dist/plugin.js', 'src/enhancer.js', 'src/settings.js', 'index.js', 'client.js']

// `plugin-body.js`/`dist/plugin.js` are function BODIES (they start with
// `return { ... }` and are provided to the Evaluator as a function body).
// `src/enhancer.js`/`src/settings.js`/`index.js` are ESM modules (they use `export`).
// `client.js` is a plain browser script (`window.__ModuleLoader__.load`).
const FUNCTION_BODY = new Set(['src/plugin-body.js', 'dist/plugin.js'])
const PLAIN_SCRIPT = new Set(['client.js'])

let ok = true
for (const rel of files) {
  const path = join(root, rel)
  if (!existsSync(path)) {
    console.log(`skipping (missing): ${rel}`)
    continue
  }
  const code = readFileSync(path, 'utf8')
  try {
    if (FUNCTION_BODY.has(rel)) {
      // Mirror how the Evaluator wraps a `code.client` body: a plain function.
      new vm.Script(`function enhancerPluginBody(){\n${code}\n}`)
    } else if (PLAIN_SCRIPT.has(rel)) {
      // Plain browser script; assert it parses as a script.
      new vm.Script(code)
    } else {
      // ESM module source; assert it parses (and imports cleanly, since the
      // helper modules are side-effect free at load time).
      await import(`${pathToFileURL(path).href}?t=${Date.now()}`)
    }
    console.log(`ok: ${rel}`)
  } catch (err) {
    ok = false
    console.error(`FAIL: ${rel}\n${err.message}`)
  }
}
process.exitCode = ok ? 0 : 1
