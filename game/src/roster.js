import * as Phaser from 'phaser';

// Everyone who has joined, kept across rounds so people don't have to rejoin after each game.
// Keyed by display name (the only id chat and reactions share; see CLAUDE.md).
const players = new Map();   // name -> { name, emoji }

const CHARACTER_EMOJI = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
  '🐧', '🐦', '🐤', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍',
  '🦖', '🐙', '🦑', '🦀', '🐡', '🐬', '🐳', '🦈', '🐊', '🦓', '🦒', '🦔', '🦥', '🦦', '👽', '🤖',
  '👻', '🎃', '🤠', '🥷', '🧙', '🧛', '🧟', '🦸',
];

// A character emoji nobody else has, if one is left.
function randomEmoji() {
  const used = new Set([...players.values()].map((p) => p.emoji));
  const free = CHARACTER_EMOJI.filter((e) => !used.has(e));
  return Phaser.Utils.Array.GetRandom(free.length ? free : CHARACTER_EMOJI);
}

export const roster = {
  get: (name) => players.get(name),
  has: (name) => players.has(name),
  all: () => [...players.values()],
  get size() { return players.size; },

  // Returns the player, adding them with a random emoji if they're new.
  join(name) {
    if (!players.has(name)) players.set(name, { name, emoji: randomEmoji() });
    return players.get(name);
  },

  setEmoji(name, emoji) {
    const player = players.get(name);
    if (player) player.emoji = emoji;
    return player;
  },

  clear() { players.clear(); },
};
