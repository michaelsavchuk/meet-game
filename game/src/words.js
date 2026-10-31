import * as Phaser from '/vendor/phaser.js';

// PG, 4–7 letters, easy to spell, unlikely to come up in normal chat by accident.
export const WORDS = [
  'anchor', 'apple', 'badger', 'bacon', 'banjo', 'beetle', 'biscuit', 'bubble', 'button', 'cactus',
  'candle', 'canyon', 'carrot', 'castle', 'cheese', 'cherry', 'cobra', 'comet', 'cookie', 'crayon',
  'donut', 'dragon', 'eagle', 'falcon', 'fiddle', 'forest', 'galaxy', 'garlic', 'ginger', 'glacier',
  'gravy', 'guitar', 'hammer', 'hippo', 'honey', 'igloo', 'island', 'jacket', 'jelly', 'jungle',
  'kayak', 'kettle', 'koala', 'ladder', 'lemon', 'lizard', 'llama', 'lobster', 'magnet', 'mango',
  'marble', 'meadow', 'mitten', 'monkey', 'moose', 'muffin', 'nacho', 'noodle', 'nugget', 'olive',
  'orbit', 'otter', 'oyster', 'panda', 'parrot', 'peanut', 'pebble', 'pencil', 'pepper', 'pickle',
  'pillow', 'pirate', 'planet', 'pretzel', 'puffin', 'pumpkin', 'puzzle', 'quilt', 'rabbit', 'raccoon',
  'radish', 'rhino', 'robot', 'rocket', 'saddle', 'salad', 'sandal', 'scarf', 'shark', 'shovel',
  'sloth', 'snail', 'sponge', 'sprout', 'squid', 'sunset', 'sushi', 'taco', 'tiger', 'toast',
  'tomato', 'tractor', 'trumpet', 'tuba', 'tulip', 'turnip', 'turtle', 'unicorn', 'velvet', 'violin',
  'volcano', 'waffle', 'wagon', 'walrus', 'whale', 'wizard', 'yeti', 'yogurt', 'zebra', 'zipper',
];

// For heart pickups: longer (8–11 letters) and trickier to spell, with doubled letters and odd vowels, so grabbing
// one takes a moment. None are in WORDS.
export const HEART_WORDS = [
  'asparagus', 'avalanche', 'blueberry', 'boomerang', 'broccoli', 'butterfly', 'cappuccino', 'chameleon', 'cinnamon',
  'flamingo', 'harmonica', 'hurricane', 'jellyfish', 'kangaroo', 'labyrinth', 'lollipop', 'marshmallow', 'mosquito',
  'parachute', 'peppermint', 'pistachio', 'porcupine', 'raspberry', 'saxophone', 'spaghetti', 'tambourine',
  'toboggan', 'trampoline', 'xylophone', 'zucchini',
];

// A random word from `list` that isn't in `taken` (words currently on screen), so every bubble is unique.
export function pickWord(taken = new Set(), list = WORDS) {
  const free = list.filter((w) => !taken.has(w));
  return Phaser.Utils.Array.GetRandom(free.length ? free : list);
}

// Lowercase words in a chat message, for matching typed words against bubbles.
export function tokenize(text) {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}

// True if `token` looks like a typo of `word`: not equal, but one edit away. Tokens under 4 letters
// never count, so everyday words like "yet" don't read as a miss on "yeti".
export function nearMiss(token, word) {
  if (token === word || token.length < 4 || Math.abs(token.length - word.length) > 1) return false;
  return editDistance(token, word) === 1;
}

// Insertions, deletions, substitutions, and swaps of two neighboring letters each count as one edit.
function editDistance(a, b) {
  let before = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (before && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    before = prev;
    prev = row;
  }
  return prev[b.length];
}
