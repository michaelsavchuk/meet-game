# Meet Chat Game Bridge (stub)

Watches Google Meet chat messages and POSTs each new one to a game server.

## Try it
1. `node server.js` (stub game server on http://localhost:8787)
2. Go to chrome://extensions, turn on Developer mode, click "Load unpacked", and choose this folder.
3. Join a Meet call and open the chat panel. New messages print in the server terminal.

## How it works
- Meet's chat panel is a Google Chat frame from `chat.google.com`, so the content script
  matches that origin with `all_frames: true`.
- `chat-observer.js` watches the DOM with a MutationObserver:
  - Message: `div[role="group"][data-id][data-user-id]`
  - Body: `[jsname="bgckF"]`
  - Sender: `[data-member-id][data-name]`. Sender names are cached by user ID, because
    grouped follow-up messages don't repeat the name.
- Messages already on screen when the page loads are treated as history and not sent.
- Each message is sent to `background.js`, which POSTs `{id, userId, sender, text, receivedAt}`.
- It also fires a `meet-chat-message` window event, so you can test it without the extension.

Google changes this page often, so these selectors can stop working without warning.
