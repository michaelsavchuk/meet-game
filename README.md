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

## Run it
1. `npm install`, then `npm start` (or `npm run dev` to restart on server changes).
2. Open http://localhost:8787 (the game you share) and http://localhost:8787/control in another tab of the same
   browser. The control page shows the players, words, HP and battle log, and has the host buttons (Start, Clear
   players, End round / Back to lobby) so none of that is on the shared screen.
   **CPU players**: pick a level (Easy, Normal, Hard or Mixed) and click **Add CPU** on the control page. CPUs join
   by chatting and play by typing words at their own speed, with typos, counters and heart grabs, so you can play with fewer people.
   Dev buttons on the control page (or keys on the game page) send fake events through the server: **C** fake join
   (lobby) or attack (battle), **X** fake non-word chat, **T** fake typo, **P** fake counter, **R** fake reaction.
3. Go to chrome://extensions, turn on Developer mode, click "Load unpacked", and choose the `extension/` folder.
4. In the Meet call, open the chat panel and share the game tab (not the control page). Participants' chats and reactions show up in the game.

### Without the extension
If the extension can't read Meet, players can join from the play page instead: http://localhost:8787/play has a
name box, a chat box and reaction buttons, and posts the same payloads the extension does. To reach it from other
machines, expose the server (for example `ngrok http 8787`, or whatever `PORT` you used) and share `<public url>/play`.
The page uses only relative URLs, so it works at any host or port. Keep sharing the game tab in Meet so players can see it.

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
- Some calls use Meet's own chat panel (on `meet.google.com`) instead of the Chat frame. There each
  `div[data-message-id]` is a message inside an `[aria-live]` list whose children are sender groups; the name
  sits in the group header (none for your own messages, which use the signed-in account's name from the
  pre-join page's "Google Account:" chip, else "You"). Ids end in the send time in microseconds, so messages
  more than 30s old when they appear are treated as history. Meet re-renders messages under new ids, so the same
  sender + text again within 10s is dropped.
- Messages already on screen when the page loads are treated as history and not sent.
- `background.js` posts chats to `/messages` and reactions to `/reactions`.

Google changes these pages often, so these selectors can stop working without warning.
