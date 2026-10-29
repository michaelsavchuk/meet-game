// Change this to your game server. Default: the local stub server in server.js.
const GAME_ENDPOINT = 'http://localhost:8787/messages';

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type !== 'chat-message') return;
  fetch(GAME_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m.msg),
  }).catch((err) => console.warn('Game server unreachable:', err.message));
});
