/**
 * Optional end-to-end check driven by a real browser.
 *
 * It launches a headless Chromium based browser (Edge or Chrome) through the
 * DevTools protocol, opens the calculator page, drives the keypad, submits a
 * calculation, opens the history view and finally checks the offline error
 * state. Screenshots are written next to the report.
 *
 * Requirements: Node.js 18+, a locally installed Edge or Chrome, and a running
 * backend plus a static server for src/ (see README sections 7.1 and 7.2).
 *
 * Usage:
 *   node tools/verify.mjs ./screenshots http://127.0.0.1:8080
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
]

const browserPath = BROWSER_CANDIDATES.find((path) => existsSync(path))
if (!browserPath) {
  console.error('No Chromium based browser found. Install Edge or Chrome and retry.')
  process.exit(1)
}

const outDir = process.argv[2] || './screenshots'
const siteBase = process.argv[3] || 'http://127.0.0.1:8080'
const port = 9231
const page = siteBase.replace(/\/+$/, '') + '/calculator.html'

mkdirSync(outDir, { recursive: true })

const child = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
  '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + join(process.env.TEMP || '.', 'calculator-verify-' + Date.now()),
  'about:blank'
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  let wsUrl = null
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
      const target = list.find((item) => item.type === 'page')
      if (target) wsUrl = target.webSocketDebuggerUrl
    } catch (error) { /* the browser is still starting */ }
    if (!wsUrl) await sleep(300)
  }
  if (!wsUrl) throw new Error('Could not connect to the browser DevTools endpoint')

  const ws = new WebSocket(wsUrl)
  let id = 1
  const pending = new Map()
  const pageErrors = []
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) fail(new Error(JSON.stringify(message.error)))
        else done(message.result)
      } else if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails
        pageErrors.push((details.exception && details.exception.description) || details.text)
      }
    })
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = id++
    pending.set(messageId, { resolve, reject })
    ws.send(JSON.stringify({ id: messageId, method, params }))
  })

  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    writeFileSync(join(outDir, name), bytes)
    console.log('  ' + name + ' -> ' + bytes.length + ' bytes')
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  })

  // ---------- calculator view ----------
  await send('Page.navigate', { url: page + '#/calculator' })
  await sleep(2500)

  const calcProbe = await send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {}
      const keys = () => Array.from(document.querySelectorAll('.calc__key'))
      const press = (value) => { const k = keys().find(x => x.dataset.value === value && x.dataset.action === 'insert'); k.click(); return k }
      const act = (action) => { const k = keys().find(x => x.dataset.action === action); k.click(); return k }
      const input = document.getElementById('calcInput')
      const result = document.getElementById('resultText')
      const meta = document.getElementById('resultMeta')

      for (let i = 0; i < 60 && keys().length !== 20; i++) await new Promise(r => setTimeout(r, 150))
      out.keyCount = keys().length
      out.backspaceIsSvg = !!keys().find(k => k.dataset.action === 'backspace').querySelector('svg.calc__key-icon')

      press('1'); press('2'); press('3')
      out.typed = input.value
      act('backspace')
      out.afterBackspace = input.value

      // Long press an operator key to insert the power operator.
      act('clear')
      press('2')
      const multiply = keys().find(k => k.dataset.value === '*')
      multiply.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await new Promise(r => setTimeout(r, 600))
      multiply.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      multiply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      press('3')
      out.expressionAfterLongPress = input.value

      // Live preview comes from the backend.
      for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 200)); if (result.className.indexOf('--muted') === -1) break }
      out.previewResult = result.textContent.trim()
      out.previewClass = result.className

      // Submit and store.
      const before = Number(document.getElementById('historyCount').textContent)
      act('equals')
      for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 200)); if (result.className.indexOf('--final') !== -1 || result.className.indexOf('--error') !== -1) break }
      out.finalResult = result.textContent.trim()
      out.finalClass = result.className
      out.finalMeta = meta.textContent.trim()
      for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 200)); if (Number(document.getElementById('historyCount').textContent) > before) break }
      out.historyChip = before + ' -> ' + Number(document.getElementById('historyCount').textContent)

      // A long decimal must be rendered from resultText.
      act('clear')
      input.value = '1/3'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 200)); if (result.className.indexOf('--muted') === -1) break }
      out.longDecimal = result.textContent.trim()
      act('clear')
      return JSON.stringify(out, null, 2)
    })()`,
    awaitPromise: true,
    returnByValue: true
  })
  console.log('=== calculator interaction ===')
  console.log(calcProbe.result.value)
  await screenshot('01-calculator.png')

  // ---------- history view ----------
  await send('Page.navigate', { url: page + '#/history' })
  await sleep(3500)
  const historyProbe = await send('Runtime.evaluate', {
    expression: `(async () => {
      const out = {}
      for (let i = 0; i < 60 && !document.querySelector('.history__list'); i++) await new Promise(r => setTimeout(r, 150))
      out.countLabel = (document.querySelector('.history__count') || {}).textContent
      out.recordCount = document.querySelectorAll('.history__record').length
      const first = document.querySelector('.history__record')
      out.firstRecord = first ? first.textContent.replace(/\\s+/g, ' ').trim() : null
      out.deleteButtons = document.querySelectorAll('.history__record-delete').length
      out.horizontalOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      return JSON.stringify(out, null, 2)
    })()`,
    awaitPromise: true,
    returnByValue: true
  })
  console.log('=== history view ===')
  console.log(historyProbe.result.value)
  await screenshot('02-history.png')

  // ---------- backend offline ----------
  await send('Page.navigate', { url: page + '?api=127.0.0.1:59999#/calculator' })
  await sleep(3000)
  const offlineProbe = await send('Runtime.evaluate', {
    expression: `(async () => {
      const keys = () => Array.from(document.querySelectorAll('.calc__key'))
      for (let i = 0; i < 60 && keys().length !== 20; i++) await new Promise(r => setTimeout(r, 150))
      const one = keys().find(k => k.dataset.value === '1')
      one.click()
      keys().find(k => k.dataset.value === '+').click()
      one.click()
      const result = document.getElementById('resultText')
      keys().find(k => k.dataset.action === 'equals').click()
      for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 250)); if (result.className.indexOf('--error') !== -1) break }
      return JSON.stringify({
        statusChip: document.getElementById('statusText').textContent,
        statusChipClass: document.getElementById('statusChip').className,
        resultArea: result.textContent.trim(),
        resultClass: result.className,
        frontEndComputedItself: /^2$/.test(result.textContent.trim())
      }, null, 2)
    })()`,
    awaitPromise: true,
    returnByValue: true
  })
  console.log('=== backend offline ===')
  console.log(offlineProbe.result.value)
  await screenshot('03-backend-offline.png')

  console.log('=== page exceptions ===')
  console.log(pageErrors.length ? pageErrors.join('\n') : '  none')
  ws.close()
}

main()
  .catch((error) => { console.error('failed: ' + error.message); process.exitCode = 1 })
  .finally(() => { try { child.kill() } catch (error) { /* ignore */ } })
