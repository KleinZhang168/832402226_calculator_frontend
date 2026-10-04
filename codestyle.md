# Code style - 832402226_calculator_frontend

## Source of this standard

The rules below are derived from widely used JavaScript standards and from the
style guides of major communities and vendors:

* **MDN Web Docs - JavaScript style guide** (primary source for language usage):
  <https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Writing_style_guide/Code_style_guide/JavaScript>
* **Google JavaScript Style Guide** (naming, modules, comments):
  <https://google.github.io/styleguide/jsguide.html>
* **Airbnb JavaScript Style Guide** (statements, functions, arrays and objects):
  <https://github.com/airbnb/javascript>
* **StandardJS** (semicolon-free style, two space indentation):
  <https://standardjs.com/rules.html>
* **W3C / WHATWG HTML and CSS guidance**, plus the **BEM naming convention**
  for class names: <https://getbem.com/naming/>

This project follows the style of **StandardJS** with 2 space indentation, no
semicolons and single quotes, which is also the convention used by the
JavaScript tooling ecosystem around ES Modules.

---

## 1. Layout

* Indent with **2 spaces**; tabs are forbidden.
* Maximum line length is **100 characters**.
* One statement per line.
* A file ends with exactly one newline and contains no trailing whitespace.
* Line endings in the repository are **LF**.

```js
const data = await fetchHistory(targetPage, PAGE_SIZE).catch((error) => {
  state.errorMessage = error.message
  return null
})
```

---

## 2. Semicolons, quotes and commas

* **No semicolons** (StandardJS): statements end at the newline, and a line that
  starts with `(`, `[`, `` ` ``, `+`, `-`, `/` is avoided so automatic semicolon
  insertion can never surprise the reader.
* Use **single quotes** for strings; template literals are used when
  interpolation genuinely improves readability.
* Trailing commas are omitted in function arguments but kept in multi line
  arrays and objects where they make diffs smaller.
* Always use strict equality (`===`, `!==`).

---

## 3. Naming

| Kind | Convention | Example |
| --- | --- | --- |
| File, directory | `kebab-case` or `lowercase` | `calculator.js`, `views/` |
| Function, variable | `lowerCamelCase` | `renderRecord`, `previewCallId` |
| Constant (module level) | `UPPER_SNAKE_CASE` | `PAGE_SIZE`, `PREVIEW_DELAY` |
| Class, constructor | `UpperCamelCase` | `IntersectionObserver` usage only |
| Private module state | `lowerCamelCase`, module scoped | `let root = null` |
| CSS class | BEM: `block__element--modifier` | `calc__result-text--preview` |
| DOM id | `lowerCamelCase` | `resultText`, `historyBody` |
| Custom data attribute | `data-*`, lowercase | `data-action`, `data-long-value` |

Rules:

* Names describe intent: `previewCallId` rather than `id2`.
* Boolean variables read as assertions: `isEditable`, `previewOnly`, `finished`.
* Event handlers are prefixed with `on` (`onKeypadClick`) and are never used as
  inline HTML attributes.

---

## 4. Modules

* One responsibility per module; the file name says what it holds.
* Only ES Module syntax: `import` / `export`. `require` is never used.
* Named exports are preferred; a default export is added when a module is a
  coherent object (for example `export default { mount, unmount }`).
* Views are loaded lazily with a dynamic `import()` inside the router.
* The public surface of a module is re-exported explicitly through an
  `export default { ... }` block at the end of the file.

---

## 5. Documentation comments

* Every module starts with a JSDoc block explaining its role, its responsibility
  boundary and any non-obvious decision.
* Every exported function has a JSDoc block with `@param` and `@returns` tags.
* Comments explain **why**, not what the next line does. A comment that merely
  restates the code is deleted.
* Notes that prevent a future mistake are kept next to the code they protect,
  for example the explanation of why the backspace icon is inline SVG, or why
  `suppressClick` needs a safety timer.
* The language of the code base, comments and documentation is **English**.

```js
/**
 * Resolve the base URL that will be used.
 *
 * @param {object} [options]
 * @param {Location} [options.location] browser location, defaults to window.location
 * @returns {{baseUrl: string, source: string, reason: string}}
 */
```

---

## 6. DOM and rendering

* Views are functions returning an HTML string, injected once by the router.
* Any value interpolated into HTML passes through `escapeHtml()`; the only
  exception is a trusted module level constant (the backspace SVG).
* Event handling uses **delegation**: one listener per event type on the keypad
  container instead of twenty listeners on the keys.
* Every listener added in `mount()` is removed in `unmount()`; timers and
  observers are cleared there too, so a view can be mounted repeatedly.
* The DOM is updated through `textContent` and `classList` rather than by
  rewriting innerHTML whenever only text changes.
* `state` is the single source of truth for a view; rendering never mutates it.

---

## 7. Asynchronous code

* `async` / `await` is used instead of promise chains.
* Every network call has a timeout, implemented with `AbortController`.
* Failures are normalised into one object shape (`{ code, message }`) so callers
  only need a single `catch`.
* Race conditions are prevented with a sequence number: only the response whose
  id still matches the latest request may update the interface (`previewCallId`).
* Requests are not awaited inside `unmount()`; the views check a `destroyed`
  flag instead.

---

## 8. Styling

* Class names follow BEM and start from the block name of the view
  (`calc__key`, `history__record-delete`).
* All colours, sizes and timings come from custom properties defined in
  `tokens.css`; literal colour values do not appear in the view stylesheets.
* Layout uses flexbox and grid; `!important` is not used.
* The visual design is responsive: mobile first, with a centred phone-width
  column on desktop and a smaller unit scale on short windows.
* Accessibility: interactive elements are real `<button>`s with an
  `aria-label` where the label is an icon; the result area uses `aria-live`.

---

## 9. Error handling and logging

* The user sees a message for every failure: inline in the result area, as a
  toast, or as an empty/error state in the history view.
* The console is used for diagnostics only, always prefixed with the module name
  in brackets: `console.warn('[store] subscriber failed:', error)`.
* No `debugger` statement and no `console.log` of business data remain in the
  committed code; the start-up banner in `app.js` is intentional.

---

## 10. Formatting summary

| Item | Rule |
| --- | --- |
| Indentation | 2 spaces |
| Maximum line length | 100 characters |
| Semicolons | omitted |
| Quotes | single |
| Equality | `===` / `!==` only |
| Trailing whitespace | none |
| File encoding | UTF-8, no BOM |
| Final newline | exactly one |
| Line endings | LF in the repository |
