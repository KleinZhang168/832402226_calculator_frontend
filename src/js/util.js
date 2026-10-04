/**
 * Small helpers that contain no business logic, which keeps them easy to test:
 *   * formatInteger - thousands separators
 *   * escapeHtml    - escaping for template interpolation
 *   * debounce      - input debouncing for the live preview
 *   * sleep         - waiting between retries
 */

/**
 * Group the integer part with thousands separators.
 * Only plain integers are touched; decimals and scientific notation such as
 * 1E+20 are returned unchanged:
 *   1234567  -> '1,234,567'
 *   '-1234'  -> '-1,234'
 *   '1E+20'  -> '1E+20'
 */
export function formatInteger(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) {
    return ''
  }
  if (!/^-?\d+$/.test(text)) {
    return text
  }
  const negative = text.startsWith('-')
  const digits = negative ? text.slice(1) : text
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? '-' + grouped : grouped
}

/** Escape HTML so that < > & " ' in an expression cannot break the markup */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Debounce: run fn only after `wait` milliseconds without another call */
export function debounce(fn, wait = 300) {
  let timer = null
  function debounced(...args) {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      fn.apply(this, args)
    }, wait)
  }
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return debounced
}

/** Wait for a number of milliseconds */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** True when the value is a plain object */
export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export default {
  formatInteger,
  escapeHtml,
  debounce,
  sleep,
  isPlainObject
}
