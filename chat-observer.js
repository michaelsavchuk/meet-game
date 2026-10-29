console.log('chat observer v2');

// Meet/Google Chat message observer.
// Runs inside the chat.google.com frame that Meet embeds (and also in a normal chat.google.com tab).
(() => {
  if (window.__meetChatObserver) return;          // don't double-install
  window.__meetChatObserver = true;

  const MSG = 'div[role="group"][data-id][data-user-id]';   // one element per message
  const TEXT = '[jsname="bgckF"]';                           // message body (fast path; minified token, may change)
  const SENDER = '[data-member-id][data-name]';              // sender (avatar / name chip)
  const NOT_BODY = '[role="heading"], [data-absolute-timestamp], [role="list"], [role="progressbar"]';
  const names = new Map();                                   // user-id -> display name
  const seen = new Set();

  // Every part of a message (sender, body, receipts, reactions, timestamp) gets an id of "<data-id>/<token>".
  // The body is the first of those that has text and isn't the sender, timestamp, or reaction list.
  function findBody(el, id) {
    const fast = el.querySelector(TEXT);
    if (fast) return fast;
    for (const part of el.querySelectorAll(`[id^="${CSS.escape(id)}/"]`)) {
      if (part.matches(NOT_BODY) || part.querySelector(NOT_BODY)) continue;
      if (part.innerText?.trim()) return part;
    }
    return null;
  }

  function parse(el) {
    const userId = el.getAttribute('data-user-id');
    const nameEl = el.querySelector(SENDER);
    const name = nameEl?.getAttribute('data-name') || nameEl?.innerText?.trim();
    if (name) names.set(userId, name);
    const id = el.getAttribute('data-id');
    return {
      id,
      userId,
      sender: names.get(userId) || null,
      text: findBody(el, id)?.innerText?.trim() ?? '',
      receivedAt: new Date().toISOString(),
    };
  }

  function emit(msg) {
    // Hand off to the extension's background worker (falls back to a DOM event when run without an extension).
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'chat-message', msg });
    }
    window.dispatchEvent(new CustomEvent('meet-chat-message', { detail: msg }));
    console.log('[meet-chat]', msg.sender, ':', msg.text);
  }

  // Mark everything already on screen as seen (history), but remember sender names.
  document.querySelectorAll(MSG).forEach(el => { parse(el); seen.add(el.getAttribute('data-id')); });

  function scan() {
    document.querySelectorAll(MSG).forEach(el => {
      const id = el.getAttribute('data-id');
      if (seen.has(id)) return;
      const msg = parse(el);
      if (!msg.text) return;              // body not rendered yet; catch it on the next mutation
      seen.add(id);
      emit(msg);
    });
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
