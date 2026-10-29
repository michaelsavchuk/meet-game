import * as Phaser from 'phaser';

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

// A random word that isn't in `taken` (words currently on screen), so every bubble is unique.
export function pickWord(taken = new Set()) {
  const free = WORDS.filter((w) => !taken.has(w));
  return Phaser.Utils.Array.GetRandom(free.length ? free : WORDS);
}

// Lowercase words in a chat message, for matching typed words against bubbles.
export function tokenize(text) {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}
