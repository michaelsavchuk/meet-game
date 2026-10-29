import * as Phaser from 'phaser';

// Bridge between the game server and Phaser.
// Server events arrive over SSE and are re-emitted on game.events, so any scene can listen:
//
//   this.game.events.on('chat', (e) => ...)       e = { type, id, player: { id, name }, text, at }
//   this.game.events.on('reaction', (e) => ...)   e = { type, player: { id, name }, emoji, at }
//   this.game.events.on('bridge-status', (connected) => ...)
//
// Scenes should use listen() below, which also unsubscribes when the scene shuts down.

let connected = false;
export const isConnected = () => connected;

export function connectBridge(game) {
  const source = new EventSource('/events');   // reconnects on its own if the server restarts
  const setStatus = (value) => { connected = value; game.events.emit('bridge-status', value); };
  source.onopen = () => setStatus(true);
  source.onerror = () => setStatus(false);
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    game.events.emit(event.type, event);
  };
}

// Subscribe a scene to bridge events, e.g. listen(this, { chat: this.onChat, reaction: this.onReaction }).
export function listen(scene, handlers) {
  const bus = scene.game.events;
  for (const [name, fn] of Object.entries(handlers)) bus.on(name, fn, scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const [name, fn] of Object.entries(handlers)) bus.off(name, fn, scene);
  });
}

// Dev helpers: send fake Meet events through the server, the same path the extension uses.
export const FAKE_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Hedy', 'Ken', 'Radia', 'Tim', 'Katherine'];
export const FAKE_EMOJI = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🐸', '🦄', '🐙', '🤖'];

function post(path, body) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function simulateChat(sender, text) {
  return post('/messages', { id: crypto.randomUUID(), userId: `fake-${sender}`, sender, text, receivedAt: new Date().toISOString() });
}

export function simulateReaction(sender, emoji) {
  return post('/reactions', { emoji, participantId: `fake-${sender}`, sender, receivedAt: new Date().toISOString() });
}
