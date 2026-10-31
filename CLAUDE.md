# Meet Game

A game shown on a Google Meet screen share and played by participants through chat messages
and in-call emoji reactions. See README.md for setup and the event shapes.

## Architecture
`game/` is the Chrome extension (`game/manifest.json`, MV3) and also the dev server's web root, so its pages use
root-absolute paths (`/assets/…`, `/src/…`, `/vendor/phaser.js`) that work at both `chrome-extension://<id>/` and
`localhost:8787/`. Only the host installs it; players just chat and react in Meet.
```
extension:   Meet tab content script --chrome.runtime.sendMessage--> game page (index.html, an extension page)
dev server:  /play, dev keys --POST /messages, /reactions--> server/ --SSE /events--> game page at localhost
```
- `game/extension/chat-observer.js` is one content script that branches on hostname:
  `chat.google.com` (the chat frame Meet embeds, injected with `all_frames`) → chat messages;
  `meet.google.com` (top frame) → reaction badges on video tiles, plus Meet's own built-in chat panel
  (`observeMeetChat()`), which some calls use instead of the Chat frame. It sends raw payloads
  (`chat-message` / `meet-reaction`) with `chrome.runtime.sendMessage`, which reaches the game page directly.
- `game/extension/background.js` only handles the toolbar button: it opens the game in a tab next to the current one
  and the control page in the side panel (`chrome.sidePanel`, global so it stays open across tabs), or in a tab where
  the browser has no sidePanel API (Firefox uses `sidebar_action` / `browser.sidebarAction` instead). `sidePanel.open()`
  must run before any `await` (user gesture). The manifest lists both `background.service_worker` (Chrome) and
  `background.scripts` (Firefox event page); each browser uses its own. Firefox can only share windows in Meet and
  stops drawing background tabs, so there the game opens in its own popup window instead of a tab.
- `game/src/events.js` normalizes raw payloads into game events
  (`{ type: 'chat' | 'reaction', player: { id, name }, text | emoji, at }`); shared by the bridge and the server.
- `game/src/bridge.js` picks its transport: as an extension page (`chrome.runtime.id` set) it listens to
  `chrome.runtime.onMessage` and fakes (`simulateChat()`) are delivered in-page; otherwise (`viaServer`) it uses SSE
  and POSTs fakes to the server. Either way it re-emits events on `game.events`. Scenes subscribe with
  `listen(this, { chat, reaction })`, which also unsubscribes on scene shutdown.
- `server/index.js` (optional, ESM, Node built-ins only) is for developing without reloading the extension and for the
  `/play` page: it normalizes POSTs, broadcasts them over SSE, and serves `game/`.
- All game state lives in the game page; reloading it resets the game.
- The presented game shows only the game itself. Host controls, counts, the battle log and dev buttons are on
  the control page (`game/control.html` + `src/control.js`), in the side panel (or at `/control` with the dev
  server).
  Extension pages can't run inline scripts (MV3 CSP), so no import maps or inline `<script>` in `index.html`/`control.html`. `src/remote.js` links them over a `BroadcastChannel`: the game posts the active scene's `snapshot()`
  every 250 ms, and the control page sends command names that run the active scene's `commands[name]`
  (`start`, `clear`, `end`, and the dev keys). Commands can carry one `arg`; `connectRemote()` also takes scene-independent
  commands (`addCpu`, `removeCpus`).
- CPU players (`src/bots.js`): added from the control page (easy/normal/hard/mixed), they run in the game page outside
  the scenes, read the active scene's state every 100 ms, and send chat through the bridge with `simulateChat()` like
  anyone else. Each has its own typing speed (WPM), reaction time, typo rate (sends a typo, then retypes it), chance to
  notice a chaser and counter, heart greed, and targeting style (`STYLES`), varied a little per bot from `LEVELS`.
  They join by saying hi, leave when the roster is cleared, and "Remove CPUs" (lobby only) uses `LobbyScene.removePlayer()`.
  Phaser pauses in a background tab, so keep the game tab in front for CPUs to play.
- Play page (`/play` → `game/play.html`, self-contained, dev server only; left out of `npm run package`): a fallback for when the extension can't read Meet. Players
  pick a name and send chat/reactions in the extension's raw payload shape; it shows everyone's chat from `/events`.
  It may be served through a tunnel (ngrok), so it uses relative URLs only and avoids secure-context-only APIs.

## The game
Phases, one scene each (`game/src/scenes/`):
1. **LobbyScene**: chatting anything joins (random character emoji) and your character runs in from a random
   staircase; any reaction changes your emoji. Returning to the lobby, everyone runs in again.
   Host clicks Start battle on the control page (2+ players) or presses Enter on the game, or Start co-op (1+).
   "Clear players" empties the roster.
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

**Co-op** (`SurvivalScene`, extends BattleScene through its hooks: `everyone()`, `foes()`, `carriesWord()`, `steer()`,
`hit()`/`retype()`, `heartIcon()`): players have no words and fight waves of enemies together. `fighters` is still just
the players (so hearts, bots and `alive()` work unchanged); enemies are in `enemies`. Each wave (`waveSpec()` in config.js:
more enemies, more HP, and tougher levels as waves go on) is announced with the flash banner; its enemies (`ENEMY_EMOJI`,
tinted purple by level with `setEmojiTint()`, 💜 HP, no name tag) run in from the stairs one by one through the wave and
get a word once off the stairs. Enemies attack on their own via `EnemyBrain` (bots.js), which reuses CPU levels, timing and
`pickTarget()`; players counter them like in a battle, and CPU players attack enemies (bots use `scene.foes(me)`). Roaming
players and enemies steer away from each other (`ROAM_AVOID_RADIUS`). Clearing a wave heals survivors `WAVE_HEAL`, late
joiners run in, and the next wave starts. When every player is out: "You made it to wave N!". No sudden death.
The control page's co-op difficulty slider (`DIFFICULTIES` in config.js, Normal by default) scales enemy count,
toughness, HP and rest between attacks; it's a scene-independent `setDifficulty` command, kept in the game page's
localStorage, and read at the start of each wave.

**Backgrounds** (`src/backgrounds.js`): the lobby is always `assets/bg-arcade.png`; battles and co-op use the
host's pick from the control page's Background dropdown (Dungeon, Arena or Forest), or by default Random, a different
one from last round's. The pick is saved in the game page's localStorage like the co-op difficulty, and applies from
the next round. LobbyScene and BattleScene preload all of them. To add one, render it from the .blend and add it to
`BATTLE` in backgrounds.js.

`art/arena.blend` renders the backgrounds to `game/assets/bg-<name>.png`, one scene per background (`Dungeon`,
`Arcade`, `Arena`, `Forest`; Kenney packs, flat texture + blue AO), all sharing one camera, floor, border and entrances
so `ARENA`/`STAIRS` fit every one. Read `art/README.md` before editing it: collections, the shared camera and guides,
each layout, adding a background, and the shared `Toon Style` settings node.

`HudScene` runs on top of everything and only shows "disconnected" when the dev server connection drops (never in the extension). Other pieces:
`roster.js` (players across rounds, name → emoji), `objects/Character.js` (emoji whose hop rate follows
its speed, sword, bubble, hearts, chase/hit, `separate()` to keep characters from stacking; a knockback flips
the figure through the air, and a knockout flings it off screen into the `game/assets/ko.svg` burst that
BattleScene preloads (generated by `art/ko.mjs`; edit and rerun that); `enter()` runs it in from off screen down a staircase in `STAIRS`), `objects/FloorText.js` (faint blue
text painted on the floor under everyone: "Chat to join!" + player count in the lobby, "Only N remain" in battle until
one is left), `config.js` (HP, speeds, sudden death timing, arena bounds and
other tuning; animation tuning lives at the top of Character.js).

## Conventions
- No dependencies beyond Phaser and no build step: the server uses only Node built-ins, and the
  game is native ES modules. Phaser is vendored at `game/vendor/phaser.js` (the minified ESM build, committed so the
  extension loads straight from a clone); import it as `import * as Phaser from '/vendor/phaser.js'`. After
  upgrading the `phaser` devDependency, `npm run vendor` copies it in.
- **Phaser 4** (4.2.x), not Phaser 3. Most basic APIs match, but check v4 docs/source in
  `node_modules/phaser` before assuming a v3 API exists.
- Game canvas is a fixed 1280×720, scaled with `Scale.FIT`. Keep text large enough to read in a screen share.
- Emoji use Google's Noto Color Emoji (`game/fonts/Noto-COLRv1.ttf`, `@font-face` in `index.html`). `main.js` makes
  `FONT_FAMILY` the default for every `scene.add.text()` and loads the font before the game starts.
- Commit directly to `main`; no feature branches for now.

## Running and testing
- Extension: chrome://extensions → Developer mode → Load unpacked → `game/`. Click the toolbar button (best from a Meet
  tab). After changing `game/`, reload the extension there and reopen its pages; after changing the content script, also
  reload the Meet tab (content scripts only start on page load, including after a fresh install).
- `npm run package` zips `game/` into `dist/meet-game.zip` for the Chrome Web Store or sharing.
- Dev server: `npm start` (or `npm run dev` to restart on changes) → http://localhost:8787, control page at
  http://localhost:8787/control in another tab of the same browser. `PORT=… npm start` uses another port.
- Dev keys on the game page, also buttons on the control page, when `DEV_EVENTS` is true in `config.js` (default false; fake events take the same path as real ones): lobby **C** = a fake player joins,
  **R** = a random player reacts; battle **C** = a random fighter attacks another, **X** = a non-word chat,
  **T** = a typo of someone's word, **P** = a chased fighter counters their chaser,
  **H** = drop a heart now, **G** = a random fighter goes for the heart; co-op **C**/**T**/**P**/**R**/**H**/**G** likewise
  against enemies, **E** = an extra enemy runs in now.
  Or `curl -XPOST localhost:8787/messages -d '{"id":"1","userId":"u","sender":"Ada","text":"hi","receivedAt":"t"}'`.
- `window.game` is the Phaser game, e.g. `game.scene.getScene('battle').fighters` in the console.

## Gotchas
- Meet/Chat DOM selectors are fragile. Prefer semantic attributes (`role`, `data-*`, `aria-*`, ids)
  over minified class names or `jsname` values; keep a fallback when a minified token is unavoidable.
- Chat and reactions use different ids for the same person (Chat user id vs. Meet participant id),
  so the game keys players by display name. Reactions only count for names that already joined via
  chat. Your own video tile shows your real name, but Meet's built-in chat doesn't name your own messages, so
  `readSelfName()` gets it from the pre-join account chip or, failing that, your own tile (the one with the
  `frame_person` / `visual_effects` buttons); the chat falls back to "You" only if neither is found.
- Emoji typed in chat messages are dropped: Chat renders them as `<img data-emoji alt="…">` and the
  extension reads `innerText`.
- Messages already on screen when the chat frame loads are treated as history and not sent.
