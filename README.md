# 832402226_calculator_frontend

> A front-end / back-end separated calculator - **client**
> Student ID: 832402226 | Stack: native HTML + CSS + ES Modules (no build step)

This repository is the client side of the project. It renders the interface,
collects the expression typed by the user, sends it to the backend over HTTP and
displays whatever the backend returns. **It never evaluates an expression
itself.**

The companion service lives in the repository **832402226_calculator_backend**.

---

## 1. Project introduction

Two views are provided:

| View | Route | Purpose |
| --- | --- | --- |
| Calculator | `#/calculator` | Expression input (keypad or physical keyboard), submit, show the result or the backend error |
| History | `#/history` | Paged history list, pull to refresh, infinite scroll, delete one record, clear everything |

The interface uses the supplied illustration as a full-screen background
(`src/static/bg.png`), while the keypad and panels use a translucent frosted
glass style.

### Responsibility boundary

The front-end does:

* render the interface and handle button interactions;
* edit the expression as plain text (append, delete, clear);
* send calculation, history and delete requests;
* display the result, the error message and the history returned by the backend.

The front-end does **not**:

* evaluate `+ - * / ^` in any form;
* cache the history in localStorage or in memory;
* produce a result of its own when the backend is unreachable.

> **How to verify:** stop the backend and keep using the page. Buttons and typing
> still work, but pressing `=` only shows the red message
> "Cannot reach the backend service" - never a number.

---

## 2. Technology stack

| Aspect | Choice | Notes |
| --- | --- | --- |
| Language | JavaScript (ES2015+) with ES Modules | No framework, no transpiler |
| Markup and styling | HTML5 plus plain CSS | Custom properties for the design tokens |
| Networking | `fetch` with an AbortController timeout | No axios or other HTTP library |
| Routing | Custom hash router | Reloading and deep links work on any static host |
| State | Small store module with a subscribe callback | No Vuex or Redux |
| Icons | Inline SVG | Independent of the fonts installed on the device |
| Tooling | Node.js **only** for the optional verification scripts | The application itself needs no Node at runtime |

**There is no npm dependency and no build step.** The `src/` directory is served
as-is.

---

## 3. Directory structure

```
832402226_calculator_frontend/
├── src/
│   ├── calculator.html        entry page: background layer, top bar, view container
│   ├── css/
│   │   ├── tokens.css         design tokens (colours, sizes, motion)
│   │   ├── base.css           document setup, background layer, shell, shared components
│   │   ├── calculator.css     calculator view styles
│   │   └── history.css        history view styles
│   ├── js/
│   │   ├── app.js             start-up: router, backend probe, history counter
│   │   ├── config.js          backend URL resolution (the file to read first)
│   │   ├── api.js             the six backend endpoints
│   │   ├── http.js            fetch wrapper with unified error handling
│   │   ├── router.js          hash router (#/calculator, #/history)
│   │   ├── store.js           minimal shared state
│   │   ├── ui.js              toast, loading indicator, confirm dialog
│   │   ├── util.js            pure helpers (escaping, debounce, formatting)
│   │   └── views/
│   │       ├── calculator.js  calculator view
│   │       └── history.js     history view
│   └── static/
│       └── bg.png             background illustration
├── tools/
│   └── verify.mjs             optional end-to-end check driven by a real browser
├── README.md
└── codestyle.md
```

---

## 4. Runtime environment

| Item | Requirement |
| --- | --- |
| Browser | Any modern browser (Chrome, Edge, Firefox, Safari) |
| Backend | `832402226_calculator_backend` running on port 5000 |
| Node.js | Optional, only for `tools/verify.mjs` |
| Build tools | None |

---

## 5. Installation

Nothing to install: there are no npm packages and no compilation step.

```bash
# Just make sure the backend is available first
cd ../832402226_calculator_backend
python run.py
```

---

## 6. Configuration

### 6.1 Where the backend URL comes from

`src/js/config.js` resolves the backend base URL in this order:

| Order | Situation | Resulting base URL |
| --- | --- | --- |
| 1 | `?api=http://host:5000` is present in the URL | that address, also stored in localStorage |
| 2 | an address was remembered earlier | the remembered address |
| 3 | the page is served by the backend itself (standard web port, or port 5000) | relative `/api/...`, same origin |
| 4 | the page is on a local development port (8080, 5173, ...) | `http://<same host>:5000` |
| 5 | the page is opened from another host (phone on the LAN) | `http://<current host>:5000` |
| 6 | the page is opened from `file://` | `http://127.0.0.1:5000` plus a console warning |

**No configuration is needed in the normal cases.** A manual override is always
possible:

```
http://192.168.1.10:8080/src/calculator.html?api=http://192.168.1.10:5000
```

Two constants can be edited for a fixed environment:

```js
/** LAN IP of the backend machine (only used for phone testing) */
export const DEFAULT_LAN_HOST = '192.168.1.10'

/** Backend port, must match CALC_PORT on the backend */
export const DEFAULT_SERVER_PORT = 5000

/** Site port of a deployment; leave empty for a standard port */
export const SITE_PORT = ''
```

The console prints the resolved address and the reason it was chosen:

```
[832402226 Calculator] front-end started
  Backend URL : http://127.0.0.1:5000
  Resolved by : local backend (local development: page on http://127.0.0.1:8080, ...)
  Summary     : local-dev -> http://127.0.0.1:5000
```

### 6.2 Appearance

Colours, radii, font sizes and animation timings live in `src/css/tokens.css`.
Changing `--primary`, `--bg` and `--ink` reskins the whole application.

To use another illustration, replace `src/static/bg.png` (portrait 9:16 is
recommended) and set `--bg` in `tokens.css` to the base colour of the new image,
so the first paint does not flash white.

---

## 7. Startup

### 7.1 Start the backend first

```bash
cd ../832402226_calculator_backend
python run.py
```

`Running on http://0.0.0.0:5000` means the API is ready.

### 7.2 Serve the front-end over HTTP

A static file server is required: opening `calculator.html` from disk uses the
`file://` protocol, which makes the browser treat the origin as `null` and block
the API requests.

```bash
# From the repository root, serving the src/ directory
cd src
python -m http.server 8080
```

Then open <http://127.0.0.1:8080/calculator.html>. The status chip in the top
bar turns green ("Backend online") once the two sides are connected.

Any other static server works as well, for example
`npx serve src` or the Live Server extension of your editor.

### 7.3 Optional: let the backend serve the pages

When a copy of `src/` is placed in `src/web/` inside the backend repository (or
`CALC_FRONTEND_DIR` points at it), the backend serves the front-end from the same
origin. This is the mode used by the free cloud deployment: a single URL covers
both the UI and the API and no cross origin request is made.

---

## 8. Database initialisation

The front-end has no database of its own. All records live in the SQLite file of
the backend, which creates it automatically on first start. See the backend
README, section 7.

---

## 9. How the front-end talks to the backend

Every request goes through `src/js/api.js`; views never build URLs themselves.

| Front-end function | Request | Backend endpoint |
| --- | --- | --- |
| `checkHealth()` | GET | `/api/health` |
| `calculate(expression)` | POST | `/api/calculate` (stores the record) |
| `previewCalculate(expression)` | POST | `/api/calculate/preview` (evaluates only) |
| `fetchHistory(page, pageSize)` | GET | `/api/history?page&pageSize` |
| `fetchHistoryCount()` | GET | `/api/history/count` |
| `deleteHistory(id)` | DELETE | `/api/history/{id}` |
| `clearHistory()` | DELETE | `/api/history` |

Response contract:

```json
{ "success": true, "id": 1, "expression": "(1+2)*3", "result": 9, "resultText": "9", "createdAt": "2026-10-01 10:20:00" }
```

```json
{ "success": false, "code": "DIVIDE_BY_ZERO", "message": "Division by zero is not allowed" }
```

Two details worth remembering:

1. Display `resultText`, not `result`: the numeric field cannot represent very
   large or very precise values exactly.
2. Show the `expression` returned by the backend: it is normalised, so `6×7` is
   stored as `6*7`.

---

## 10. Feature notes

### 10.1 Calculator view

* A 4 x 5 keypad; the expression can also be typed with a physical keyboard
  (digits and `+ - * / ^ ( ) .`, `Enter` to evaluate, `Backspace` to delete,
  `Esc` to clear).
* **Power operator:** long press any operator key (`÷ × − +`) to insert `^`, or
  type `^` directly. For example `2`, long press `×`, `3`, `=` gives `8`.
* **Live preview:** 500 ms after typing stops, `POST /api/calculate/preview` is
  called. The preview is drawn faint with a dashed underline and labelled
  "Live preview - press = to store it in the history"; pressing `=` stores the
  record and the result switches to the solid primary colour.
* The "History N" chip shows the number of records reported by the backend and
  opens the history view.
* The status chip can be clicked to probe the backend again.

### 10.2 History view

* The list is read from the backend every time the view is opened; nothing is
  cached locally.
* 20 records per page; scrolling to the bottom loads the next page through an
  `IntersectionObserver`.
* On touch devices, pulling down from the top refreshes the list; on desktop
  there is a Refresh button.
* Deleting one record and clearing everything both ask for confirmation, then
  reload the list so the interface always matches the database.

---

## 11. Optional verification script

`tools/verify.mjs` drives a real Chromium based browser through the whole
interaction chain (keypad clicks, long press, live preview, submit, history
page, offline error state) and writes screenshots. It needs Node.js 18+ and a
local Chromium browser (Edge or Chrome) installed.

```bash
# Backend and static server must be running (sections 7.1 and 7.2)
node tools/verify.mjs ./screenshots http://127.0.0.1:8080
```

---

## 12. Frequently asked questions

**The page says "Backend offline".** Check, in order: the backend is running;
the page was opened over HTTP rather than from `file://`; the backend address in
the console log points at the right port; then force it once with
`?api=http://<host>:5000`.

**A phone cannot connect.** Both devices must be on the same network, the URL
must use the computer's LAN IP rather than `127.0.0.1`, and the firewall must
allow the port. Start the backend on `0.0.0.0` (the default).

**Is the history lost when the page is reloaded?** No. Records are stored server
side; reloading only triggers another `GET /api/history`.

**Why is the result sometimes faint and underlined?** That is the live preview.
It has not been stored yet; press `=` to store it.
