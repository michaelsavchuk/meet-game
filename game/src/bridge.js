// Bridge between the game server and Phaser.
// Server events arrive over SSE and are re-emitted on game.events, so any scene can listen:
//
//   this.game.events.on('chat', (e) => ...)       e = { type, id, player: { id, name }, text, at }
//   this.game.events.on('reaction', (e) => ...)   e = { type, player: { id, name }, emoji, at }
//   this.game.events.on('bridge-status', (connected) => ...)

export function connectBridge(game) {
  const source = new EventSource('/events');   // reconnects on its own if the server restarts
  source.onopen = () => game.events.emit('bridge-status', true);
  source.onerror = () => game.events.emit('bridge-status', false);
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    game.events.emit(event.type, event);
  };
}

// Dev helpers: send fake Meet events through the server, the same path the extension uses.
const FAKE_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan'];
const FAKE_EMOJI = ['👍', '❤️', '😂', '😮', '🎉', '👏'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function post(path, body) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function simulateChat(text = 'hello from a fake player') {
  const sender = pick(FAKE_NAMES);
  return post('/messages', { id: crypto.randomUUID(), userId: `fake-${sender}`, sender, text, receivedAt: new Date().toISOString() });
}

export function simulateReaction(emoji = pick(FAKE_EMOJI)) {
  const sender = pick(FAKE_NAMES);
  return post('/reactions', { emoji, participantId: `fake-${sender}`, sender, receivedAt: new Date().toISOString() });
}
