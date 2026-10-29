# Meet Game

A game shown on a Google Meet screen share and played by participants through chat messages
and in-call emoji reactions. See README.md for setup and the event shapes.

## Architecture
```
extension/ --POST /messages, /reactions--> server/ --SSE /events--> game/ (Phaser)
```
- `extension/chat-observer.js` is one content script that branches on hostname:
  `chat.google.com` (the chat frame Meet embeds, injected with `all_frames`) → chat messages;
  `meet.google.com` (top frame) → reaction badges on video tiles. `background.js` routes each
  type to its own server endpoint.
- `server/index.js` normalizes raw extension payloads into game events
  (`{ type: 'chat' | 'reaction', player: { id, name }, text | emoji, at }`), broadcasts them over
  SSE, and serves `game/` plus Phaser from `node_modules/phaser/dist` at `/vendor/`.
- `game/src/bridge.js` re-emits server events on `game.events`. Scenes subscribe there and must
  unsubscribe on `SHUTDOWN` (see `GameScene.js`). Game logic goes in scenes under `game/src/scenes/`.

## Conventions
- No dependencies beyond Phaser and no build step: the server uses only Node built-ins, and the
  game is native ES modules with an import map (`import * as Phaser from 'phaser'`).
- **Phaser 4** (4.2.x), not Phaser 3. Most basic APIs match, but check v4 docs/source in
  `node_modules/phaser` before assuming a v3 API exists.
- Game canvas is a fixed 1280×720, scaled with `Scale.FIT`. Keep text large enough to read in a screen share.
- Commit directly to `main`; no feature branches for now.

## Running and testing
- `npm start` (or `npm run dev` to restart on changes) → http://localhost:8787. `PORT=… npm start` uses another port.
- Press **C** / **R** in the game for fake chats/reactions; they go through the server like real ones.
  Or `curl -XPOST localhost:8787/messages -d '{"id":"1","userId":"u","sender":"Ada","text":"hi","receivedAt":"t"}'`.
- After changing `extension/`, reload it in chrome://extensions.

## Gotchas
- Meet/Chat DOM selectors are fragile. Prefer semantic attributes (`role`, `data-*`, `aria-*`, ids)
  over minified class names or `jsname` values; keep a fallback when a minified token is unavoidable.
- Chat and reactions use different ids for the same person (Chat user id vs. Meet participant id),
  so the game keys players by display name.
- Emoji typed in chat messages are dropped: Chat renders them as `<img data-emoji alt="…">` and the
  extension reads `innerText`.
- Messages already on screen when the chat frame loads are treated as history and not sent.
