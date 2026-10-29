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
- `game/src/bridge.js` re-emits server events on `game.events`. Scenes subscribe with
  `listen(this, { chat, reaction })`, which also unsubscribes on scene shutdown.
- All game state lives in the browser (the server is only a relay); reloading the game page resets it.

## The game
Phases, one scene each (`game/src/scenes/`):
1. **LobbyScene**: chatting anything joins (random character emoji); any reaction changes your emoji.
   Host clicks Start (2+ players) or presses Enter. "Clear players" empties the roster.
2. **BattleScene**: everyone in the roster gets a unique word (`words.js`) in a speech bubble. Typing
   another player's word (whole word, case-insensitive) makes your character chase and hit them.
   Rules: 3 HP, 1 per hit; the victim gets a new word as soon as the attack is typed; one attack
   at a time per player (words typed mid-chase are ignored); typing your own word does nothing.
   People who join mid-round and knocked-out players just watch; late joiners are in the next round.
3. **Winner**: last one standing gets a banner in BattleScene; "Back to lobby" / Enter keeps the roster.

`HudScene` runs on top of everything (connection status, dev key hints). Other pieces:
`roster.js` (players across rounds, name → emoji), `objects/Character.js` (bouncing emoji, sword,
bubble, hearts, chase/hit/knock-out, `separate()` to keep characters from stacking),
`objects/Button.js`, `config.js` (HP, speeds, arena bounds and other tuning).

## Conventions
- No dependencies beyond Phaser and no build step: the server uses only Node built-ins, and the
  game is native ES modules with an import map (`import * as Phaser from 'phaser'`).
- **Phaser 4** (4.2.x), not Phaser 3. Most basic APIs match, but check v4 docs/source in
  `node_modules/phaser` before assuming a v3 API exists.
- Game canvas is a fixed 1280×720, scaled with `Scale.FIT`. Keep text large enough to read in a screen share.
- Commit directly to `main`; no feature branches for now.

## Running and testing
- `npm start` (or `npm run dev` to restart on changes) → http://localhost:8787. `PORT=… npm start` uses another port.
- Dev keys (fake events go through the server like real ones): lobby **C** = a fake player joins,
  **R** = a random player reacts; battle **C** = a random fighter attacks another, **X** = a non-word chat.
  Or `curl -XPOST localhost:8787/messages -d '{"id":"1","userId":"u","sender":"Ada","text":"hi","receivedAt":"t"}'`.
- `window.game` is the Phaser game, e.g. `game.scene.getScene('battle').fighters` in the console.
- After changing `extension/`, reload it in chrome://extensions.

## Gotchas
- Meet/Chat DOM selectors are fragile. Prefer semantic attributes (`role`, `data-*`, `aria-*`, ids)
  over minified class names or `jsname` values; keep a fallback when a minified token is unavoidable.
- Chat and reactions use different ids for the same person (Chat user id vs. Meet participant id),
  so the game keys players by display name. Reactions only count for names that already joined via
  chat. Unverified: the host's own video tile may label them "You", which wouldn't match their chat name.
- Emoji typed in chat messages are dropped: Chat renders them as `<img data-emoji alt="…">` and the
  extension reads `innerText`.
- Messages already on screen when the chat frame loads are treated as history and not sent.
