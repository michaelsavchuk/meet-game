# Meet Game

A game shown on a shared screen in Google Meet. Participants play by sending chat messages
and in-call emoji reactions.

It's a Chrome extension, and only the host needs it: no server to run, and everyone else just uses Meet.

```
Meet tab (content script) --chrome.runtime messages--> game tab (Phaser, an extension page)
```

| Folder       | What it is |
|--------------|------------|
| `game/`      | The extension. `manifest.json`; `extension/` has the Meet content script and the toolbar button's background script; `index.html` is the game, `control.html` the host's control page; `src/bridge.js` turns Meet events into `game.events`; `LobbyScene` and `BattleScene` in `src/scenes/` are the game. |
| `server/`    | Optional dev server (no dependencies): serves `game/` at localhost, relays fake events, and hosts the `/play` fallback page. |
| `art/`       | Source art. `arena.blend` renders the arena backgrounds (dungeon, arcade, arena, forest) into `game/assets/`; see `art/README.md`. |

## How to play
1. **Lobby**: type anything in chat to join and get a random emoji character. React with any emoji to
   change it. The host clicks **Start game** on the control page (or presses Enter on the game) once 2+ people have joined.
2. **Battle**: everyone gets a word in a speech bubble and 3 hearts.
   - **Attack**: type someone else's word in chat and your character runs over and hits them. Several
     people can chase the same player. The target runs away, but slower than the chasers, so they still
     get caught. You can only make one attack at a time.
   - **After a hit**: your bubble shows "…" while you "type" a new word, and you run away from everyone.
     Nobody new can target you until the word appears (2.5s after the last hit).
   - **Counter**: if someone is chasing you, type *their* word before they reach you. You raise a 🛡️, and
     when they arrive you both bounce apart with no damage and both get new words.
   - **Sudden death**: if nobody lands a hit for 15s, chases keep getting faster until someone can't
     counter in time.
   - **Misses**: a message that doesn't hit shows why over your character: ❌, "so close!" for a typo,
     "that's you!", "too late!" for an old word, or "busy!" mid-chase.
3. **Winner**: the last player standing wins. **Back to lobby** (control page, or Enter) starts over with the same players.

**Co-op** (**Start co-op** on the control page, 1+ players): everyone teams up against waves of purple-tinted enemies
(💀🐍👹…) that run in throughout each wave. Players have no words; enemies do, so type an enemy's word to hit it. Enemies
attack players on their own; type the word of one chasing you to parry it. Each wave brings more, tougher enemies with
more 💜. Clearing a wave heals everyone a heart. When everyone's out, the game shows how far you got. The control
page's **Co-op difficulty** slider (Very easy to Very hard) changes how many enemies come, how tough they are and how
often they attack, from the next wave on.

**Backgrounds**: the lobby is an arcade. Battles and co-op take place in a dungeon, an arena or a forest clearing: a
random one each round, or pick one with the control page's **Background** dropdown.

## Install
- **From a clone**: go to chrome://extensions, turn on Developer mode, click "Load unpacked", and choose the `game/` folder.
- **To share it**: `npm run package` makes `dist/meet-game.zip`, which you can upload to the Chrome Web Store (publish it
  privately to your Google Workspace domain, unlisted, or publicly).

## Host a game
1. Join the Meet call and open its chat panel. If the call was already open when you installed the extension, reload it.
2. Click the ⚔️ toolbar button. The game opens in a window of its own, sized to fit, and the control page opens in the browser's side
   panel (in another tab on browsers without a side panel). The control page shows the players, words, HP and battle
   log, and has the host buttons (Start, Clear players, End round / Back to lobby), so none of that is on the shared screen.
3. In Meet, present the game window. Participants' chats and reactions show up in the game.

**CPU players**: pick a level (Easy, Normal, Hard or Mixed) and click **Add CPU** on the control page. CPUs join
by chatting and play by typing words at their own speed, with typos, counters and heart grabs, so you can play with fewer people.
With `DEV_EVENTS = true` in `game/src/config.js`, dev buttons on the control page (or keys on the game page) send fake events: **C** fake join
(lobby) or attack (battle), **X** fake non-word chat, **T** fake typo, **P** fake counter, **R** fake reaction.

## Dev server
`npm install`, then `npm start` (or `npm run dev` to restart on server changes) serves the same game at
http://localhost:8787 and the control page at http://localhost:8787/control, so you can work on the game without
reloading the extension. Events come from the dev keys, `curl`, or the play page instead of Meet.

### Without the extension
If the extension can't read Meet, players can join from the dev server's play page instead: http://localhost:8787/play has a
name box, a chat box and an emoji picker for reactions, and posts the same payloads the extension does. To reach it from other
machines, expose the server (for example `ngrok http 8787`, or whatever `PORT` you used) and share `<public url>/play`.
The page uses only relative URLs, so it works at any host or port. Share the localhost game tab in Meet so players can see it.

### Solo
http://localhost:8787/solo puts everything on one page: the game on the left, and the play and control pages as tabs on
the right. Add CPUs and start from the Control tab, and type as yourself from the Play tab. It runs entirely in the
browser (no server involved), so it can also be deployed as a static site: `npm run build:web` writes `dist/web/`, which
any static host can serve. On Netlify, connect the repo and `netlify.toml` takes care of the build.

## Game events
Scenes subscribe on `this.game.events`:

- `chat`: `{ type, id, player: { id, name }, text, at }`
- `reaction`: `{ type, player: { id, name }, emoji, at }`
- `bridge-status`: `true` / `false` when the dev server connection opens or drops (the extension is always connected)

Chat and reactions use different ids for the same person (Chat user id vs. Meet participant id),
so players are keyed by display name for now.

## How the extension works
- Meet's chat panel is a Google Chat frame from `chat.google.com`, so the content script
  matches that origin with `all_frames: true`. On `meet.google.com` the same script watches
  video tiles for reaction badges (`img[data-emoji]` inside `[data-participant-id]`).
- Chat messages: `div[role="group"][data-id][data-user-id]`. The body is found with
  `[jsname="bgckF"]`, falling back to the message's `<data-id>/...` part ids. Sender names
  come from `[data-member-id][data-name]` and are cached by user ID, because grouped
  follow-up messages don't repeat the name.
- Some calls use Meet's own chat panel (on `meet.google.com`) instead of the Chat frame. There each
  `div[data-message-id]` is a message inside an `[aria-live]` list whose children are sender groups; the name
  sits in the group header (none, or "You", for your own messages, which use the signed-in account's name from the
  pre-join page's "Google Account:" chip, else the name on your own video tile, else "You"). Ids end in the send time in microseconds, so messages
  more than 30s old when they appear are treated as history. Meet re-renders messages under new ids, so the same
  sender + text again within 10s is dropped.
- Messages already on screen when the page loads are treated as history and not sent.
- The content script sends each chat (`chat-message`) and reaction (`meet-reaction`) with `chrome.runtime.sendMessage`,
  which every open extension page receives; the game page normalizes them (`src/events.js`).

Google changes these pages often, so these selectors can stop working without warning.
