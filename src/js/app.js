/**
 * app.js - application entry point.
 *
 * Responsibilities:
 *   1. start the hash router and mount the calculator / history views;
 *   2. probe the backend once on start-up and update the status chip;
 *   3. refresh the "History N" counter from the backend;
 *   4. catch unhandled errors so the interface never fails silently.
 */
import { checkHealth, fetchHistory } from './api.js'
import { backend, BACKEND_SOURCE_LABEL } from './http.js'
import { startRouter, navigateHome } from './router.js'
import { describeBackend } from './config.js'
import { getState, setBackendOnline, setHistoryCount, setState, subscribe } from './store.js'
import { toastError, hideLoading } from './ui.js'

/** Elements of the status bar */
const ui = {
  statusChip: null,
  statusText: null,
  historyCount: null,
  historyChip: null
}

/**
 * Probe backend availability.
 * A failed probe does not block the interface; it only means that no result can
 * be obtained.
 * @returns {Promise<boolean>}
 */
export async function probeBackend() {
  try {
    const data = await checkHealth()
    setBackendOnline(true)
    if (data && typeof data.historyCount === 'number') {
      setHistoryCount(data.historyCount)
    }
    return true
  } catch (error) {
    setBackendOnline(false)
    console.warn('[calculator] backend probe failed:', error && error.message ? error.message : error)
    return false
  }
}

/**
 * Refresh the history counter through the backend.
 * pageSize=1 keeps the response small; only the total is used.
 */
export async function refreshHistoryCount() {
  try {
    const data = await fetchHistory(1, 1)
    setHistoryCount(data && data.total)
    setBackendOnline(true)
    return Number(data && data.total) || 0
  } catch (error) {
    setBackendOnline(false)
    return 0
  }
}

/** Render the top bar from the current store state */
function renderTopbar(state) {
  if (!ui.statusChip || !ui.statusText) {
    return
  }

  const online = state.backendOnline
  ui.statusChip.classList.toggle('chip--ok', online === true)
  ui.statusChip.classList.toggle('chip--off', online !== true)

  if (online === true) {
    ui.statusText.textContent = 'Backend online'
    const origin = backend.baseUrl || window.location.origin
    ui.statusChip.title = 'Backend: ' + origin + '\nClick to probe again'
  } else if (online === false) {
    ui.statusText.textContent = 'Backend offline'
    ui.statusChip.title =
      'Cannot reach ' + (backend.baseUrl || 'the same origin address') +
      '\nClick to probe again (see the console for details)'
  } else {
    ui.statusText.textContent = 'Checking backend...'
  }

  if (ui.historyCount) {
    ui.historyCount.textContent = String(state.historyCount || 0)
  }
}

/** Wire up the top bar interactions */
function bindTopbar() {
  if (ui.statusChip) {
    ui.statusChip.addEventListener('click', async () => {
      setState({ backendOnline: null })
      const online = await probeBackend()
      await refreshHistoryCount()
      if (!online) {
        toastError('Still cannot reach the backend. Make sure python run.py is running.')
      }
    })
  }

  if (ui.historyChip) {
    ui.historyChip.addEventListener('click', () => {
      import('./router.js').then((router) => router.navigateTo('/history'))
    })
  }
}

/** Print the active backend URL to the console, which helps when debugging */
function logBackend() {
  const label = BACKEND_SOURCE_LABEL[backend.source] || backend.source
  console.log(
    '[832402226 Calculator] front-end started\n' +
      '  Backend URL : ' + (backend.baseUrl || 'relative URL (same origin)') + '\n' +
      '  Resolved by : ' + label + ' (' + backend.reason + ')\n' +
      '  Summary     : ' + describeBackend(backend)
  )
}

/** Warn when the page was opened straight from disk */
function warnIfFileProtocol() {
  if (backend.source === 'file-protocol') {
    console.warn(
      '[calculator] The page was opened with file://, so the browser may block cross origin requests.\n' +
        '            Serve it over HTTP instead, for example: python -m http.server 8080'
    )
  }
}

function bindGlobalErrors() {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    console.error('[calculator] unhandled promise rejection:', reason)
    hideLoading()
    if (reason && reason.code === 'NETWORK_ERROR') {
      toastError('Cannot reach the backend service. Make sure it is running.')
    }
  })

  window.addEventListener('error', (event) => {
    console.error('[calculator] uncaught error:', event.message || event.error)
  })
}

/** Start the application */
function bootstrap() {
  ui.statusChip = document.getElementById('statusChip')
  ui.statusText = document.getElementById('statusText')
  ui.historyCount = document.getElementById('historyCount')
  ui.historyChip = document.getElementById('historyChip')

  logBackend()
  warnIfFileProtocol()
  bindTopbar()
  bindGlobalErrors()

  // Re-render the top bar whenever the store changes.
  subscribe(renderTopbar)
  renderTopbar(getState())

  // Refresh the counter when returning from the history view.
  startRouter({
    container: document.getElementById('viewRoot'),
    onChange: (path) => {
      setState({ view: path === '/history' ? 'history' : 'calculator' })
      refreshHistoryCount()
      // Opening an unknown route directly in the address bar falls back home.
      if (!path) {
        navigateHome()
      }
    }
  })

  // Probe the backend once on start-up.
  probeBackend().then(() => refreshHistoryCount())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
