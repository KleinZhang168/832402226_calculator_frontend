/**
 * router.js - a minimal hash router.
 *
 *   #/calculator  calculator view (default)
 *   #/history     calculation history
 *
 * View module contract:
 *   export function mount(container, context)  attach the view
 *   export function unmount()                  detach and release listeners
 *
 * A hash router needs no server side rewrite rules, so reloading the page,
 * navigating back and sharing a link all work on plain static hosting.
 */

/** Route table: path -> lazily imported view module */
const ROUTES = {
  '/calculator': {
    title: '832402226 Calculator',
    load: () => import('./views/calculator.js')
  },
  '/history': {
    title: 'Calculation history',
    load: () => import('./views/history.js')
  }
}

/** Fallback route */
export const DEFAULT_ROUTE = '/calculator'

let container = null
let currentRoute = null
let currentView = null
let onRouteChange = null

/** Parse a route path out of location.hash, falling back to the default route */
export function parseHash(hash) {
  const raw = String(hash == null ? '' : hash).replace(/^#/, '')
  const path = raw.split('?')[0].trim()
  if (!path || path === '/') {
    return DEFAULT_ROUTE
  }
  const normalized = path.startsWith('/') ? path : '/' + path
  return Object.prototype.hasOwnProperty.call(ROUTES, normalized) ? normalized : DEFAULT_ROUTE
}

/** The active route path */
export function getCurrentRoute() {
  return currentRoute
}

/**
 * Navigate to a view.
 * @param {'/calculator'|'/history'} path
 */
export function navigateTo(path) {
  const target = Object.prototype.hasOwnProperty.call(ROUTES, path) ? path : DEFAULT_ROUTE
  const nextHash = '#' + target
  if (window.location.hash === nextHash) {
    // An unchanged hash fires no hashchange event, so render explicitly.
    render(target)
    return
  }
  window.location.hash = nextHash
}

/** Go back to the calculator view */
export function navigateHome() {
  navigateTo(DEFAULT_ROUTE)
}

/** Apply the view specific veil style (the history view uses a softer one) */
function applyVeilStyle(path) {
  const veil = document.getElementById('bgVeil')
  if (!veil) {
    return
  }
  veil.classList.toggle('app-bg__veil--soft', path === '/history')
}

/** Mount the view belonging to a route */
async function render(path) {
  const route = ROUTES[path] || ROUTES[DEFAULT_ROUTE]

  if (currentView && typeof currentView.unmount === 'function') {
    try {
      currentView.unmount()
    } catch (error) {
      console.error('[router] failed to unmount the view:', error)
    }
  }
  currentView = null
  currentRoute = path
  applyVeilStyle(path)

  if (container) {
    container.innerHTML = ''
    container.scrollTop = 0
  }

  document.title = route.title

  let module
  try {
    module = await route.load()
  } catch (error) {
    console.error('[router] failed to load the view:', error)
    if (container) {
      container.innerHTML =
        '<div class="placeholder"><p class="placeholder__text">' +
        'Could not load the view. Check that the css/ and js/ directories are complete.</p></div>'
    }
    return
  }

  const view = module.default || module
  currentView = view

  if (typeof onRouteChange === 'function') {
    onRouteChange(path)
  }

  if (container && typeof view.mount === 'function') {
    try {
      view.mount(container, { route: path })
    } catch (error) {
      console.error('[router] failed to mount the view:', error)
    }
  }
}

/**
 * Start the router.
 * @param {object} options
 * @param {HTMLElement} options.container view container
 * @param {(path: string) => void} [options.onChange] route change callback
 */
export function startRouter(options = {}) {
  container = options.container
  onRouteChange = options.onChange || null

  window.addEventListener('hashchange', () => {
    render(parseHash(window.location.hash))
  })

  render(parseHash(window.location.hash))
}

export default { startRouter, navigateTo, navigateHome, parseHash, getCurrentRoute, DEFAULT_ROUTE }
