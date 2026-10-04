/**
 * Backend endpoint definitions.
 *
 * These functions mirror the routes of 832402226_calculator_backend one to one.
 * Views call them instead of building URLs themselves.
 *
 *   GET    /api/health                    health check
 *   POST   /api/calculate                 evaluate and store
 *   POST   /api/calculate/preview         evaluate only, nothing is stored
 *   GET    /api/history?page&pageSize     paged history
 *   GET    /api/history/count             record count only
 *   DELETE /api/history/{id}              delete one record
 *   DELETE /api/history                   clear the history
 *
 * Contract (verified against the real backend):
 *   success -> { success:true, ...business fields }
 *   failure -> { success:false, code, message } with HTTP 400 / 404 / 405 / 500
 */
import { request } from './http.js'

/** Probe whether the backend is reachable */
export function checkHealth() {
  return request({ url: '/api/health' })
}

/**
 * Submit an expression for evaluation; the record is stored in the history.
 * @param {string} expression for example '(1+2)*3'
 */
export function calculate(expression) {
  return request({
    url: '/api/calculate',
    method: 'POST',
    data: { expression }
  })
}

/**
 * Evaluate without storing, used for the live preview while typing.
 * The evaluation still happens on the server.
 * @param {string} expression
 */
export function previewCalculate(expression) {
  return request({
    url: '/api/calculate/preview',
    method: 'POST',
    data: { expression }
  })
}

/**
 * Fetch one page of the history (newest first).
 * @param {number} page     page number, starting at 1
 * @param {number} pageSize records per page (the backend allows 1..100)
 */
export function fetchHistory(page = 1, pageSize = 20) {
  return request({
    url: '/api/history?page=' + encodeURIComponent(page) +
      '&pageSize=' + encodeURIComponent(pageSize)
  })
}

/** Fetch only the number of stored records, which is cheaper than a full page */
export function fetchHistoryCount() {
  return request({ url: '/api/history/count' })
}

/**
 * Delete one history record.
 * @param {number} id record id
 */
export function deleteHistory(id) {
  return request({
    url: '/api/history/' + encodeURIComponent(id),
    method: 'DELETE'
  })
}

/** Delete every history record */
export function clearHistory() {
  return request({
    url: '/api/history',
    method: 'DELETE'
  })
}

export default {
  checkHealth,
  calculate,
  previewCalculate,
  fetchHistory,
  fetchHistoryCount,
  deleteHistory,
  clearHistory
}
