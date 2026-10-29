console.log('chat observer v2');

// Meet event observer. One script, two jobs depending on which frame it lands in:
//  - chat.google.com (the chat frame Meet embeds, or a normal Chat tab): new chat messages  -> 'chat-message'
//  - meet.google.com (the top-level call page): emoji reactions on video tiles              -> 'meet-reaction'

// Hand off to the extension's background worker (also fires a DOM event so it works without an extension).
function send(type, eventName, payload) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type, payload });
  }
  window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
}

// ---- Chat messages (chat.google.com) ----
function observeChat() {
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
    send('chat-message', 'meet-chat-message', msg);
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
}

// ---- In-call emoji reactions (meet.google.com) ----
// When someone reacts, Meet drops an <img data-emoji> badge into their video tile.
// The tile carries data-participant-id and the person's name in span.notranslate.
function observeReactions() {
  if (window.__meetTileReactionObserver) return;
  window.__meetTileReactionObserver = true;

  const seen = new WeakSet();

  function handle(img) {
    if (seen.has(img)) return;
    const tile = img.closest('[data-participant-id]');
    if (!tile) return;                                    // not a tile badge (picker, floating bubble, etc.)
    if (img.closest('[role="dialog"],[role="menu"],[role="toolbar"],button')) return;
    const emoji = img.getAttribute('data-emoji');
    if (!emoji) return;
    seen.add(img);

    const evt = {
      emoji,
      participantId: tile.getAttribute('data-participant-id'),
      sender: tile.querySelector('span.notranslate')?.innerText?.trim() || null,
      receivedAt: new Date().toISOString(),
    };
    send('meet-reaction', 'meet-tile-reaction', evt);
    console.log('[meet-reaction]', evt.sender, evt.emoji);
  }

  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches('img[data-emoji]')) handle(n);
      n.querySelectorAll?.('img[data-emoji]').forEach(handle);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

if (location.hostname === 'chat.google.com') observeChat();
else if (location.hostname === 'meet.google.com') observeReactions();
