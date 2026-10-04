/**
 * Network layer.
 *
 * Both kinds of failure are normalised into a single error object so that a view
 * only needs one catch block:
 *   1. transport failure (backend down, wrong URL, timeout, blocked by CORS)
 *      -> code = 'NETWORK_ERROR'
 *   2. application failure (the backend answered success:false, for example a
 *      division by zero) -> code = the code returned by the backend
 *
 * The front-end performs no arithmetic: every value it displays comes from a
 * response produced by these requests.
 */
import { REQUEST_TIMEOUT, buildUrl, resolveApiBase } from './config.js'
import { isPlainObject } from './util.js'

/** Active backend configuration, resolved once when the module loads */
export const backend = resolveApiBase()

/** Human readable explanation of where the base URL came from */
export const BACKEND_SOURCE_LABEL = {
  query: 'specified by URL parameter',
  storage: 'remembered locally',
  'same-origin': 'same origin as the page',
  'local-dev': 'local backend',
  lan: 'inferred from the LAN host',
  'file-protocol': 'file:// fallback'
}

/**
 * Build the unified error object.
 * @param {string} code    error code (NETWORK_ERROR / HTTP_ERROR / backend code)
 * @param {string} message user facing message
 * @param {object} [extra] additional details such as statusCode or raw
 */
export function createApiError(code, message, extra) {
  return Object.assign({ code, message }, extra || {})
}

/** Troubleshooting hint shown when the backend cannot be reached */
export function buildNetworkHint() {
  const target = backend.baseUrl || 'relative URL (same origin)'
  return (
    'Cannot reach the backend service\n' + target + '\n' +
    'Check that: 1) the backend is running (python run.py); ' +
    '2) the backend URL is correct (you can set it with ?api=http://host:5000); ' +
    '3) the page was opened over HTTP rather than by double clicking the file'
  )
}

/**
 * Send a request.
 *
 * @param {object} options
 * @param {string} options.url             endpoint path starting with /, e.g. '/api/calculate'
 * @param {string} [options.method='GET']  HTTP method
 * @param {object} [options.data]          request body, serialised as JSON
 * @returns {Promise<object>} the parsed response body, already known to have success === true
 */
export async function request(options) {
  const { url, method = 'GET', data = null, timeout = REQUEST_TIMEOUT } = options

  const init = {
    method: String(method).toUpperCase(),
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors',
    cache: 'no-store'
  }

  const target = buildUrl(backend.baseUrl, url)

  if (data !== null && data !== undefined) {
    init.body = JSON.stringify(data)
  }

  // Timeout handling uses AbortController, which browsers provide natively.
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer = null
  if (controller) {
    init.signal = controller.signal
    timer = setTimeout(() => controller.abort(), timeout)
  }

  let response
  try {
    response = await fetch(target, init)
  } catch (error) {
    // fetch only rejects on transport errors: backend down, DNS failure,
    // blocked by CORS, or aborted by the timeout above.
    const aborted = Boolean(error) && error.name === 'AbortError'
    throw createApiError(
      'NETWORK_ERROR',
      aborted ? 'Request timed out after ' + timeout + ' ms; the backend did not respond' : buildNetworkHint(),
      { raw: error, aborted }
    )
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }

  const statusCode = response.status
  const httpOk = statusCode >= 200 && statusCode < 300

  // Read the body: the backend always returns JSON, but a proxy or a static
  // server may return HTML instead.
  let body = null
  let rawText = ''
  try {
    rawText = await response.text()
    body = rawText ? JSON.parse(rawText) : null
  } catch (error) {
    body = null
  }

  // Case 1: both the HTTP status and the application result are successful.
  if (httpOk && isPlainObject(body) && body.success) {
    return body
  }

  // Case 2: the backend returned its standard error structure.
  if (isPlainObject(body) && body.message) {
    throw createApiError(body.code || 'API_ERROR', body.message, { statusCode, body })
  }

  // Case 3: a response arrived but is not the expected structure, for example an
  // HTML error page from a reverse proxy.
  throw createApiError(
    'HTTP_ERROR',
    'Request failed (HTTP ' + statusCode + ')' +
      (rawText && !body ? ': ' + rawText.slice(0, 120) : ''),
    { statusCode }
  )
}

export default request
