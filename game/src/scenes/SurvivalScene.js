import * as Phaser from '/vendor/phaser.js';
import { listen, simulateChat, simulateReaction, FAKE_EMOJI } from '../bridge.js';
import { roster } from '../roster.js';
import { EnemyBrain } from '../bots.js';
import { Character, spreadSpots } from '../objects/Character.js';
import { FloorText } from '../objects/FloorText.js';
import { BattleScene, BANNER_MS, koAnimation } from './BattleScene.js';
import {
  MAX_HP, WANDER_SPEED, COUNTDOWN, COUNTDOWN_STEP, DEV_EVENTS, ENEMY_EMOJI, ENEMY_TINT, ENEMY_RUSH, ENEMY_ENTER_SPEED, ENEMIES_PER_PLAYER, ROAM_AVOID_RADIUS,
  WAVE_BREAK, WAVE_HEAL, DIFFICULTIES, NORMAL, waveSpec,
} from '../config.js';

const LEVELS = ['easy', 'normal', 'hard'];   // bots.js LEVELS, easiest first
const ENEMY_HEART = '💜';
const ENTER_STAGGER = 600;   // ms; like BattleScene, players start running in within this and arrive as the countdown ends
const ENTER_SLACK = 150;
const DIFFICULTY_KEY = 'coop-difficulty';   // localStorage, so the host's setting survives reloading the game page

// The co-op difficulty setting (index into DIFFICULTIES), set from the control page; read at the start of each wave.
let difficulty = NORMAL;
try { difficulty = Number(localStorage.getItem(DIFFICULTY_KEY) ?? NORMAL); } catch {}
if (!DIFFICULTIES[difficulty]) difficulty = NORMAL;

export function coopDifficulty() {
  return difficulty;
}

export function setCoopDifficulty(value) {
  if (!DIFFICULTIES[value]) return;
  difficulty = Number(value);
  try { localStorage.setItem(DIFFICULTY_KEY, difficulty); } catch {}
}

// Co-op: everyone in the roster against waves of enemies. Players have no words; enemies do, and typing one sends
// your character to hit it, like attacking in a battle (counters, hearts and misses work the same). Enemies run in from
// the stairs one by one through each wave and attack players on their own (EnemyBrain in bots.js). Each wave has more,
// tougher enemies (waveSpec in config.js); clearing one heals survivors a little and starts the next, and anyone who
// joined meanwhile runs in. When every player is out, it shows how far they got.
export class SurvivalScene extends BattleScene {
  constructor() {
    super('survival');
  }

  create() {
    koAnimation(this);
    this.add.image(0, 0, 'arena').setOrigin(0).setDepth(-1000);
    this.fighting = false;
    this.over = false;
    this.log = [];
    this.fighters = new Map();   // the players, as in BattleScene (word stays null)
    // { name (its emoji), enemy: true, level, brain, character, hp, maxHp, word, lastWord, out, revealTimer, parries,
    // arrived, lastHitBy }; parries stays empty (enemies don't counter). Knocked-out ones are cleared each wave.
    this.enemies = [];
    this.suddenDeath = 0;   // never in co-op; BattleScene reads it
    this.lastHitAt = this.time.now;
    this.heart = null;
    this.lastHeartWord = null;
    this.heartTimer = null;
    this.wave = 0;
    this.spec = null;       // this wave's waveSpec()
    this.toSpawn = 0;       // enemies still to come this wave
    this.spawnTimer = null;
    this.floorText = new FloorText(this);

    const countdown = COUNTDOWN * COUNTDOWN_STEP;
    const spots = spreadSpots(roster.size);
    for (const [i, player] of roster.all().entries()) {
      const delay = Phaser.Math.Between(0, ENTER_STAGGER);
      this.addPlayer(player, { spot: spots[i], delay, duration: countdown - ENTER_SLACK - delay });
    }
    for (let n = COUNTDOWN; n > 0; n--) this.time.delayedCall((COUNTDOWN - n) * COUNTDOWN_STEP, () => this.banner(String(n)));
    this.time.delayedCall(countdown, () => {
      this.fighting = true;
      this.scheduleHeart();
      this.startWave();
    });

    listen(this, { chat: this.onChat, reaction: this.onReaction });

    // Commands from the control page (see remote.js). Dev: C = a random player attacks an enemy, T = a typo of an
    // enemy's word, P = a chased player counters, R = a random player reacts, H = a heart drops now, G = a random
    // player goes for the heart, E = one more enemy runs in now.
    const pick = Phaser.Utils.Array.GetRandom;
    const idle = () => this.alive().filter((f) => !f.character.chasing);
    const worded = () => this.enemies.filter((e) => !e.out && e.word);
    this.commands = {
      end: () => this.backToLobby(),
      C: () => {
        const [player, enemy] = [pick(idle()), pick(worded())];
        if (player && enemy) simulateChat(player.name, `${enemy.word}!`);
      },
      T: () => {
        const [player, enemy] = [pick(idle()), pick(worded())];
        if (player && enemy) simulateChat(player.name, enemy.word + enemy.word.at(-1));   // doubled last letter
      },
      P: () => {
        const enemy = pick(worded().filter((e) => this.fighterOf(e.character.target)));
        if (enemy) simulateChat(this.fighterOf(enemy.character.target).name, enemy.word);
      },
      R: () => {
        if (this.fighters.size) simulateReaction(pick([...this.fighters.keys()]), pick(FAKE_EMOJI));
      },
      H: () => this.fighting && !this.over && this.dropHeart(true),
      G: () => {
        const player = pick(idle());
        if (player && this.liveHeart()) simulateChat(player.name, this.heart.word);
      },
      E: () => {
        if (!this.spec || this.over) return;
        this.toSpawn++;
        this.spawnEnemy();
      },
    };
    this.input.keyboard.on('keydown-ENTER', () => this.over && this.backToLobby());
    for (const key of ['C', 'T', 'P', 'R', 'H', 'G', 'E']) {
      if (DEV_EVENTS) this.input.keyboard.on(`keydown-${key}`, this.commands[key]);
      else delete this.commands[key];
    }
  }

  snapshot() {
    const chasing = (f) => this.fighterOf(f.character.target)?.name ?? (f.character.target && f.character.target === this.heart ? 'the 💖' : null);
    return {
      phase: 'survival',
      fighting: this.fighting,
      over: this.over,
      wave: this.wave,
      toCome: this.toSpawn,
      heart: this.liveHeart()?.word ?? null,
      maxHp: MAX_HP,
      fighters: [...this.fighters.values()].map((f) => ({
        name: f.name,
        emoji: roster.get(f.name)?.emoji,
        hp: f.hp,
        out: f.out,
        chasing: chasing(f),
        parrying: [...f.parries].map((p) => p.name),
      })),
      enemies: this.enemies.filter((e) => !e.out).map((e) => ({
        emoji: e.name, level: e.level, hp: e.hp, maxHp: e.maxHp, word: e.word, entering: e.character.entering, chasing: chasing(e),
      })),
      waiting: roster.all().filter((p) => !this.fighters.has(p.name)),   // they run in next wave
      log: this.log,
    };
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.fighting || this.over) return;
    for (const enemy of this.enemies) {
      if (enemy.out || enemy.character.onStairs) continue;
      // Its word appears once it's off the stairs, so nobody chases it while it's still off screen, and players can go
      // for it while it runs to its spot. It starts attacking once there.
      if (!enemy.arrived) { enemy.arrived = true; this.newWord(enemy); continue; }
      if (!enemy.character.entering) enemy.brain.tick(this, enemy, time);
    }
  }

  // On top of BattleScene's fleeing: players and enemies roaming around keep away from each other (chasers don't).
  steer(fighter, chasedBy, others, delta) {
    super.steer(fighter, chasedBy, others, delta);
    const { character } = fighter;
    if (character.fleeSpeed || character.chasing || character.entering) return;
    character.fleeSpeed = WANDER_SPEED;
    character.steerAway(this.foes(fighter).map((f) => f.character), delta, ROAM_AVOID_RADIUS);
  }

  updateSuddenDeath() {}   // enemies keep attacking, so nothing stalls

  // ---- Who fights whom ----

  everyone() {
    return [...this.fighters.values(), ...this.enemies];
  }

  foes(fighter) {
    return fighter.enemy ? this.alive() : this.enemies.filter((e) => !e.out);
  }

  carriesWord(fighter) {
    return !!fighter.enemy;
  }

  heartIcon(fighter) {
    return fighter.enemy ? ENEMY_HEART : '❤️';
  }

  get joinsWhen() {
    return 'next wave';
  }

  // ---- Waves ----

  addPlayer(player, entry) {
    const character = new Character(this, player).setSword(true).setHp(MAX_HP, MAX_HP).enter(entry);
    this.fighters.set(player.name, { name: player.name, character, hp: MAX_HP, maxHp: MAX_HP, word: null, lastWord: null, out: false, revealTimer: null, parries: new Set() });
  }

  // Announce the next wave; its enemies start running in once the banner's gone.
  startWave() {
    if (this.over) return;
    this.wave++;
    for (const enemy of this.enemies) enemy.character.destroy();   // the last wave's, long gone off screen
    this.enemies = [];
    if (this.wave > 1) {
      for (const player of roster.all()) {
        if (this.fighters.has(player.name)) continue;
        this.addPlayer(player, {});
        this.addLog(`👋 ${player.name} joins the fight`);
      }
      for (const f of this.alive()) {
        const healed = Math.min(f.maxHp, f.hp + WAVE_HEAL) - f.hp;
        if (!healed) continue;
        f.hp += healed;
        f.character.setHp(f.hp, f.maxHp);
        this.floatText(f.character.x, f.character.y - 70, `+${healed} ❤️`, '#ff8fb3');
      }
    }
    this.spec = waveSpec(this.wave, this.alive().length, DIFFICULTIES[difficulty]);
    this.toSpawn = this.spec.count;
    this.addLog(`🌊 Wave ${this.wave}: ${this.spec.count} enemies (${DIFFICULTIES[difficulty].label.toLowerCase()})`);
    this.banner(`Wave ${this.wave}`);
    this.updateFloorText();
    this.scheduleSpawn(BANNER_MS);
  }

  // The next enemy comes right away while there aren't enough on the floor for everyone to have someone to fight
  // (including at the start of a wave), otherwise after the wave's spawnEvery.
  scheduleSpawn(delay = this.shortHanded() ? ENEMY_RUSH : Phaser.Math.Between(...this.spec.spawnEvery)) {
    this.spawnTimer?.remove();
    this.spawnTimer = this.toSpawn && !this.over ? this.time.delayedCall(delay, () => { this.spawnEnemy(); this.scheduleSpawn(); }) : null;
  }

  // One of this wave's enemies runs in from a random staircase, at a level and HP picked from waveSpec().
  spawnEnemy() {
    if (!this.toSpawn || this.over) return;
    this.toSpawn--;
    const { hp: [min, max], difficulty: toughness, rest } = this.spec;
    const level = LEVELS[Phaser.Math.Clamp(Math.floor(toughness + Math.random()), 0, LEVELS.length - 1)];
    const emoji = Phaser.Utils.Array.GetRandom(ENEMY_EMOJI);
    const hp = Phaser.Math.Between(min, max);
    const character = new Character(this, { name: '', emoji }).setSword(true).setEmojiTint(ENEMY_TINT[level])
      .setHp(hp, hp, ENEMY_HEART).enter({ speed: ENEMY_ENTER_SPEED });
    this.enemies.push({
      name: emoji, enemy: true, level, brain: new EnemyBrain(level, rest), character, hp, maxHp: hp,
      word: null, lastWord: null, out: false, revealTimer: null, parries: new Set(), arrived: false, lastHitBy: null,
    });
    this.updateFloorText();
  }

  // ---- Combat ----

  hit(attacker, victim) {
    super.hit(attacker, victim);
    if (victim.enemy) victim.lastHitBy = attacker;   // for 'grudge' enemies
  }

  knockOut(victim, by) {
    victim.out = true;
    victim.revealTimer?.remove();
    for (const f of this.everyone()) {
      if (f.character.target === victim.character) f.character.cancelChase();
    }
    const last = !victim.enemy && !this.alive().length;
    victim.character.knockOut(by.character.x, by.character.y, () => {
      this.cameras.main.shake(victim.enemy ? 250 : 450, victim.enemy ? 0.012 : 0.025);
      if (last) this.banner(`You made it to wave ${this.wave}!`, { color: '#ffd84d', persist: true, wave: true });
    });
    this.cameras.main.shake(300, 0.015);
    if (victim.enemy) {
      this.addLog(`💀 ${by.name} defeated ${victim.name}`);
      this.enemyDown();
    } else {
      this.addLog(`💀 ${by.name} knocked out ${victim.name}`);
      if (last) this.gameOver();
    }
    this.updateFloorText();
  }

  shortHanded() {
    return this.enemies.filter((e) => !e.out).length < Math.ceil(this.alive().length * ENEMIES_PER_PLAYER);
  }

  // Mid-wave with too few left on the floor, the next enemy comes right away; with nobody left to come, the wave's cleared.
  enemyDown() {
    if (this.over) return;
    if (this.toSpawn) { if (this.shortHanded()) this.scheduleSpawn(); return; }
    if (this.enemies.some((e) => !e.out)) return;
    this.addLog(`✅ Wave ${this.wave} cleared`);
    this.banner(`Wave ${this.wave} cleared!`);
    this.time.delayedCall(WAVE_BREAK, () => this.startWave());
  }

  gameOver() {
    this.over = true;
    this.addLog(`☠️ Everyone's out on wave ${this.wave}`);
    this.spawnTimer?.remove();
    for (const f of this.everyone()) f.character.cancelChase();
    this.heartTimer?.remove();
    this.heart?.expire();
    this.heart = null;
  }

  // "Wave N" and how many enemies are left (on the floor or still to come) on the floor.
  updateFloorText() {
    const left = this.toSpawn + this.enemies.filter((e) => !e.out).length;
    this.floorText.set(this.wave && !this.over ? `Wave ${this.wave}` : null, this.wave && !this.over ? `${left} ${left === 1 ? 'enemy' : 'enemies'} left` : null);
  }
}
