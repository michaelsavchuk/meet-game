// Trailer page (/trailer, dev only): plays a scripted trailer in the game frame and records it. The director below
// sends chat into the game the way the bridge does and runs scene commands, so everything on screen is the real game;
// it only picks who types what, when. It edits as it goes: the recorder runs during each shot (roll()) and pauses
// between them (cut()), so the take is the finished cut. `npm run trailer` turns it into dist/trailer.mp4.
// Captions are the game's flash banner, smaller and at the bottom, so the action stays visible above them.
import { normalize } from './events.js';

const CAST = [
  ['Sam', '🦊', 'hi!'], ['Priya', '🐸', 'let me in'], ['Jordan', '🐼', 'hey all'], ['Mei', '🦄', 'ready!'],
  ['Diego', '🐙', 'yo'], ['Fatima', '🤖', "i'm here"], ['Theo', '🐯', 'lets go'], ['Amara', '🐧', 'hello'],
];
const CAPTION = { y: 668, scale: 0.6, ms: 1700 };   // over the front wall: word bubbles grow up, so the top would hide them
const POLL_MS = 30;
const RECEIVER = 'http://localhost:8788/';   // npm run trailer (scripts/trailer.js PORT)

const frame = document.getElementById('game');
const status = document.getElementById('status');
const buttons = [...document.querySelectorAll('header button')];
let game = null;       // the frame's Phaser game
let recorder = null;   // null while rehearsing

// ---- Plumbing ----

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, timeout = 30000) {
  const end = performance.now() + timeout;
  while (!test()) {
    if (performance.now() > end) throw new Error(`Timed out waiting for ${test}`);
    await wait(POLL_MS);
  }
}

// Fake Meet events, delivered like bridge.js does in its local transport (but straight to this frame's game, so other
// local games open in the browser don't get them).
function chat(sender, text) {
  game.events.emit('chat', normalize['chat-message']({ id: crypto.randomUUID(), userId: `trailer-${sender}`, sender, text, receivedAt: new Date().toISOString() }));
}

function react(sender, emoji) {
  game.events.emit('reaction', normalize['meet-reaction']({ emoji, participantId: `trailer-${sender}`, sender, receivedAt: new Date().toISOString() }));
}

// Run `command` (which starts scene `key`) and resolve with the scene once it's created, showing `background` and
// with no heart drops (too specific for an overview).
function begin(key, command, background) {
  const scene = game.scene.getScene(key);
  return new Promise((resolve) => {
    scene.events.once('create', () => {
      scene.createdAt = performance.now();
      if (background) scene.background.setTexture(`bg-${background}`);
      scene.scheduleHeart = () => {};
      resolve(scene);
    });
    command();
  });
}

// Wait until `ms` after the scene was created (to line up with its countdown).
const sinceCreate = (scene, ms) => wait(scene.createdAt + ms - performance.now());

// A caption: BattleScene's banner on a stand-in for `scene` (any scene, the lobby too), so it doesn't replace a
// game banner showing at the same time.
function caption(scene, text, ms = CAPTION.ms) {
  const { banner, updateBanner } = game.scene.getScene('battle');
  const view = Object.assign(Object.create(scene), { bannerObj: null, bannerTimer: null, bannerState: null, updateBanner });
  banner.call(view, text, { persist: true });
  view.bannerObj.setScale(CAPTION.scale).setY(CAPTION.y);
  let gone = false;   // done() can run during the same 'update' that already has tick() lined up
  const tick = () => gone || view.updateBanner();
  const done = () => {
    if (gone) return;
    gone = true;
    scene.events.off('update', tick);
    scene.events.off('shutdown', done);
    view.bannerObj.destroy();
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', done);
  scene.time.delayedCall(ms, done);
}

// ---- Recording ----

let chunks = [];

function roll() {
  if (!recorder) return;
  if (recorder.state === 'inactive') recorder.start();
  else recorder.resume();
}

function cut() {
  if (recorder?.state === 'recording') recorder.pause();
}

function newRecorder() {
  const canvas = frame.contentDocument.querySelector('canvas');
  chunks = [];
  const rec = new MediaRecorder(canvas.captureStream(60), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 16e6 });
  rec.ondataavailable = (e) => chunks.push(e.data);
  return rec;
}

// Post the take to `npm run trailer` (scripts/trailer.js), which makes dist/trailer.mp4; if that isn't running,
// download it instead. Resolves with what happened, for the status line.
async function save() {
  const blob = await new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.stop();
  });
  try {
    const res = await fetch(RECEIVER, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: blob });
    if (!res.ok) throw new Error(await res.text());
    const { file, size } = await res.json();
    return `Done: wrote ${file} (${(size / 1e6).toFixed(2)} MB).`;
  } catch {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'meet-game-trailer.webm';
    link.click();
    return 'Done: npm run trailer isn\'t running, so the take went to Downloads; convert it with npm run trailer -- <file>.';
  }
}

// ---- Fighters ----

const idle = (f) => !f.out && !f.character.chasing && !f.character.airborne;
const dist = (a, b) => Math.hypot(a.character.x - b.character.x, a.character.y - b.character.y);
const nearest = (to, list) => [...list].sort((a, b) => dist(to, a) - dist(to, b));
const typo = (word) => word + word.at(-1);   // doubled last letter: "so close!"

// Two pairs from `list`, each a comfortable chase apart (so a counter has time to land), for the parry shot.
function pairs(list) {
  const left = [...list];
  const out = [];
  while (out.length < 2 && left.length >= 2) {
    const [a] = left.splice(0, 1);
    const b = [...left].sort((x, y) => Math.abs(dist(a, x) - 350) - Math.abs(dist(a, y) - 350))[0];
    left.splice(left.indexOf(b), 1);
    out.push([a, b]);
  }
  return out;
}

// ---- The trailer ----

async function play() {
  const lobby = game.scene.getScene('lobby');
  lobby.commands.clear();

  // Lobby: everyone chats in and runs in from the stairs.
  roll();
  caption(lobby, 'Chat to join!', 2200);
  CAST.forEach(([name, emoji, hello], i) => setTimeout(() => { chat(name, hello); react(name, emoji); }, 100 + i * 170));
  await wait(2400);
  cut();

  // Battle: a quick 3-2-1 (a slice of each number) and "Type to Fight!".
  const battle = await begin('battle', () => lobby.commands.start(), 'arena');
  for (const at of [0, 1000, 2000]) {
    await sinceCreate(battle, at);
    roll(); await wait(330); cut();
  }
  await sinceCreate(battle, 3000);
  roll(); await wait(1000); cut();

  // Chaos: three gang up on one (and knock them out), two more chases, and a fumbled counter.
  await until(() => battle.fighting);
  roll();
  caption(battle, 'Type a word to attack!');
  const fighters = [...battle.fighters.values()];
  const victim = nearest({ character: { x: 640, y: 400 } }, fighters)[0];
  // Not right next to them, so all three are on their way before the first hit takes the victim's word away.
  const others = nearest(victim, fighters.filter((f) => f !== victim));
  const gang = [...others.filter((f) => dist(f, victim) > 220), ...others].filter((f, i, all) => all.indexOf(f) === i).slice(0, 3);
  const rest = fighters.filter((f) => f !== victim && !gang.includes(f)).sort((a, b) => a.character.x - b.character.x);
  const [d, e, f, g] = rest;
  const target = victim.word;
  gang.forEach((a, i) => setTimeout(() => chat(a.name, target), 250 + i * 60));
  setTimeout(() => chat(d.name, e.word), 700);
  setTimeout(() => chat(f.name, g.word), 900);
  setTimeout(() => chat(g.name, typo(f.word)), 1250);
  await until(() => victim.out && !victim.character.visible);
  await wait(400);
  cut();

  // Parries: two attacks, each countered, with another chase going on.
  await until(() => battle.alive().filter((x) => idle(x) && x.word).length >= 4);
  await wait(300);
  const ready = battle.alive().filter((x) => idle(x) && x.word);
  const duels = pairs(ready);
  roll();
  caption(battle, 'Type theirs to parry!');
  duels.forEach(([attacker, defender], i) => {
    setTimeout(() => chat(attacker.name, defender.word), 150 + i * 200);
    setTimeout(() => chat(defender.name, attacker.word), 450 + i * 200);
  });
  const extra = ready.find((x) => !duels.flat().includes(x));
  const prey = battle.alive().find((x) => x.word && !duels.flat().includes(x) && x !== extra);
  if (extra && prey) setTimeout(() => chat(extra.name, prey.word), 300);
  await wait(500);
  await until(() => duels.every(([attacker]) => !attacker.character.chasing));
  await wait(600);
  cut();

  // Co-op: six enemies from wave 5 (a mix of levels) all running in at once, and the team clearing them.
  await begin('lobby', () => battle.commands.end());
  const coop = await begin('survival', () => lobby.commands.coop(), 'dungeon');
  coop.wave = 4;   // the first wave it starts is wave 5
  await until(() => coop.spec);
  coop.toSpawn = 6;
  for (let i = 0; coop.toSpawn > 0; i++) { coop.spawnEnemy(); await wait(220); }
  await wait(300);
  roll();
  caption(coop, 'Team up in co-op!', 2000);
  const claimed = new Map();   // enemy word -> when a player goes for it (a 2-💜 enemy gets a new word after a hit)
  const decided = new Map();     // enemy -> the player it was chasing when we decided whether they counter
  const team = setInterval(() => {
    const now = performance.now();
    for (const enemy of coop.enemies) {
      if (enemy.out || !enemy.word) continue;
      // Players counter some of the enemies coming at them.
      const prey = coop.fighterOf(enemy.character.target);
      if (prey && decided.get(enemy) !== prey) {
        decided.set(enemy, prey);
        if (Math.random() < 0.5) setTimeout(() => chat(prey.name, enemy.word), 300);
      }
      if (!claimed.has(enemy.word)) { claimed.set(enemy.word, now + 500 + Math.random() * 1800); continue; }
      if (now < claimed.get(enemy.word)) continue;
      const player = nearest(enemy, coop.alive().filter(idle))[0];
      if (player) { chat(player.name, enemy.word); claimed.set(enemy.word, Infinity); }
    }
  }, 120);
  await until(() => coop.bannerObj && coop.enemies.every((x) => x.out));
  await wait(1300);
  clearInterval(team);
  cut();

  // Finale: a new battle, fought off camera down to the last two, then the final blow and the winner.
  await begin('lobby', () => coop.commands.end());
  const final = await begin('battle', () => lobby.commands.start(), 'forest');
  await until(() => final.fighting);
  for (;;) {
    await wait(150);
    const alive = final.alive();
    if (alive.some((x) => x.character.chasing || x.character.airborne)) continue;
    const victim = alive.filter((x) => x.word).sort((a, b) => a.hp - b.hp)[0];
    if (!victim) continue;
    if (alive.length === 2 && victim.hp === 1) {
      if (alive.every((x) => x.word)) break;
      continue;   // wait for the other's word to come back
    }
    const attackers = alive.filter((x) => x !== victim).slice(0, alive.length === 2 ? 1 : 3);
    for (const a of attackers) chat(a.name, victim.word);
  }
  await wait(400);
  const [winner, loser] = final.alive().sort((a, b) => b.hp - a.hp);
  roll();
  await wait(300);
  chat(winner.name, loser.word);
  setTimeout(() => chat(loser.name, typo(winner.word)), 350);
  await until(() => final.winner && final.bannerObj);
  await wait(900);
  caption(final, 'Play it in Google Meet', 5000);
  await wait(1900);
  cut();
}

async function run(record) {
  buttons.forEach((b) => { b.disabled = true; });
  status.textContent = record ? 'Recording… keep this tab visible' : 'Rehearsing…';
  try {
    await new Promise((resolve) => {   // a fresh game each take
      frame.addEventListener('load', resolve, { once: true });
      frame.contentWindow.location.reload();
    });
    await until(() => frame.contentWindow.game?.scene.isActive('lobby'));
    game = frame.contentWindow.game;
    await wait(500);
    recorder = record ? newRecorder() : null;
    await play();
    status.textContent = recorder ? await save() : 'Done.';
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
    if (recorder?.state !== 'inactive') recorder?.stop();
    throw err;
  } finally {
    recorder = null;
    buttons.forEach((b) => { b.disabled = false; });
  }
}

document.getElementById('record').addEventListener('click', () => run(true));
document.getElementById('rehearse').addEventListener('click', () => run(false));
status.textContent = 'Ready';
