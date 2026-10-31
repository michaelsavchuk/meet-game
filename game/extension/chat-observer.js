console.log('chat observer v2');

// Meet event observer. One script, two jobs depending on which frame it lands in:
//  - chat.google.com (the chat frame Meet embeds, or a normal Chat tab): new chat messages  -> 'chat-message'
//  - meet.google.com (the top-level call page): emoji reactions on video tiles              -> 'meet-reaction'

// Hand off to the extension's game page (also fires a DOM event so it works without an extension).
// Sending fails when the game isn't open, which is fine: there's nobody to play yet.
function send(type, eventName, payload) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type, payload }).catch(() => {});
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

// ---- Meet's built-in chat (meet.google.com) ----
// Some calls use Meet's own chat panel instead of the Google Chat frame. Messages live in an
// aria-live list; each child is a group of consecutive messages from one sender, with the name in a
// header next to the timestamp. Your own groups have no name, so we use the signed-in account's name.
function observeMeetChat() {
  if (window.__meetNativeChatObserver) return;
  window.__meetNativeChatObserver = true;

  const MSG = 'div[data-message-id]';         // the pin button also carries data-message-id
  const TEXT = '[jsname="dTKtvb"]';           // message body (fast path; minified token, may change)
  const NAME = '.poVWob';                     // sender name (fast path; minified class, may change)
  const TIME = /^\d{1,2}:\d{2}(\s?[AP]M)?$/i;
  const HISTORY_MS = 30_000;                  // messages older than this when first seen are history
  const DUPE_MS = 10_000;                     // same sender + text again within this is a re-render
  const seen = new Set();                     // message ids
  const seenEls = new WeakSet();              // elements (the id can change in place)
  const recent = new Map();                   // "sender\ntext" -> when we last sent it
  let selfName = null;

  // The account chip ("Google Account: Name (email)") is on the pre-join page; remember it for the call.
  function readSelfName() {
    const label = document.querySelector('[aria-label^="Google Account:"]')?.getAttribute('aria-label');
    const name = label?.replace(/^Google Account:\s*/, '').split(/\s*[\n(]/)[0].trim();
    if (name) selfName = name;
  }

  // Ids look like "spaces/<space>/messages/<microseconds since epoch>".
  function sentAt(id) {
    const us = Number(id.split('/').pop());
    return Number.isFinite(us) && us > 1e15 ? us / 1000 : null;
  }

  // The group is the aria-live list's direct child. Its name is the first text before the first
  // message that isn't the timestamp; no name means it's one of your own messages.
  function senderOf(el) {
    const group = el.closest('[aria-live] > *');
    if (!group) return null;
    const fast = group.querySelector(NAME)?.innerText?.trim();
    if (fast) return fast;
    const walker = document.createTreeWalker(group, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (n.parentElement.closest(MSG)) break;
      const text = n.textContent.trim();
      if (text && !TIME.test(text)) return text;
    }
    return null;
  }

  function bodyOf(el) {
    // Fallback: message > bubble > content > body (the first child; later ones are the pin hint/button).
    return el.querySelector(TEXT) ?? el.firstElementChild?.firstElementChild?.firstElementChild;
  }

  function parse(el) {
    const name = senderOf(el);
    return {
      id: el.getAttribute('data-message-id'),
      userId: name ? `meet:${name}` : 'meet:self',
      sender: name || selfName || 'You',
      text: bodyOf(el)?.innerText?.trim() ?? '',
      receivedAt: new Date().toISOString(),
    };
  }

  function scan() {
    readSelfName();
    const now = Date.now();
    for (const [key, t] of recent) if (now - t > DUPE_MS) recent.delete(key);
    document.querySelectorAll(MSG).forEach(el => {
      const id = el.getAttribute('data-message-id');
      if (seenEls.has(el) || seen.has(id)) return;
      const at = sentAt(id);
      if (at && now - at > HISTORY_MS) { seen.add(id); seenEls.add(el); return; }
      const msg = parse(el);
      if (!msg.text) return;              // body not rendered yet; catch it on the next mutation
      seen.add(id);
      seenEls.add(el);
      // Meet re-renders a message under a new id (your own: temporary id, then the sent one), so drop
      // a repeat of the same sender + text that shows up within DUPE_MS.
      const key = `${msg.sender}\n${msg.text}`;
      if (recent.has(key)) { console.log('[meet-chat native] skipped re-render', id, msg.text); return; }
      recent.set(key, now);
      send('chat-message', 'meet-chat-message', msg);
      console.log('[meet-chat native]', msg.sender, ':', msg.text, id);
    });
  }

  // Whatever is on screen at load is history, even if its id doesn't carry a timestamp.
  readSelfName();
  document.querySelectorAll(MSG).forEach(el => { seen.add(el.getAttribute('data-message-id')); seenEls.add(el); });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
}

if (location.hostname === 'chat.google.com') observeChat();
else if (location.hostname === 'meet.google.com') { observeReactions(); observeMeetChat(); }
