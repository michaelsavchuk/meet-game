https://github.com/user-attachments/assets/bca833b1-be32-4c59-9bd0-08ec4776512d

Join other players and CPUs to fight oncoming waves of enemies (or each other) in frantic fast-paced skirmishes!

Play by typing words into the chat. This was originally made to work as a Chrome extension and Google Meet, but it can also work on a locally hosted server or as a local build (for solo play only)

Made for a company-hosted game jam to experiment with using AI. The theme was "only one".

## Gameplay
1. **Lobby**: type anything in chat to join and get a random emoji character. React to the call with any emoji to change it.
2. **Battle**: everyone gets a word in a speech bubble and 3 hearts. Type someone else's word to attack! If two people attack each other at once, they parry.
3. **Co-op**: Work together to attack waves of CPU enemies and survive as long as you can!

## Ways to play

### Chrome Extension (for playing in Google Meet)

Install the browser extension from the latest release into your browser of choice. Chrome works best, but I did briefly test in firefox too.

Join a Google Meet call, activate the extension, and share the pop-up game tab.

### Local Server

If the browser extension isn't working, or you want to play in a different way, you can use a locally hosted node.js server instead.

This requires using something like ngrok or tailscale to forward your port to others.

1. Clone the repo
2. `npm run start`
3. Visit http://localhost:8787 to view the game
4. Visit http://localhost:8787/control to view behind-the-scenes game controls
5. Have players visit http://http:localhost:8787/play through a forwarded port to participate in the game.

(Note that if you are port forwarding, having multiple players visit the main index page will result in multiple different games, it's not synced)

### Solo

You can also play the game solo! The game controls allow you to set up CPU players. You can either play along with them or have the computer play the game while you watch.

The current version is hosted on netlify at https://nimble-banoffee-874f3f.netlify.app/

Alternatively you can visit http://localhost:8787/solo if you have the server running for the same view or run `npm run build:web` to create a solo build in `dist/web`

## How I made it

The actual setup is pretty simple:

1. The browser extension detects messages and reactions coming on while you have the Google Meet tab open.
2. Messages are sent either to a running game tab or to the game server (depending on your setup)
3. The game tab recieves events and plays out the game

Frameworks/libraries:

1. The game runs in the [Phaser framework](https://phaser.io/phaser4)
2. The game server runs in Node.js

Graphics:

1. Emoji graphics are from [Google's Noto project](https://github.com/googlefonts/noto-emoji)
2. Most in-game assets are from [Kenney.nl](https://kenney.nl/)
3. All backgrounds are pre-rendered in Blender. I used the Blender MCP to help me make most of the initial setup and config within the game, then I went back in and touched some things up by hand.
