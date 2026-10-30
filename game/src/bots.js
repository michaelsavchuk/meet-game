import * as Phaser from 'phaser';
import { simulateChat, simulateReaction, FAKE_EMOJI } from './bridge.js';
import { roster } from './roster.js';
import { MAX_HP } from './config.js';

// CPU players, added from the control page. Each one plays like a person in the call: it reads the screen (the
// active scene's state), takes a moment to react, "types" a word letter by letter at its own speed, sometimes makes
// a typo and retypes it, and sends chat through the server like a real message, so the game treats it like anyone else.
// Bots live outside the scenes and follow the roster: they join by chatting, and "Clear players" drops them.

const TICK_MS = 100;

// Per level: typing speed (words per minute, 5 letters a word), ms to notice something and start typing, chance a
// word comes out with a typo, chance of noticing a chaser and typing their word to counter, how much they want a
// heart when hurt, and the ms they hesitate between attacks. Each bot varies these a little (see Bot).
export const LEVELS = {
  easy: { wpm: 22, react: [1200, 2400], typo: 0.25, counter: 0.3, greed: 0.5, pause: [1500, 4000] },
  normal: { wpm: 40, react: [700, 1400], typo: 0.12, counter: 0.6, greed: 0.75, pause: [600, 2000] },
  hard: { wpm: 70, react: [350, 750], typo: 0.05, counter: 0.9, greed: 0.95, pause: [200, 800] },
};

// How a bot picks who to attack: the most hurt, whoever's nearest, whoever hit it last, or anyone.
const STYLES = ['hunter', 'brawler', 'grudge', 'wild'];

const NAMES = ['Sam', 'Priya', 'Jordan', 'Mei', 'Diego', 'Fatima', 'Oskar', 'Lena', 'Theo', 'Amara', 'Kai', 'Noor', 'Ruby', 'Felix', 'Yuki', 'Omar'];
const HELLO = ['hi!', 'hello', 'hey all', 'yo', 'hi everyone', 'let me in', "i'm here", 'ready'];
const LOBBY_CHAT = ['lets go', 'ready when you are', 'who else is playing', 'start it!', 'im so ready', 'this is gonna be fun', 'waiting…'];
const KNOCKED_OUT = ['gg', 'noooo', 'rip me', 'gg wp', 'nooo i was so close', 'ugh'];
const WON = ['gg!', 'gg ez', 'yesss', 'gg everyone', 'lets gooo'];
const LOST = ['gg', 'gg wp', 'nice one', 'rematch?'];
const KEYS = 'qwertyuiopasdfghjklzxcvbnm';

const rand = ([min, max]) => Phaser.Math.Between(min, max);
const chance = (p) => Math.random() < p;
const pick = (list) => Phaser.Utils.Array.GetRandom(list);

const bots = new Map();   // name -> Bot

// Add a CPU player at `level` (or a random one for 'mixed'). It joins by saying hi, so in a battle it joins next round.
export function addBot(level = 'normal') {
  if (!LEVELS[level]) level = pick(Object.keys(LEVELS));
  const taken = (n) => bots.has(n) || roster.has(n);
  let name = pick(NAMES.filter((n) => !taken(n)));
  for (let i = 2; !name || taken(name); i++) name = `${pick(NAMES)} ${i}`;
  const bot = new Bot(name, level);
  bots.set(name, bot);
  simulateChat(name, pick(HELLO));
  return bot;
}

// Take every CPU player out of the game. Only in the lobby, so nobody vanishes mid-fight.
export function removeBots(game) {
  const scene = activeScene(game);
  if (scene?.scene.key !== 'lobby') return;
  for (const name of bots.keys()) scene.removePlayer(name);
  bots.clear();
}

// name -> level, for the control page.
export function botLevels() {
  return Object.fromEntries([...bots.values()].filter((b) => b.joined).map((b) => [b.name, b.level]));
}

export function startBots(game) {
  setInterval(() => {
    const scene = activeScene(game);
    const now = performance.now();
    for (const bot of bots.values()) {
      if (roster.has(bot.name)) bot.joined = true;
      else if (bot.joined) { bots.delete(bot.name); continue; }   // cleared from the roster
      if (scene) bot.tick(scene, now);
    }
  }, TICK_MS);
}

function activeScene(game) {
  return game.scene.getScenes(true).find((scene) => scene.snapshot);
}

class Bot {
  constructor(name, level) {
    this.name = name;
    this.level = level;
    // Everyone's a little different, even at the same level.
    const base = LEVELS[level];
    const vary = (n) => n * Phaser.Math.FloatBetween(0.8, 1.2);
    this.msPerChar = 12000 / vary(base.wpm);
    this.react = base.react.map(vary);
    this.typo = vary(base.typo);
    this.counter = Math.min(1, vary(base.counter));
    this.greed = Math.min(1, vary(base.greed));
    this.pause = base.pause.map(vary);
    this.style = pick(STYLES);
    this.joined = false;
    this.scene = null;
  }

  // A new scene (lobby, or a new round): forget everything from the last one.
  reset(scene, now) {
    this.scene = scene;
    this.plan = null;          // what it's typing: { kind: 'attack' | 'counter' | 'heart', word, target, sendAt, retyping }
    this.nextThinkAt = now + rand(this.react);
    this.noticed = new Set();  // chasers it has already reacted to (countered or not)
    this.seenHeart = null;
    this.lastHp = MAX_HP;
    this.lastChasers = [];
    this.lastHitBy = null;
    this.spokeOut = false;
    this.spokeOver = false;
    this.nextChatAt = now + rand([8000, 25000]);
  }

  tick(scene, now) {
    if (scene !== this.scene) this.reset(scene, now);
    if (scene.scene.key === 'lobby') this.lobby(now);
    else if (scene.scene.key === 'battle') this.battle(scene, now);
  }

  // Now and then say something or react (which changes their emoji), like people waiting for a game.
  lobby(now) {
    if (!this.joined || now < this.nextChatAt) return;
    this.nextChatAt = now + rand([12000, 40000]);
    if (chance(0.3)) simulateReaction(this.name, pick(FAKE_EMOJI));
    else if (chance(0.5)) simulateChat(this.name, pick(LOBBY_CHAT));
  }

  battle(scene, now) {
    const me = scene.fighters.get(this.name);
    if (!me) return;   // joined mid-round: watching
    if (scene.over) {
      if (!this.spokeOver) {
        this.spokeOver = true;
        const won = scene.winner === me;
        if (chance(won ? 0.7 : 0.25)) this.say(pick(won ? WON : LOST), now + rand([1500, 3500]));
      }
      this.flushSay(now);
      return;
    }
    if (me.out) {
      if (!this.spokeOut) {
        this.spokeOut = true;
        if (chance(0.5)) this.say(pick(KNOCKED_OUT), now + rand([800, 2000]));
      }
      this.flushSay(now);
      return;
    }
    if (!scene.fighting) { this.nextThinkAt = now + rand(this.react); return; }

    const chasers = scene.alive().filter((f) => f.character.target === me.character);
    if (me.hp < this.lastHp) this.lastHitBy = this.lastChasers.find((f) => !f.out) ?? this.lastHitBy;
    this.lastHp = me.hp;
    this.lastChasers = chasers;

    this.watchChasers(me, chasers, now);
    this.watchHeart(scene, me, now);
    if (!this.plan && now >= this.nextThinkAt) this.choose(scene, me, now);
    if (this.plan && now >= this.plan.sendAt) this.send(scene, me, now);
  }

  // Seeing "‼️" over itself, it may drop what it's typing and type the chaser's word to counter.
  watchChasers(me, chasers, now) {
    for (const chaser of this.noticed) if (!chasers.includes(chaser)) this.noticed.delete(chaser);
    for (const chaser of chasers) {
      if (this.noticed.has(chaser)) continue;
      this.noticed.add(chaser);
      if (this.plan?.kind === 'counter' || me.parries.has(chaser) || !chaser.word || !chance(this.counter)) continue;
      // Panic makes people quicker to start typing.
      this.plan = { kind: 'counter', word: chaser.word, target: chaser, sendAt: now + rand(this.react) * 0.6 + this.typingTime(chaser.word) };
    }
  }

  // A heart just landed: if hurt, it may switch to going for it.
  watchHeart(scene, me, now) {
    const heart = scene.liveHeart();
    if (!heart || heart === this.seenHeart) return;
    this.seenHeart = heart;
    if (this.plan?.kind === 'counter' || me.character.chasing) return;
    const want = me.hp < MAX_HP ? this.greed * (MAX_HP - me.hp + 1) / MAX_HP : this.greed * 0.15;   // full HP: maybe deny it
    if (chance(want)) this.plan = { kind: 'heart', word: heart.word, target: heart, sendAt: now + rand(this.react) + this.typingTime(heart.word) };
  }

  // Pick someone to attack and start typing their word.
  choose(scene, me, now) {
    const targets = scene.alive().filter((f) => f !== me && f.word);
    if (!targets.length) return;
    const weights = targets.map((f) => {
      const dist = Phaser.Math.Distance.Between(me.character.x, me.character.y, f.character.x, f.character.y);
      let w = 1 + (MAX_HP - f.hp) * 0.5 + (1 - Math.min(dist, 1000) / 1000);
      if (this.style === 'hunter') w += (MAX_HP - f.hp) * 2;
      if (this.style === 'brawler') w += 3 * (1 - Math.min(dist, 1000) / 1000);
      if (this.style === 'grudge' && f === this.lastHitBy) w += 4;
      return this.style === 'wild' ? 1 : w;
    });
    let roll = Math.random() * weights.reduce((a, b) => a + b);
    const target = targets.find((_, i) => (roll -= weights[i]) < 0) ?? targets.at(-1);
    this.plan = { kind: 'attack', word: target.word, target, sendAt: now + rand(this.react) + this.typingTime(target.word) };
  }

  // Done typing: hit enter. The word may have changed meanwhile (someone else got there first); people often send it
  // anyway ("too late!"), or notice and pick someone else.
  send(scene, me, now) {
    const plan = this.plan;
    const live = plan.kind === 'heart' ? scene.liveHeart() === plan.target : !plan.target.out && plan.target.word === plan.word;
    if (!live && chance(0.6)) { this.done(now, 0.5); return; }
    // Mid-chase, a new attack would just say "busy!", so wait for this one to land (counters work any time).
    if (plan.kind !== 'counter' && me.character.chasing) { plan.sendAt = now + rand([100, 300]); return; }
    if (!plan.retyping && chance(this.typo)) {
      simulateChat(this.name, typo(plan.word));
      // Sees "so close!", then retypes it.
      plan.retyping = true;
      plan.sendAt = now + rand(this.react) * 0.7 + this.typingTime(plan.word);
      return;
    }
    simulateChat(this.name, decorate(plan.word));
    this.done(now);
  }

  done(now, pauseScale = 1) {
    this.plan = null;
    this.nextThinkAt = now + rand(this.pause) * pauseScale;
  }

  // ms to type `word`, a bit uneven like real typing.
  typingTime(word) {
    return [...word].reduce((ms) => ms + this.msPerChar * Phaser.Math.FloatBetween(0.6, 1.4), 0);
  }

  // Chat after a delay (knocked-out players don't affect the game, so this is just flavor).
  say(text, at) {
    this.pendingSay = { text, at };
  }

  flushSay(now) {
    if (!this.pendingSay || now < this.pendingSay.at) return;
    simulateChat(this.name, this.pendingSay.text);
    this.pendingSay = null;
  }
}

// One slip of the fingers: a wrong, dropped, swapped or doubled letter (one edit, so the game says "so close!").
function typo(word) {
  const i = Phaser.Math.Between(1, word.length - 2);
  const doubled = word.slice(0, i) + word[i] + word.slice(i);
  switch (Phaser.Math.Between(0, 3)) {
    case 0: return word.slice(0, i) + pick([...KEYS.replace(word[i], '')]) + word.slice(i + 1);
    case 1: return word.slice(0, i) + word.slice(i + 1);
    case 2: return word[i] === word[i - 1] ? doubled : word.slice(0, i - 1) + word[i] + word[i - 1] + word.slice(i + 1);
    default: return doubled;
  }
}

// Most people just type the word; some shout it.
function decorate(word) {
  if (chance(0.15)) return `${word}!`;
  if (chance(0.08)) return word.toUpperCase();
  return word;
}
