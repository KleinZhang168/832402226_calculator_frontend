/**
 * Lightweight UI feedback helpers, replacing the toast / loading / modal APIs of
 * the original uni-app version:
 *   * toast(message, options)                transient message
 *   * showLoading(message) / hideLoading()   spinner style message
 *   * confirmDialog(options)                 confirmation, returns Promise<boolean>
 *
 * No framework is required. Dialogs use the native <dialog> element and fall
 * back to window.confirm where it is unavailable.
 */

const TOAST_LAYER_ID = 'toastLayer'

/** Default lifetime of a toast in milliseconds */
const DEFAULT_DURATION = 1800
const ERROR_DURATION = 2800

/** At most this many toasts are visible; older ones are dropped */
const MAX_TOASTS = 3

/** The toast currently used as a loading indicator, if any */
let loadingToast = null

function getLayer() {
  let layer = document.getElementById(TOAST_LAYER_ID)
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'toast-layer'
    layer.id = TOAST_LAYER_ID
    layer.setAttribute('role', 'status')
    layer.setAttribute('aria-live', 'polite')
    document.body.appendChild(layer)
  }
  return layer
}

function removeToast(element) {
  if (!element || !element.parentNode) {
    return
  }
  element.classList.remove('is-visible')
  const drop = () => {
    if (element.parentNode) {
      element.parentNode.removeChild(element)
    }
  }
  element.addEventListener('transitionend', drop, { once: true })
  // transitionend does not always fire (for example on a hidden element), so a
  // timer backs it up.
  setTimeout(drop, 400)
}

/**
 * Show a transient message.
 *
 * @param {string} message text to show
 * @param {object} [options]
 * @param {'info'|'success'|'error'} [options.type='info']
 * @param {number} [options.duration] lifetime in milliseconds; errors default to
 *        2800 and other messages to 1800. Pass 0 to keep it on screen.
 * @returns {HTMLElement|null} the created node
 */
export function toast(message, options = {}) {
  const text = String(message == null ? '' : message).trim()
  if (!text) {
    return null
  }

  const layer = getLayer()
  const type = options.type || 'info'
  const duration = options.duration === undefined
    ? (type === 'error' ? ERROR_DURATION : DEFAULT_DURATION)
    : options.duration

  const element = document.createElement('div')
  element.className = 'toast' + (type === 'info' ? '' : ' toast--' + type)
  element.textContent = text
  layer.appendChild(element)

  // Drop the oldest messages beyond the limit.
  while (layer.children.length > MAX_TOASTS) {
    removeToast(layer.firstElementChild)
  }

  // Add the class on the next frame so the transition can run.
  requestAnimationFrame(() => element.classList.add('is-visible'))

  if (duration > 0) {
    setTimeout(() => removeToast(element), duration)
  }
  return element
}

/** Success message */
export function toastSuccess(message, options = {}) {
  return toast(message, Object.assign({ type: 'success' }, options))
}

/** Error message, shown for longer */
export function toastError(message, options = {}) {
  return toast(message, Object.assign({ type: 'error' }, options))
}

/**
 * Show a loading message. Only one can be visible at a time.
 * @param {string} [message='Loading...']
 */
export function showLoading(message = 'Loading...') {
  hideLoading()
  loadingToast = toast(message, { duration: 0 })
}

/** Hide the loading message */
export function hideLoading() {
  if (loadingToast) {
    removeToast(loadingToast)
    loadingToast = null
  }
}

/** Does this browser support the native <dialog> element? */
function supportsDialog() {
  const element = document.createElement('dialog')
  return typeof element.showModal === 'function'
}

/**
 * Confirmation dialog.
 *
 * @param {object} options
 * @param {string} options.title            heading
 * @param {string} [options.content]        body text
 * @param {string} [options.confirmText='OK']
 * @param {string} [options.cancelText='Cancel']
 * @param {'primary'|'danger'} [options.tone='primary'] confirm button style
 * @returns {Promise<boolean>} true when the user confirmed
 */
export function confirmDialog(options = {}) {
  const title = options.title || 'Please confirm'
  const content = options.content || ''
  const confirmText = options.confirmText || 'OK'
  const cancelText = options.cancelText || 'Cancel'
  const tone = options.tone === 'danger' ? 'danger' : 'primary'

  if (!supportsDialog()) {
    const text = content ? title + '\n\n' + content : title
    return Promise.resolve(window.confirm(text))
  }

  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'app-dialog'
    dialog.innerHTML =
      '<div class="app-dialog__body">' +
      '<h2 class="app-dialog__title"></h2>' +
      '<p class="app-dialog__text"></p>' +
      '</div>' +
      '<div class="app-dialog__actions">' +
      '<button type="button" class="app-dialog__btn" data-action="cancel"></button>' +
      '<button type="button" class="app-dialog__btn app-dialog__btn--' + tone +
      '" data-action="confirm"></button>' +
      '</div>'

    // textContent is used so that special characters are never treated as HTML.
    dialog.querySelector('.app-dialog__title').textContent = title
    const textNode = dialog.querySelector('.app-dialog__text')
    textNode.textContent = content
    if (!content) {
      textNode.hidden = true
    }
    dialog.querySelector('[data-action="cancel"]').textContent = cancelText
    dialog.querySelector('[data-action="confirm"]').textContent = confirmText

    let settled = false
    const finish = (value) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close()
      }
      if (dialog.parentNode) {
        dialog.parentNode.removeChild(dialog)
      }
    }

    dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false))
    dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => finish(true))
    // Closing with ESC counts as a cancel.
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish(false)
    })

    document.body.appendChild(dialog)
    dialog.showModal()
    dialog.querySelector('[data-action="confirm"]').focus()
  })
}

export default { toast, toastSuccess, toastError, showLoading, hideLoading, confirmDialog }
