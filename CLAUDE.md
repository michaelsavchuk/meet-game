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
- The presented game shows only the game itself. Host controls, counts, the battle log and dev buttons are on
  the control page (`/control` → `game/control.html` + `src/control.js`), opened in another tab of the same
  browser. `src/remote.js` links them over a `BroadcastChannel`: the game posts the active scene's `snapshot()`
  every 250 ms, and the control page sends command names that run the active scene's `commands[name]`
  (`start`, `clear`, `end`, and the dev keys).

## The game
Phases, one scene each (`game/src/scenes/`):
1. **LobbyScene**: chatting anything joins (random character emoji) and your character runs in from a random
   staircase; any reaction changes your emoji. Returning to the lobby, everyone runs in again.
   Host clicks Start on the control page (2+ players) or presses Enter on the game. "Clear players" empties the roster.
2. **BattleScene**: everyone in the roster runs in from a random staircase to spread-out spots (`spreadSpots()`)
   while the banner counts down 3-2-1 (`COUNTDOWN`), timed to arrive just before it ends. Then "Type to Fight!", and once that banner is gone (so it hides
   nobody's word) everyone gets a unique word (`words.js`) in a speech bubble; until then (`fighting` false) chat does nothing. Typing
   another player's word (whole word, case-insensitive) makes your character chase and hit them.
   Rules: 3 HP, 1 per hit. The victim keeps their word while attackers run at them, so several
   players can chase the same person. When a hit lands, the victim's word is cleared (`word = null`)
   and their bubble shows an SMS-style "…" typing indicator, so nobody new can target them. Chasers
   already on the way still hit, and each hit restarts the `WORD_DELAY` ms before a new word appears.
   Fleeing: BattleScene sets `character.fleeSpeed` every frame: `FLEE_SPEED` while typing,
   `CHASED_FLEE_SPEED` while being chased (the faster if both), 0 otherwise. Fleeing characters
   `steerAway()` from other players and walls; both speeds are well below `CHASE_SPEED`.
   One attack at a time per player (words typed mid-chase are ignored); typing your own word does nothing.
   Counter: while being chased, typing your chaser's word readies a parry against that chaser (🛡️ shows,
   `fighter.parries`) instead of chasing back, so mutual chases don't happen. When that chaser arrives,
   `clash()` knocks both back with no damage and gives both new words immediately (no "…" delay, so
   nobody can pre-type a counter); other chasers still hit.
   Sudden death (`updateSuddenDeath()`): after `SUDDEN_DEATH_AFTER` ms without a hit (parries don't count),
   a banner flashes briefly (shake, but no letter fly-in) and every chase gets faster each `SUDDEN_DEATH_STEP` ms, up to ×`SUDDEN_DEATH_MAX`, until
   counters can't keep up, with yellow anime action lines flickering in the corners (`objects/SpeedLines.js`,
   more and longer as it speeds up). The next hit resets it.
   Miss feedback (`missReason()`): a fighter's message that attacks nobody shakes their head and floats a
   label: "❌" (no match), "so close!" (one edit from a live word, `nearMiss()` in words.js), "that's you!"
   (own word), "too late!" (`lastWord` of someone typing a new one, or a knocked-out player's word), or
   "busy!" (a live word while already chasing; plain chatter mid-chase shows nothing).
   Chase visuals: targets show a wobbling "‼️" (with "×N" for several chasers; BattleScene recounts
   chasers every frame and calls `setAlert()`), and chasers leave a 💨 trail (`puff()`).
   Hearts (`objects/Heart.js`, `dropHeart()`): every `HEART_EVERY` ms, if someone is hurt and it isn't sudden death,
   one 💖 drops from the top of the screen (shadow grows at the landing spot), then floats in a spinning sunburst with a
   pulsing glow and orbiting ✨, under a pink bubble with a longer, trickier word (`HEART_WORDS`). `heartSpot()` lands
   it near a hurt fighter (weighted by missing HP squared, so the neediest usually wins the race), or anywhere
   (`HEART_ANYWHERE`). Typing its word chases it like an attack; the first to arrive gets +`HEART_HEAL` HP (full-HP
   players can still grab it to deny it), other runners get "too late!". It fades after `HEART_LIFETIME` ms.
   People who join mid-round and knocked-out players just watch; late joiners are in the next round.
3. **Winner**: last one standing gets a banner in BattleScene; "Back to lobby" (control page) / Enter keeps the roster.

`art/arena.blend` renders the arena backdrop to `game/assets/arena.png` (Kenney Mini Dungeon tiles, flat texture +
blue AO). Read `art/README.md` before editing it: layout, camera, and the shared `Toon Style` settings node.

`HudScene` runs on top of everything and only shows "disconnected" when the server connection drops. Other pieces:
`roster.js` (players across rounds, name → emoji), `objects/Character.js` (emoji whose hop rate follows
its speed, sword, bubble, hearts, chase/hit, `separate()` to keep characters from stacking; a knockback flips
the figure through the air, and a knockout flings it off screen into the `game/assets/ko.png` burst that
BattleScene preloads; `enter()` runs it in from off screen down a staircase in `STAIRS`), `objects/FloorText.js` (faint blue
text painted on the floor under everyone: "Chat to join!" + player count in the lobby, "Only N remain" in battle until
one is left), `config.js` (HP, speeds, sudden death timing, arena bounds and
other tuning; animation tuning lives at the top of Character.js).

## Conventions
- No dependencies beyond Phaser and no build step: the server uses only Node built-ins, and the
  game is native ES modules with an import map (`import * as Phaser from 'phaser'`).
- **Phaser 4** (4.2.x), not Phaser 3. Most basic APIs match, but check v4 docs/source in
  `node_modules/phaser` before assuming a v3 API exists.
- Game canvas is a fixed 1280×720, scaled with `Scale.FIT`. Keep text large enough to read in a screen share.
- Emoji use Google's Noto Color Emoji (`game/fonts/Noto-COLRv1.ttf`, `@font-face` in `index.html`). `main.js` makes
  `FONT_FAMILY` the default for every `scene.add.text()` and loads the font before the game starts.
- Commit directly to `main`; no feature branches for now.

## Running and testing
- `npm start` (or `npm run dev` to restart on changes) → http://localhost:8787. `PORT=… npm start` uses another port.
- Control page: http://localhost:8787/control in another tab of the same browser.
- Dev keys on the game page, also buttons on the control page (fake events go through the server like real ones): lobby **C** = a fake player joins,
  **R** = a random player reacts; battle **C** = a random fighter attacks another, **X** = a non-word chat,
  **T** = a typo of someone's word, **P** = a chased fighter counters their chaser,
  **H** = drop a heart now, **G** = a random fighter goes for the heart.
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
