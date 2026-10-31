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
// Three ways in, one transport each (TRANSPORTS below), picked by how the page was opened. Only this file knows
// which one is in use: scenes, CPUs and the control page work the same in all three. A transport has
// connect(game), which feeds incoming raw payloads to deliver() (or already-normalized events to emit()), and
// send(type, payload), which is how fakes and CPU chat (simulateChat()) go in.
//  - extension: an extension page. The content script in the Meet tab sends payloads with
//    chrome.runtime.sendMessage, which reaches every extension page directly. Fakes are delivered in-page.
//  - server: from the dev server (npm start). Events arrive over SSE from /events; fakes are POSTed to the server,
//    so /play pages see them too.
//  - local: `?local` in the URL (the solo page, also as a static site). No server and no Meet: the play page posts
//    raw payloads on a BroadcastChannel, and the game echoes each event back on it for the play page's feed.
//    Fakes are delivered in-page.

export const LOCAL_CHANNEL = 'meet-game-events';   // play.html has its own copy of this name
export const mode = globalThis.chrome?.runtime?.id ? 'extension'
  : new URLSearchParams(location.search).has('local') ? 'local' : 'server';
let connected = mode !== 'server';
let emit = () => {};      // emits a normalized event on game.events; set by connectBridge()
const deliver = (type, payload) => emit(normalize[type](payload));
export const isConnected = () => connected;

const ROUTES = { 'chat-message': '/messages', 'meet-reaction': '/reactions' };

const TRANSPORTS = {
  extension: {
    connect() {
      chrome.runtime.onMessage.addListener((m) => { if (normalize[m?.type]) deliver(m.type, m.payload); });
    },
    send: deliver,
  },
  server: {
    connect(game) {
      const source = new EventSource('/events');   // reconnects on its own if the server restarts
      const setStatus = (value) => { connected = value; game.events.emit('bridge-status', value); };
      source.onopen = () => setStatus(true);
      source.onerror = () => setStatus(false);
      source.onmessage = (msg) => emit(JSON.parse(msg.data));
    },
    send: (type, payload) =>
      fetch(ROUTES[type], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  },
  local: {
    connect(game) {
      const channel = new BroadcastChannel(LOCAL_CHANNEL);
      channel.onmessage = ({ data }) => { if (data.type === 'payload' && normalize[data.kind]) deliver(data.kind, data.payload); };
      const echo = (event) => channel.postMessage({ type: 'event', event });
      game.events.on('chat', echo);
      game.events.on('reaction', echo);
    },
    send: deliver,
  },
};
const transport = TRANSPORTS[mode];

export function connectBridge(game) {
  emit = (event) => game.events.emit(event.type, event);
  transport.connect(game);
}

// Subscribe a scene to bridge events, e.g. listen(this, { chat: this.onChat, reaction: this.onReaction }).
export function listen(scene, handlers) {
  const bus = scene.game.events;
  for (const [name, fn] of Object.entries(handlers)) bus.on(name, fn, scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const [name, fn] of Object.entries(handlers)) bus.off(name, fn, scene);
  });
}

// Fake Meet events (dev keys and CPU players), sent through the transport like real ones.
export const FAKE_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Hedy', 'Ken', 'Radia', 'Tim', 'Katherine'];
export const FAKE_EMOJI = ['👍', '❤️', '😂', '😮', '🎉', '👏', '🐸', '🦄', '🐙', '🤖'];

export function simulateChat(sender, text) {
  return transport.send('chat-message', { id: crypto.randomUUID(), userId: `fake-${sender}`, sender, text, receivedAt: new Date().toISOString() });
}

export function simulateReaction(sender, emoji) {
  return transport.send('meet-reaction', { emoji, participantId: `fake-${sender}`, sender, receivedAt: new Date().toISOString() });
}
