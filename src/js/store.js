/**
 * Minimal global state container.
 *
 *   * state            the shared values (backend availability, history count)
 *   * getState()       read a snapshot
 *   * setState(patch)  merge an update and notify subscribers
 *   * subscribe(fn)    listen for changes, returns an unsubscribe function
 *
 * No state library is used: the application state is this small.
 */

const listeners = new Set()

/** Shared state */
const state = {
  /** Backend availability: null means "not probed yet" */
  backendOnline: null,
  /** Number of history records reported by the backend */
  historyCount: 0,
  /** Active view: 'calculator' or 'history' */
  view: 'calculator'
}

/** Read a snapshot (a shallow copy, so callers cannot mutate the store) */
export function getState() {
  return Object.assign({}, state)
}

/**
 * Merge an update and notify every subscriber.
 * Subscribers are only called when a value actually changed.
 * @param {object} patch
 */
export function setState(patch) {
  let changed = false
  Object.keys(patch || {}).forEach((key) => {
    if (state[key] !== patch[key]) {
      state[key] = patch[key]
      changed = true
    }
  })
  if (changed) {
    notify()
  }
  return getState()
}

function notify() {
  const snapshot = getState()
  listeners.forEach((listener) => {
    try {
      listener(snapshot)
    } catch (error) {
      console.error('[store] subscriber failed:', error)
    }
  })
}

/**
 * Subscribe to state changes.
 * @param {(state: object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') {
    return () => {}
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Update the backend availability flag */
export function setBackendOnline(online) {
  return setState({ backendOnline: Boolean(online) })
}

/** Update the history record count */
export function setHistoryCount(count) {
  const value = Number(count)
  return setState({ historyCount: Number.isFinite(value) && value > 0 ? Math.floor(value) : 0 })
}

export default { getState, setState, subscribe, setBackendOnline, setHistoryCount }
