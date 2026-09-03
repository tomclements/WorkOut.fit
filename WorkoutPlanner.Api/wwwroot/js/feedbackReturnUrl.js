/**
 * Same-origin returnUrl helper for feedback.html (no DOM required).
 * Used by feedback.html and node:test.
 *
 * Allow only a same-origin path: leading "/", no "//", no "http:",
 * no "javascript:", no backslash. Anything else falls back to "/".
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.FeedbackReturnUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {string|null|undefined} raw
   * @returns {string|null} allowed path, or null if rejected
   */
  function safeReturnUrl(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s) return null;
    const decoded = safeDecode(s);
    if (decoded == null) return null;
    s = decoded.trim();
    if (!s) return null;
    if (s.charAt(0) !== '/') return null;
    if (s.indexOf('//') !== -1) return null;
    if (s.indexOf('\\') !== -1) return null;
    const lower = s.toLowerCase();
    if (lower.indexOf('http:') !== -1) return null;
    if (lower.indexOf('https:') !== -1) return null;
    if (lower.indexOf('javascript:') !== -1) return null;
    return s;
  }

  function resolveFeedbackBackHref(rawReturnUrl, fallback) {
    return safeReturnUrl(rawReturnUrl) || fallback || '/';
  }

  function feedbackBackLabel(href) {
    return href === '/workout.html' ? 'Back to runner' : 'Back to planner';
  }

  function runnerFeedbackHref() {
    return '/feedback.html?returnUrl=' + encodeURIComponent('/workout.html');
  }

  return {
    safeReturnUrl,
    resolveFeedbackBackHref,
    feedbackBackLabel,
    runnerFeedbackHref
  };
});
