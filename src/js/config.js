/**
 * Backend connection configuration.
 *
 * ===========================================================================
 *  How the front-end finds the API
 * ===========================================================================
 *
 * The backend listens on 0.0.0.0:5000 by default. The page can be opened from
 * several places, so the base URL is resolved in this order:
 *
 *  1) ?api=<url> in the query string (also remembered in localStorage)
 *  2) a previously remembered URL
 *  3) same origin deployment  - the page is served by the backend itself
 *     (a cloud domain, or http://127.0.0.1:5000), so relative /api/... is used
 *  4) local development with a separate static server on 8080 / 5500 / 5173,
 *     where the backend is assumed to be on the same host, port 5000
 *  5) a phone or another device on the LAN, using the host name plus port 5000
 *  6) file:// - no same origin backend exists, so it falls back to 127.0.0.1
 *
 * Any scenario can be overridden with ?api=http://host:port.
 * ===========================================================================
 */

/** LAN IP of the machine that runs the backend (only used for phone testing) */
export const DEFAULT_LAN_HOST = '192.168.1.10'

/** Backend port, must match CALC_PORT in the backend */
export const DEFAULT_SERVER_PORT = 5000

/**
 * Site port of a deployment, empty means "detect automatically".
 *
 * Fill this in only when the service does not run on a standard web port, for
 * example http://example.com:8000 - then set SITE_PORT = '8000'. Cloud hosts
 * such as Render serve on the default HTTPS port, so leaving it empty is right.
 */
export const SITE_PORT = ''

/** Ports that belong to a local static file server rather than to the backend */
const DEV_SERVER_PORTS = ['8080', '8081', '5500', '5173', '3000']

/** Browsers omit 80 and 443 from location.port, so they appear as an empty string */
const STANDARD_WEB_PORTS = ['', '80', '443']

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT = 15000

/** localStorage key that remembers a manually specified base URL */
const STORAGE_KEY = 'calculator.apiBase'

/** Query string parameter: ?api=http://host:port */
const QUERY_KEY = 'api'

/** True for localhost / 127.x / ::1 / 0.0.0.0 */
function isLocalHostname(hostname) {
  if (!hostname) {
    return false
  }
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.startsWith('127.')
  )
}

/** Read SITE_PORT, tolerating a numeric value; empty when unset */
function readSitePort() {
  const raw = SITE_PORT === null || SITE_PORT === undefined ? '' : String(SITE_PORT).trim()
  return raw
}

/** True when the page was opened directly from disk */
export function isFileProtocol(location) {
  return Boolean(location) && location.protocol === 'file:'
}

/**
 * Detect a same origin deployment: the page itself was served by the backend.
 *
 * The backend is a web service, so a page opened on a standard web port can only
 * have come from a real HTTP server (a cloud domain, or a reverse proxy), not
 * from the "static server on 8080 plus backend on 5000" development setup. In
 * that case relative /api/... requests are correct: no CORS, no configuration.
 *
 * Treated as same origin when any of these holds:
 *   1) the port is a standard web port (empty, 80 or 443), for example
 *      https://calculator.example.com/src/calculator.html;
 *   2) the port equals the backend default 5000, for example
 *      http://127.0.0.1:5000/src/calculator.html;
 *   3) the port equals SITE_PORT, for a service on a non standard port.
 *
 * Known development ports (8080, 5173, ...) are excluded, which keeps the
 * separate "python -m http.server 8080" workflow unchanged.
 */
export function isSameOriginDeployment(location) {
  if (!location || isFileProtocol(location)) {
    return false
  }
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    return false
  }

  const port = String(location.port || '')
  if (STANDARD_WEB_PORTS.indexOf(port) >= 0) {
    return true
  }
  if (port === String(DEFAULT_SERVER_PORT)) {
    return true
  }

  const sitePort = readSitePort()
  return Boolean(sitePort) && port === sitePort
}

/** Remove trailing slashes so that "//api/health" can never be produced */
export function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '')
}

/**
 * Turn user input into a valid base URL.
 * Accepts '192.168.1.10', '192.168.1.10:5000' and 'http://host:5000/'.
 */
export function normalizeBaseUrl(input, defaultProtocol = 'http:') {
  const raw = String(input == null ? '' : input).trim()
  if (!raw) {
    return ''
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : defaultProtocol + '//' + raw
  try {
    const parsed = new URL(withProtocol)
    // Add the default port for plain http input without an explicit port.
    // https is left alone: it already means port 443, and forcing 5000 would
    // target the wrong address. A bare IP such as '192.168.1.10' becomes http
    // plus port 5000.
    if (!parsed.port && parsed.protocol === 'http:') {
      const isBareInput = !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
      if (isBareInput || isLocalHostname(parsed.hostname)) {
        parsed.port = String(DEFAULT_SERVER_PORT)
      }
    }
    return trimTrailingSlash(parsed.origin)
  } catch (error) {
    return ''
  }
}

/** Read ?api=... (or ?apiBase=...) from the query string */
export function readUrlOverride(location) {
  if (!location || !location.search) {
    return ''
  }
  try {
    const params = new URLSearchParams(location.search)
    return normalizeBaseUrl(params.get(QUERY_KEY) || params.get('apiBase') || '')
  } catch (error) {
    return ''
  }
}

/** Read a remembered base URL from localStorage */
export function readStoredBaseUrl(storage) {
  if (!storage) {
    return ''
  }
  try {
    return normalizeBaseUrl(storage.getItem(STORAGE_KEY) || '')
  } catch (error) {
    return ''
  }
}

/** Remember a base URL; an empty value clears the entry */
export function storeBaseUrl(storage, url) {
  if (!storage) {
    return
  }
  try {
    const normalized = normalizeBaseUrl(url)
    if (normalized) {
      storage.setItem(STORAGE_KEY, normalized)
    } else {
      storage.removeItem(STORAGE_KEY)
    }
  } catch (error) {
    /* localStorage can be unavailable in private mode; ignoring is fine */
  }
}

/**
 * Resolve the base URL that will be used.
 *
 * @param {object} [options]
 * @param {Location} [options.location] browser location, defaults to window.location
 * @param {Storage}  [options.storage]  local storage, defaults to window.localStorage
 * @returns {{baseUrl: string, origin: string, source: string, reason: string}}
 *          An empty baseUrl means "use relative URLs", i.e. same origin.
 */
export function resolveApiBase(options = {}) {
  const location = options.location || (typeof window !== 'undefined' ? window.location : null)
  const storage = options.storage || (typeof window !== 'undefined' ? window.localStorage : null)

  // 1) manual override: ?api= wins over a remembered value
  const fromUrl = readUrlOverride(location)
  if (fromUrl) {
    storeBaseUrl(storage, fromUrl)
    return { baseUrl: fromUrl, origin: fromUrl, source: 'query', reason: 'specified by the ?api= parameter' }
  }
  const stored = readStoredBaseUrl(storage)
  if (stored) {
    return { baseUrl: stored, origin: stored, source: 'storage', reason: 'reusing the last remembered backend URL' }
  }

  // Without a location (unit tests) a safe default is returned.
  if (!location) {
    return {
      baseUrl: '',
      origin: '',
      source: 'same-origin',
      reason: 'no page location available, assuming same origin'
    }
  }

  // 2) deployed or served by the backend itself: relative URLs
  if (isSameOriginDeployment(location)) {
    return {
      baseUrl: '',
      origin: location.origin,
      source: 'same-origin',
      reason: 'the page is served by the backend (' + location.origin + '), using relative /api/... requests'
    }
  }

  // 3) file:// has no same origin backend
  if (isFileProtocol(location)) {
    const fallback = 'http://127.0.0.1:' + DEFAULT_SERVER_PORT
    return {
      baseUrl: fallback,
      origin: fallback,
      source: 'file-protocol',
      reason: 'opened from file://, falling back to a local backend (CORS may block this; serve over HTTP instead)'
    }
  }

  // 4) local development: the page is on another local port, backend on 5000
  if (isLocalHostname(location.hostname)) {
    const local = location.protocol + '//' + location.hostname + ':' + DEFAULT_SERVER_PORT
    return {
      baseUrl: local,
      origin: local,
      source: 'local-dev',
      reason: 'local development: page on ' + location.origin + ', backend assumed on ' + local
    }
  }

  // 5) LAN or another host: reuse the host name with port 5000
  const lan = location.protocol + '//' + location.hostname + ':' + DEFAULT_SERVER_PORT
  return {
    baseUrl: lan,
    origin: lan,
    source: 'lan',
    reason: 'backend inferred from the current host name; use ?api= when it runs elsewhere'
  }
}

/** Join a base URL and an endpoint path */
export function buildUrl(baseUrl, path) {
  const suffix = path.startsWith('/') ? path : '/' + path
  return trimTrailingSlash(baseUrl) + suffix
}

/** Short description of the active backend, printed to the console on start-up */
export function describeBackend(config) {
  const source = config && config.source ? config.source : 'unknown'
  const origin = (config && config.origin) || 'relative URL (same origin)'
  return source + ' -> ' + origin
}

export default {
  DEFAULT_LAN_HOST,
  DEFAULT_SERVER_PORT,
  SITE_PORT,
  REQUEST_TIMEOUT,
  isFileProtocol,
  isSameOriginDeployment,
  trimTrailingSlash,
  normalizeBaseUrl,
  readUrlOverride,
  readStoredBaseUrl,
  storeBaseUrl,
  resolveApiBase,
  buildUrl,
  describeBackend
}
