/**
 * Calculation history view.
 *
 * The list comes entirely from SQLite through the backend; nothing is cached
 * locally:
 *   * entering the view or pressing Refresh calls GET /api/history again
 *   * deleting calls DELETE /api/history/{id} and then reloads the first page
 *   * clearing calls DELETE /api/history and then reloads
 *
 * Mapping from the original uni-app version:
 *   onLoad            -> mount
 *   onReachBottom     -> IntersectionObserver on a sentinel element
 *   onPullDownRefresh -> pull down gesture plus a Refresh button
 *   uni.showModal     -> ui.confirmDialog
 */
import { clearHistory, deleteHistory, fetchHistory } from '../api.js'
import { navigateHome } from '../router.js'
import { setBackendOnline, setHistoryCount } from '../store.js'
import { confirmDialog, hideLoading, showLoading, toast, toastError, toastSuccess } from '../ui.js'
import { escapeHtml } from '../util.js'

/** Records per page; matches CALC_DEFAULT_PAGE_SIZE on the backend */
const PAGE_SIZE = 20

/** Distance from the bottom at which the next page starts loading */
const SENTINEL_MARGIN = '160px'

/** Pull distance that triggers a refresh, in pixels */
const PULL_THRESHOLD = 64

const state = {
  /** Records loaded so far */
  records: [],
  /** Total number of records according to the backend */
  total: 0,
  /** Page number to request next */
  page: 1,
  /** A request is in flight */
  loading: false,
  /** Every record has been loaded */
  finished: false,
  /** Error message to display */
  errorMessage: '',
  /** Whether the first load already finished (distinguishes loading from empty) */
  loadedOnce: false
}

let root = null
let refs = {}
let observer = null
let destroyed = false

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderRecord(record) {
  return (
    '<article class="history__record" data-id="' + escapeHtml(record.id) + '">' +
    '<div class="history__record-main">' +
    '<div class="history__record-line">' +
    '<span class="history__record-id">#' + escapeHtml(record.id) + '</span>' +
    '<span class="history__record-expression">' + escapeHtml(record.expression) + '</span>' +
    '</div>' +
    '<div class="history__record-line history__record-line--bottom">' +
    '<span class="history__record-result">= ' + escapeHtml(record.resultText) + '</span>' +
    '<span class="history__record-time">' + escapeHtml(record.createdAt) + '</span>' +
    '</div>' +
    '</div>' +
    '<button type="button" class="history__record-delete" data-action="delete"' +
    ' data-id="' + escapeHtml(record.id) + '"' +
    ' aria-label="Delete record ' + escapeHtml(record.id) + '">' +
    '<span class="history__record-delete-text">Delete</span>' +
    '</button>' +
    '</article>'
  )
}

function renderTemplate() {
  return (
    '<section class="history">' +
    // ---------- navigation bar ----------
    '<nav class="history__navbar">' +
    '<button type="button" class="history__back" id="historyBack" aria-label="Back to the calculator">' +
    '<span class="history__back-icon">←</span>' +
    '</button>' +
    '<div class="history__title-wrap">' +
    '<span class="history__title">History</span>' +
    '<span class="history__subtitle">Data comes from the backend SQLite database</span>' +
    '</div>' +
    '<div class="history__nav-placeholder"></div>' +
    '</nav>' +

    // ---------- toolbar ----------
    '<div class="history__toolbar">' +
    '<span class="history__count" id="historyTotal">Loading...</span>' +
    '<div class="history__toolbar-actions">' +
    '<button type="button" class="btn" id="historyRefresh">' +
    '<span class="btn__text">Refresh</span></button>' +
    '<button type="button" class="btn btn--danger" id="historyClear">' +
    '<span class="btn__text btn__text--danger">Clear all</span></button>' +
    '</div>' +
    '</div>' +

    // ---------- body ----------
    '<div class="history__body" id="historyBody"></div>' +
    '</section>'
  )
}

/** Render the body: error, empty state or list */
function renderBody() {
  const body = refs.body
  if (!body) {
    return
  }

  if (state.errorMessage) {
    body.innerHTML =
      '<div class="history__notice">' +
      '<p class="history__notice-title">Could not load the history</p>' +
      '<p class="history__notice-text">' + escapeHtml(state.errorMessage) + '</p>' +
      '<button type="button" class="btn btn--primary" id="historyRetry">' +
      '<span class="btn__text btn__text--light">Try again</span></button>' +
      '</div>'
    return
  }

  if (!state.records.length) {
    if (!state.loadedOnce) {
      body.innerHTML =
        '<div class="history__notice">' +
        '<p class="history__notice-text">Loading...</p>' +
        '</div>'
      return
    }
    body.innerHTML =
      '<div class="history__empty">' +
      '<span class="history__empty-icon" aria-hidden="true">🧮</span>' +
      '<p class="history__empty-title">No calculations yet</p>' +
      '<p class="history__empty-text">Calculate something on the calculator page and the result is stored in the backend database</p>' +
      '<button type="button" class="btn btn--primary" id="historyGoCalc">' +
      '<span class="btn__text btn__text--light">Go to the calculator</span></button>' +
      '</div>'
    return
  }

  const footerText = state.loading
    ? 'Loading...'
    : (state.finished ? '- end of the list -' : 'Scroll down to load more')

  body.innerHTML =
    '<div class="history__list" id="historyList">' +
    state.records.map(renderRecord).join('') +
    '<div class="history__sentinel" id="historySentinel" aria-hidden="true"></div>' +
    '<p class="history__list-footer">' + escapeHtml(footerText) + '</p>' +
    '</div>'

  refs.list = body.querySelector('#historyList')
  refs.sentinel = body.querySelector('#historySentinel')
}

/** Update the toolbar counter */
function renderTotal() {
  if (!refs.total) {
    return
  }
  const label = state.total === 1 ? 'record' : 'records'
  refs.total.textContent = state.total + ' ' + label
}

function render() {
  renderTotal()
  renderBody()
  observeSentinel()
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Load history records from the backend.
 * @param {boolean} reset true to start again from page 1
 */
async function load(reset) {
  if (destroyed) {
    return
  }
  if (state.loading) {
    return
  }
  if (!reset && state.finished) {
    return
  }

  const targetPage = reset ? 1 : state.page
  state.loading = true
  if (reset) {
    state.errorMessage = ''
  }
  render()

  try {
    const data = await fetchHistory(targetPage, PAGE_SIZE)
    if (destroyed) {
      return
    }

    const list = Array.isArray(data.list) ? data.list : []
    state.total = Number(data.total) || 0
    state.records = reset ? list : state.records.concat(list)
    state.page = targetPage + 1
    // Either everything is loaded, or the backend returned an empty page.
    state.finished = state.records.length >= state.total || list.length === 0
    state.loading = false
    state.loadedOnce = true
    state.errorMessage = ''

    setBackendOnline(true)
    setHistoryCount(state.total)
    render()
  } catch (error) {
    if (destroyed) {
      return
    }
    state.loading = false
    state.loadedOnce = true
    state.errorMessage = (error && error.message) || 'Could not fetch the history'
    if (error && error.code === 'NETWORK_ERROR') {
      setBackendOnline(false)
    }
    render()
  }
}

/** Reload the first page from the backend */
function reload() {
  return load(true)
}

/** Observe the sentinel element to implement infinite scrolling */
function observeSentinel() {
  if (observer) {
    observer.disconnect()
  }
  if (!refs.sentinel || state.finished || !state.records.length) {
    return
  }

  if (typeof IntersectionObserver !== 'function') {
    // Older browsers simply use the Refresh button instead.
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !state.loading && !state.finished) {
          load(false)
        }
      })
    },
    { root: refs.list, rootMargin: SENTINEL_MARGIN }
  )
  observer.observe(refs.sentinel)
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/**
 * Delete one record: confirm, call the backend, then reload the list.
 * Reloading keeps the interface identical to the database content.
 */
async function onDeleteClick(id) {
  const record = state.records.find((item) => String(item.id) === String(id))
  if (!record) {
    return
  }

  const confirmed = await confirmDialog({
    title: 'Delete this record?',
    content: record.expression + ' = ' + record.resultText,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    tone: 'danger'
  })
  if (!confirmed || destroyed) {
    return
  }

  showLoading('Deleting...')
  try {
    await deleteHistory(record.id)
    hideLoading()
    toastSuccess('Record deleted')
    await reload()
  } catch (error) {
    hideLoading()
    toastError((error && error.message) || 'Could not delete the record')
  }
}

/** Clear the whole history */
async function onClearClick() {
  if (!state.total) {
    toast('There is no history to clear')
    return
  }

  const confirmed = await confirmDialog({
    title: 'Clear the whole history?',
    content: 'All ' + state.total + ' records in the database will be deleted. This cannot be undone.',
    confirmText: 'Clear all',
    cancelText: 'Cancel',
    tone: 'danger'
  })
  if (!confirmed || destroyed) {
    return
  }

  showLoading('Clearing...')
  try {
    const data = await clearHistory()
    hideLoading()
    toastSuccess('Deleted ' + (Number(data.deleted) || 0) + ' records')
    await reload()
  } catch (error) {
    hideLoading()
    toastError((error && error.message) || 'Could not clear the history')
  }
}

/** Clicks inside the body: delete, retry, or go to the calculator */
function onBodyClick(event) {
  const deleteButton = event.target.closest('[data-action="delete"]')
  if (deleteButton) {
    onDeleteClick(deleteButton.dataset.id)
    return
  }
  if (event.target.closest('#historyRetry')) {
    reload()
    return
  }
  if (event.target.closest('#historyGoCalc')) {
    navigateHome()
  }
}

/** Pull down to refresh gesture */
function bindPullToRefresh() {
  const body = refs.body
  if (!body || typeof body.addEventListener !== 'function') {
    return
  }

  let startY = null
  let pulled = false

  const onTouchStart = (event) => {
    const list = refs.list
    // Only react when the list is already scrolled to the top.
    if (list && list.scrollTop > 0) {
      startY = null
      return
    }
    startY = event.touches && event.touches[0] ? event.touches[0].clientY : null
    pulled = false
  }

  const onTouchMove = (event) => {
    if (startY === null || state.loading) {
      return
    }
    const current = event.touches && event.touches[0] ? event.touches[0].clientY : null
    if (current === null) {
      return
    }
    if (current - startY > PULL_THRESHOLD && !pulled) {
      pulled = true
      toast('Refreshing...', { duration: 900 })
      reload()
    }
  }

  const onTouchEnd = () => {
    startY = null
    pulled = false
  }

  body.addEventListener('touchstart', onTouchStart, { passive: true })
  body.addEventListener('touchmove', onTouchMove, { passive: true })
  body.addEventListener('touchend', onTouchEnd, { passive: true })
  body.addEventListener('touchcancel', onTouchEnd, { passive: true })

  // Removed again in unmount.
  refs.pullHandlers = { onTouchStart, onTouchMove, onTouchEnd }
}

// ---------------------------------------------------------------------------
// View life cycle
// ---------------------------------------------------------------------------

export function mount(container) {
  root = container
  destroyed = false
  root.innerHTML = renderTemplate()

  refs = {
    back: root.querySelector('#historyBack'),
    refresh: root.querySelector('#historyRefresh'),
    clear: root.querySelector('#historyClear'),
    total: root.querySelector('#historyTotal'),
    body: root.querySelector('#historyBody'),
    list: null,
    sentinel: null,
    pullHandlers: null
  }

  refs.back.addEventListener('click', () => {
    // When the page was opened directly there is no previous entry, so fall back
    // to the calculator view.
    if (window.history.length > 1 && document.referrer) {
      window.history.back()
    } else {
      navigateHome()
    }
  })
  refs.refresh.addEventListener('click', () => reload())
  refs.clear.addEventListener('click', () => onClearClick())
  refs.body.addEventListener('click', onBodyClick)
  bindPullToRefresh()

  reload()
}

export function unmount() {
  destroyed = true
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (refs.body) {
    refs.body.removeEventListener('click', onBodyClick)
    if (refs.pullHandlers) {
      refs.body.removeEventListener('touchstart', refs.pullHandlers.onTouchStart)
      refs.body.removeEventListener('touchmove', refs.pullHandlers.onTouchMove)
      refs.body.removeEventListener('touchend', refs.pullHandlers.onTouchEnd)
      refs.body.removeEventListener('touchcancel', refs.pullHandlers.onTouchEnd)
    }
  }
  refs = {}
  root = null
}

export default { mount, unmount }
