/**
 * Calculator view.
 *
 * Responsibility boundary (the design rule of this project):
 *   - render the interface and handle button interactions
 *   - edit the expression as text (append / delete / clear)
 *   - send calculation requests and display what the backend returns
 *   - NEVER evaluate + - * / ^ in the browser
 *   - NEVER invent a result when the backend is unreachable
 *
 * Two design details worth explaining:
 *   1. The keypad has 4 x 5 = 20 keys. The power operator ^ is entered by long
 *      pressing any operator key, hinted by a small dot in the corner of those
 *      keys; it can also be typed directly. Desktop keyboards work as well.
 *   2. Besides submitting with =, typing pauses are followed by a request to
 *      POST /api/calculate/preview, which evaluates without storing. That result
 *      also comes from the backend, and it is cleared as soon as the expression
 *      changes, so the interface never shows a value that is not in the history
 *      for an unexplained reason.
 */
import { previewCalculate } from '../api.js'
import { refreshHistoryCount } from '../app.js'
import { toastError } from '../ui.js'
import { debounce, escapeHtml } from '../util.js'

/** The API function is aliased so that submit() below stays unambiguous. */
import { calculate as apiCalculate } from '../api.js'

/**
 * Backspace icon, drawn as inline SVG instead of the character U+232B.
 * U+232B is missing from the font stack on some systems and renders as an empty
 * box; inline SVG does not depend on fonts and looks the same everywhere.
 *
 * This constant must be declared before KEY_ROWS, which references it: const
 * bindings are in the temporal dead zone until initialised, and reversing the
 * order would break the whole module.
 */
const BACKSPACE_ICON =
  '<svg class="calc__key-icon" viewBox="0 0 24 24" width="1.375rem" height="1.375rem"' +
  ' aria-hidden="true" focusable="false">' +
  '<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2.6 12.6a.85.85 0 0 1 0-1.2L9 5z"' +
  ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
  '<path d="M12 9.5l5 5M17 9.5l-5 5" fill="none" stroke="currentColor"' +
  ' stroke-width="1.7" stroke-linecap="round"/>' +
  '</svg>'

/** Keypad layout: 4 columns x 5 rows */
const KEY_ROWS = [
  [
    { label: 'C', action: 'clear', type: 'func' },
    { label: 'Backspace', action: 'backspace', type: 'func', icon: BACKSPACE_ICON },
    { label: '(', action: 'insert', value: '(', type: 'func' },
    { label: ')', action: 'insert', value: ')', type: 'func' }
  ],
  [
    { label: '7', action: 'insert', value: '7', type: 'num' },
    { label: '8', action: 'insert', value: '8', type: 'num' },
    { label: '9', action: 'insert', value: '9', type: 'num' },
    { label: '÷', action: 'insert', value: '/', type: 'op', longValue: '^', longHint: 'Long press ÷ to type ^ (power)' }
  ],
  [
    { label: '4', action: 'insert', value: '4', type: 'num' },
    { label: '5', action: 'insert', value: '5', type: 'num' },
    { label: '6', action: 'insert', value: '6', type: 'num' },
    { label: '×', action: 'insert', value: '*', type: 'op', longValue: '^', longHint: 'Long press × to type ^ (power)' }
  ],
  [
    { label: '1', action: 'insert', value: '1', type: 'num' },
    { label: '2', action: 'insert', value: '2', type: 'num' },
    { label: '3', action: 'insert', value: '3', type: 'num' },
    { label: '−', action: 'insert', value: '-', type: 'op', longValue: '^', longHint: 'Long press − to type ^ (power)' }
  ],
  [
    { label: '0', action: 'insert', value: '0', type: 'num' },
    { label: '.', action: 'insert', value: '.', type: 'num' },
    { label: '+', action: 'insert', value: '+', type: 'op', longValue: '^', longHint: 'Long press + to type ^ (power)' },
    { label: '=', action: 'equals', type: 'equals' }
  ]
]

/** Default hint below the keypad */
const DEFAULT_HINT = 'Long press an operator to type ^ (power), or press the ^ key on a keyboard'

/** Live preview debounce delay in milliseconds */
const PREVIEW_DELAY = 500

/** Long press threshold in milliseconds */
const LONG_PRESS_MS = 420

/** View state */
const state = {
  expression: '',
  /** Result string returned by the backend */
  resultText: '',
  /** Error message returned by the backend */
  errorMessage: '',
  /** Expression of the most recent successful submission */
  lastExpression: '',
  /** A submit request is in flight */
  loading: false,
  /** A preview request is in flight */
  previewing: false,
  /** The current result comes from the live preview only (not stored yet) */
  previewOnly: false,
  /** The result is outdated because the expression changed again */
  stale: false,
  /** Hint shown below the keypad */
  hint: DEFAULT_HINT
}

let root = null
let refs = {}
let longPressTimer = null
let suppressClick = false
/** Safety timer that always clears suppressClick */
let suppressClickTimer = null
let docKeyHandler = null

/** Preview request sequence number: only the latest response may be rendered */
let previewCallId = 0

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function keyClass(key) {
  return 'calc__key calc__key--' + key.type
}

function renderKeypad() {
  return KEY_ROWS.map((row) => {
    const keys = row.map((key) => {
      const longAttrs = key.longValue
        ? ' data-long-value="' + escapeHtml(key.longValue) + '"' +
          ' data-long-hint="' + escapeHtml(key.longHint) + '"' +
          ' aria-label="' + escapeHtml(key.label) + ', ' + escapeHtml(key.longHint) + '"'
        : ''
      // icon is a trusted constant (only the backspace key uses it); labels are
      // always escaped.
      const inner = key.icon
        ? key.icon
        : '<span class="calc__key-text">' + escapeHtml(key.label) + '</span>'
      const aria = key.icon ? ' aria-label="' + escapeHtml(key.label) + '"' : ''
      return (
        '<button type="button" class="' + keyClass(key) + '"' +
        ' data-action="' + escapeHtml(key.action) + '"' +
        ' data-value="' + escapeHtml(key.value || '') + '"' +
        longAttrs + aria + '>' +
        inner +
        '</button>'
      )
    }).join('')
    return '<div class="calc__key-row">' + keys + '</div>'
  }).join('')
}

function renderTemplate() {
  return (
    '<section class="calc">' +
    // ---------- display ----------
    '<div class="calc__display">' +
    '<div class="calc__input-row">' +
    '<input class="calc__input" id="calcInput" type="text" inputmode="text"' +
    ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
    ' placeholder="Enter an expression, for example (1+2)*3"' +
    ' aria-label="Expression input" />' +
    '</div>' +
    '<div class="calc__divider"></div>' +
    '<div class="calc__result">' +
    '<span class="calc__result-sign">=</span>' +
    '<span class="calc__result-text calc__result-text--muted" id="resultText"' +
    ' aria-live="polite">Waiting for the backend</span>' +
    '</div>' +
    '<div class="calc__meta" id="resultMeta" hidden></div>' +
    '</div>' +

    // ---------- flexible gap: lets the illustration show through ----------
    '<div class="calc__spacer"></div>' +

    // ---------- keypad ----------
    '<div class="calc__keypad" id="keypad">' + renderKeypad() + '</div>' +
    '<p class="calc__hint" id="calcHint">' + escapeHtml(DEFAULT_HINT) + '</p>' +

    // ---------- footer ----------
    '<p class="calc__footer">Every result is computed by the Flask backend and stored in SQLite</p>' +
    '</section>'
  )
}

/** Render the state into the DOM */
function render() {
  if (!refs.input || !refs.result) {
    return
  }

  // Only assign when the value differs, so typing is not interrupted.
  if (refs.input.value !== state.expression) {
    refs.input.value = state.expression
  }

  const result = refs.result
  result.classList.remove(
    'calc__result-text--muted',
    'calc__result-text--error',
    'calc__result-text--preview',
    'calc__result-text--final'
  )
  result.classList.toggle('calc__result-text--stale', state.stale)
  result.style.fontSize = ''

  if (state.loading && !state.resultText && !state.errorMessage) {
    result.textContent = 'Calculating...'
    result.classList.add('calc__result-text--muted')
  } else if (state.errorMessage) {
    result.textContent = state.errorMessage
    result.classList.add('calc__result-text--error')
  } else if (state.resultText) {
    result.textContent = state.resultText
    // Preview and final states are mutually exclusive: the preview is faint with
    // a dashed underline, a stored result uses the solid primary colour.
    result.classList.add(
      state.previewOnly ? 'calc__result-text--preview' : 'calc__result-text--final'
    )
  } else if (state.loading) {
    result.textContent = 'Calculating...'
    result.classList.add('calc__result-text--muted')
  } else if (state.previewing) {
    result.textContent = 'Previewing...'
    result.classList.add('calc__result-text--muted')
  } else {
    result.textContent = 'Waiting for the backend'
    result.classList.add('calc__result-text--muted')
  }

  // Provenance line under the result.
  if (refs.meta) {
    if (state.errorMessage || !state.resultText || !state.lastExpression) {
      refs.meta.hidden = true
      refs.meta.textContent = ''
    } else if (state.previewOnly) {
      refs.meta.hidden = false
      refs.meta.textContent = 'Live preview - press = to store it in the history'
    } else {
      refs.meta.hidden = false
      refs.meta.textContent = 'Saved to history - ' + state.lastExpression + ' = ' + state.resultText
    }
  }

  if (refs.keypad) {
    refs.keypad.classList.toggle('is-busy', state.loading)
  }
  if (refs.hint) {
    refs.hint.textContent = state.hint
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

/** The expression changed: drop the previous result and invalidate any preview */
function onExpressionChanged() {
  previewCallId += 1
  state.resultText = ''
  state.errorMessage = ''
  state.lastExpression = ''
  state.previewOnly = false
  state.stale = false
}

/** Cancel a pending preview timer and any in-flight preview request */
function cancelPreview() {
  previewCallId += 1
  if (state.previewing) {
    state.previewing = false
  }
  if (debouncedPreview && typeof debouncedPreview.cancel === 'function') {
    debouncedPreview.cancel()
  }
}

/**
 * Live preview: evaluate without storing.
 * Nothing is previewed while a submission is running or when the expression is
 * empty.
 */
async function runPreview() {
  const expression = state.expression.trim()
  if (!expression || state.loading) {
    return
  }

  previewCallId += 1
  const callId = previewCallId
  state.previewing = true
  render()

  try {
    const data = await previewCalculate(expression)
    if (callId !== previewCallId || !root) {
      return
    }
    state.previewing = false
    state.errorMessage = ''
    state.resultText = String(data.resultText != null ? data.resultText : data.result)
    state.lastExpression = data.expression || expression
    state.previewOnly = true
    state.stale = false
    render()
  } catch (error) {
    if (callId !== previewCallId || !root) {
      return
    }
    state.previewing = false
    // A failed preview raises no toast: the expression may simply be incomplete,
    // for example "1+". Pressing = then reports the real error from the backend.
    state.resultText = ''
    state.errorMessage = ''
    render()
  }
}

const debouncedPreview = debounce(runPreview, PREVIEW_DELAY)

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/** Append text to the expression and repaint immediately (no request awaited) */
function appendText(text) {
  if (text === undefined || text === null) {
    return
  }
  cancelPreview()
  onExpressionChanged()
  state.expression = state.expression + text
  render()
  schedulePreview()
}

/** Schedule a delayed preview; an empty expression triggers no request */
function schedulePreview() {
  if (!state.expression.trim()) {
    return
  }
  debouncedPreview()
}

/** Clear the expression and the result */
function clearAll() {
  cancelPreview()
  onExpressionChanged()
  state.expression = ''
  state.hint = DEFAULT_HINT
  render()
}

/** Delete the last character */
function backspace() {
  if (!state.expression) {
    return
  }
  cancelPreview()
  onExpressionChanged()
  state.expression = state.expression.slice(0, -1)
  render()
  schedulePreview()
}

/** Submit for evaluation: the result comes entirely from the backend */
async function submit() {
  const expression = state.expression.trim()

  if (!expression) {
    state.resultText = ''
    state.errorMessage = 'Enter an expression first'
    state.lastExpression = ''
    render()
    return
  }
  if (state.loading) {
    return
  }

  cancelPreview()
  state.loading = true
  state.resultText = ''
  state.errorMessage = ''
  state.lastExpression = ''
  state.previewOnly = false
  state.stale = false
  render()

  try {
    const data = await apiCalculate(expression)
    state.loading = false
    state.resultText = String(data.resultText != null ? data.resultText : data.result)
    state.lastExpression = data.expression || expression
    state.previewOnly = false
    state.stale = false
    render()
    refreshHistoryCount()
  } catch (error) {
    state.loading = false
    state.resultText = ''
    state.previewOnly = false
    if (error && error.code === 'NETWORK_ERROR') {
      state.errorMessage = 'Cannot reach the backend service'
      toastError('Backend offline. Start it with: python run.py')
    } else {
      state.errorMessage = (error && error.message) || 'Calculation failed'
    }
    state.lastExpression = ''
    render()
  }
}

/** Handle one key press */
function handleKey(key) {
  if (!key) {
    return
  }
  if (key.action === 'clear') {
    clearAll()
    return
  }
  if (key.action === 'backspace') {
    backspace()
    return
  }
  if (key.action === 'equals') {
    submit()
    return
  }
  appendText(key.value)
}

/** Show a hint temporarily, then restore the default */
function flashHint(text) {
  state.hint = text
  render()
  setTimeout(() => {
    if (state.hint === text) {
      state.hint = DEFAULT_HINT
      render()
    }
  }, 2200)
}

// ---------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------

function onKeypadPointerDown(event) {
  const button = event.target.closest('.calc__key')
  if (!button || !refs.keypad.contains(button)) {
    return
  }
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    // After a long press the following click must be ignored, otherwise the
    // plain character would be inserted as well. Browsers normally dispatch a
    // click after pointerup which consumes this flag; if that never happens the
    // flag would stick and disable every later key, hence the safety timer.
    suppressClick = true
    if (suppressClickTimer) {
      clearTimeout(suppressClickTimer)
    }
    suppressClickTimer = setTimeout(() => {
      suppressClick = false
      suppressClickTimer = null
    }, 700)
    const longValue = button.dataset.longValue
    if (longValue) {
      appendText(longValue)
      flashHint(button.dataset.longHint || DEFAULT_HINT)
    }
  }, LONG_PRESS_MS)
}

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onKeypadPointerUp() {
  clearLongPressTimer()
}

function onKeypadClick(event) {
  const button = event.target.closest('.calc__key')
  if (!button || !refs.keypad.contains(button)) {
    return
  }
  if (suppressClick) {
    suppressClick = false
    if (suppressClickTimer) {
      clearTimeout(suppressClickTimer)
      suppressClickTimer = null
    }
    return
  }
  handleKey({
    action: button.dataset.action,
    value: button.dataset.value
  })
}

function onInputEvent() {
  cancelPreview()
  onExpressionChanged()
  state.expression = refs.input.value
  render()
  schedulePreview()
}

/** Desktop shortcuts: digits and operators insert, Enter evaluates, Esc clears */
function onDocumentKeydown(event) {
  if (!root) {
    return
  }
  const target = event.target
  const isEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  const key = event.key

  if (key === 'Enter' && isEditable) {
    event.preventDefault()
    submit()
    return
  }
  if (key === 'Escape' && isEditable) {
    event.preventDefault()
    clearAll()
    return
  }
  // When the focus is not in the input, the keypad can be driven from the keyboard.
  if (isEditable) {
    return
  }
  if (/^[0-9]$/.test(key)) {
    appendText(key)
    event.preventDefault()
  } else if (key === '.' || key === '(' || key === ')') {
    appendText(key)
    event.preventDefault()
  } else if (key === '+' || key === '-') {
    appendText(key)
    event.preventDefault()
  } else if (key === '*' || key === 'x' || key === 'X') {
    appendText('*')
    event.preventDefault()
  } else if (key === '/') {
    appendText('/')
    event.preventDefault()
  } else if (key === '^') {
    appendText('^')
    event.preventDefault()
  } else if (key === 'Backspace') {
    backspace()
    event.preventDefault()
  } else if (key === 'Enter' || key === '=') {
    submit()
    event.preventDefault()
  } else if (key === 'Escape' || key === 'c' || key === 'C') {
    clearAll()
    event.preventDefault()
  }
}

// ---------------------------------------------------------------------------
// View life cycle
// ---------------------------------------------------------------------------

export function mount(container) {
  root = container
  root.innerHTML = renderTemplate()

  refs = {
    input: root.querySelector('#calcInput'),
    result: root.querySelector('#resultText'),
    meta: root.querySelector('#resultMeta'),
    keypad: root.querySelector('#keypad'),
    hint: root.querySelector('#calcHint')
  }

  // One delegated listener per event type covers all 20 keys.
  refs.keypad.addEventListener('pointerdown', onKeypadPointerDown)
  refs.keypad.addEventListener('pointerup', onKeypadPointerUp)
  refs.keypad.addEventListener('pointercancel', onKeypadPointerUp)
  refs.keypad.addEventListener('pointerleave', onKeypadPointerUp)
  refs.keypad.addEventListener('click', onKeypadClick)
  refs.input.addEventListener('input', onInputEvent)

  docKeyHandler = onDocumentKeydown
  document.addEventListener('keydown', docKeyHandler)

  // Focus the input so a desktop user can start typing straight away.
  if (!state.expression) {
    refs.input.focus({ preventScroll: true })
  }
  render()
}

export function unmount() {
  clearLongPressTimer()
  if (suppressClickTimer) {
    clearTimeout(suppressClickTimer)
    suppressClickTimer = null
  }
  suppressClick = false
  cancelPreview()
  if (refs.keypad) {
    refs.keypad.removeEventListener('pointerdown', onKeypadPointerDown)
    refs.keypad.removeEventListener('pointerup', onKeypadPointerUp)
    refs.keypad.removeEventListener('pointercancel', onKeypadPointerUp)
    refs.keypad.removeEventListener('pointerleave', onKeypadPointerUp)
    refs.keypad.removeEventListener('click', onKeypadClick)
  }
  if (refs.input) {
    refs.input.removeEventListener('input', onInputEvent)
  }
  if (docKeyHandler) {
    document.removeEventListener('keydown', docKeyHandler)
    docKeyHandler = null
  }
  refs = {}
  root = null
}

export default { mount, unmount }
