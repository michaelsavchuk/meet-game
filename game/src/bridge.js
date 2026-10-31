import * as Phaser from '/vendor/phaser.js';
import { normalize } from './events.js';

// Bridge between Meet and Phaser. Raw Meet payloads are normalized (events.js) and re-emitted on game.events,
// so any scene can listen:
//
//   this.game.events.on('chat', (e) => ...)       e = { type, id, player: { id, name }, text, at }
//   this.game.events.on('reaction', (e) => ...)   e = { type, player: { id, name }, emoji, at }
//   this.game.events.on('bridge-status', (connected) => ...)
//
// Scenes should use listen() below, which also unsubscribes when the scene shuts down.
//
// Two ways in, depending on how the page was opened:
//  - As an extension page: the content script in the Meet tab sends payloads with chrome.runtime.sendMessage,
//    which reaches every extension page directly. Always "connected".
//  - From the dev server (npm start): events arrive over SSE from /events, and fakes are POSTed to the server.

export const viaServer = !globalThis.chrome?.runtime?.id;
let connected = !viaServer;
let deliver = () => {};   // hands a raw payload to the game; set by connectBridge()
export const isConnected = () => connected;

export function connectBridge(game) {
  const emit = (event) => game.events.emit(event.type, event);
  deliver = (type, payload) => emit(normalize[type](payload));
  if (!viaServer) {
    chrome.runtime.onMessage.addListener((m) => { if (normalize[m?.type]) deliver(m.type, m.payload); });
    return;
  }
  const source = new EventSource('/events');   // reconnects on its own if the server restarts
  const setStatus = (value) => { connected = value; game.events.emit('bridge-status', value); };
  source.onopen = () => setStatus(true);
  source.onerror = () => setStatus(false);
  source.onmessage = (msg) => emit(JSON.parse(msg.data));
}

// Subscribe a scene to bridge events, e.g. listen(this, { chat: this.onChat, reaction: this.onReaction }).
export function listen(scene, handlers) {
  const bus = scene.game.events;
  for (const [name, fn] of Object.entries(handlers)) bus.on(name, fn, scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const [name, fn] of Object.entries(handlers)) bus.off(name, fn, scene);
  });
}

// Dev helpers: fake Meet events, sent the same way real ones arrive (through the server when there is one).
export const FAKE_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Hedy', 'Ken', 'Radia', 'Tim', 'Katherine'];
export const FAKE_EMOJI = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🐸', '🦄', '🐙', '🤖'];

const ROUTES = { 'chat-message': '/messages', 'meet-reaction': '/reactions' };

function send(type, payload) {
  if (!viaServer) return deliver(type, payload);
  return fetch(ROUTES[type], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

export function simulateChat(sender, text) {
  return send('chat-message', { id: crypto.randomUUID(), userId: `fake-${sender}`, sender, text, receivedAt: new Date().toISOString() });
}

export function simulateReaction(sender, emoji) {
  return send('meet-reaction', { emoji, participantId: `fake-${sender}`, sender, receivedAt: new Date().toISOString() });
}
