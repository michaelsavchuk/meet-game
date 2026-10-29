// Change this to your game server. Default: the local stub server in server.js.
const GAME_SERVER = 'http://localhost:8787';

// Each event type posts to its own endpoint.
const ROUTES = {
  'chat-message': '/messages',
  'meet-reaction': '/reactions',
};

chrome.runtime.onMessage.addListener((m) => {
  const path = ROUTES[m?.type];
  if (!path) return;
  fetch(GAME_SERVER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(m.payload),
  }).catch((err) => console.warn('Game server unreachable:', err.message));
});
