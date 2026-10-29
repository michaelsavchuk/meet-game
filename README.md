# Meet Game

A game shown on a shared screen in Google Meet. Participants play by sending chat messages
and in-call emoji reactions.

```
Meet (extension) --POST /messages, /reactions--> server --SSE /events--> Phaser game
```

| Folder       | What it is |
|--------------|------------|
| `extension/` | Chrome extension that watches Meet chat and tile reactions and POSTs them to the server. |
| `server/`    | Node server (no dependencies). Normalizes events, streams them to the game, serves `game/`. |
| `game/`      | Phaser front end. `src/bridge.js` turns server events into `game.events`; `LobbyScene` and `BattleScene` in `src/scenes/` are the game. |

## How to play
1. **Lobby**: type anything in chat to join and get a random emoji character. React with any emoji to
   change it. The host clicks **Start game** (or presses Enter) once 2+ people have joined.
2. **Battle**: everyone gets a word in a speech bubble. Type someone else's word in chat and your
   character runs over and hits them. Each player has 3 hearts; the victim gets a new word every
   time they're attacked. You can only make one attack at a time.
3. **Winner**: the last player standing wins. **Back to lobby** starts over with the same players.

## Run it
1. `npm install`, then `npm start` (or `npm run dev` to restart on server changes).
2. Open http://localhost:8787. Dev keys send fake events through the server: **C** fake join (lobby) or
   attack (battle), **X** fake non-word chat, **R** fake reaction.
3. Go to chrome://extensions, turn on Developer mode, click "Load unpacked", and choose the `extension/` folder.
4. In the Meet call, open the chat panel and share the game tab. Participants' chats and reactions show up in the game.

## Game events
Scenes subscribe on `this.game.events`:

- `chat`: `{ type, id, player: { id, name }, text, at }`
- `reaction`: `{ type, player: { id, name }, emoji, at }`
- `bridge-status`: `true` / `false` when the server connection opens or drops

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
- Messages already on screen when the page loads are treated as history and not sent.
- `background.js` posts chats to `/messages` and reactions to `/reactions`.

Google changes these pages often, so these selectors can stop working without warning.
