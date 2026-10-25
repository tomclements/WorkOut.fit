/**
 * Share / invite core. DOM-free so it can run under node:test.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.P4SShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHARE_BASE_URL = 'https://plan4strength.com/';
  const SHARE_REF = 'share';
  const SHARE_TEXT = 'Plan4Strength: free workout plans that fit your gear and schedule.';

  function buildShareUrl() {
    return SHARE_BASE_URL + '?ref=' + SHARE_REF;
  }

  function buildPayload() {
    return {
      title: 'Plan4Strength',
      text: SHARE_TEXT,
      url: buildShareUrl()
    };
  }

  async function shareOrCopy(deps) {
    deps = deps || {};
    const nav = deps.nav || (typeof navigator !== 'undefined' ? navigator : null);
    const win = deps.win || (typeof window !== 'undefined' ? window : null);
    const toast = deps.toast || function () {};

    const payload = buildPayload();

    // 1. Try native share
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share(payload);
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return 'cancelled';
        }
        // fall through to clipboard fallback
      }
    }

    // 2. Try clipboard API
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        await nav.clipboard.writeText(payload.url);
        toast('Link copied');
        return 'copied';
      } catch (err) {
        // fall through to legacy fallback
      }
    }

    // 3. Legacy textarea fallback
    if (win && win.document && win.document.body) {
      try {
        const doc = win.document;
        const ta = doc.createElement('textarea');
        ta.value = payload.url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        doc.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = doc.execCommand('copy');
        doc.body.removeChild(ta);
        if (ok) {
          toast('Link copied');
          return 'copied';
        }
      } catch (err) {
        // fall through to failure
      }
    }

    // 4. Total failure
    toast('Copy failed. Link: ' + payload.url, 'error', 6000);
    return 'failed';
  }

  return {
    SHARE_BASE_URL: SHARE_BASE_URL,
    SHARE_REF: SHARE_REF,
    SHARE_TEXT: SHARE_TEXT,
    buildShareUrl: buildShareUrl,
    buildPayload: buildPayload,
    shareOrCopy: shareOrCopy
  };
});
