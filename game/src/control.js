import { CHANNEL } from './remote.js';

// The host's control page (control.html): shows the game tab's state and sends it commands (see remote.js).

const STALE_MS = 2000;   // no snapshot for this long = the game page is closed
const DEV = {
  lobby: [['C', 'Fake player joins'], ['R', 'Fake reaction']],
  battle: [['C', 'Fake attack'], ['X', 'Fake chatter'], ['T', 'Fake typo'], ['P', 'Fake counter'], ['R', 'Fake reaction'], ['H', 'Drop a heart'], ['G', 'Fake heart grab']],
};

const $ = (id) => document.getElementById(id);
const channel = new BroadcastChannel(CHANNEL);
const send = (name, arg) => channel.postMessage({ type: 'command', name, arg });
let lastSeen = 0;
let devPhase = null;
let cpus = {};   // name -> level of the CPU players (see bots.js)

$('add-cpu').addEventListener('click', () => send('addCpu', $('cpu-level').value));
$('remove-cpus').addEventListener('click', () => send('removeCpus'));
document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => send(button.dataset.command)));

channel.onmessage = ({ data }) => {
  if (data.type !== 'state') return;
  lastSeen = Date.now();
  render(data);
};

setInterval(() => {
  const live = Date.now() - lastSeen < STALE_MS;
  document.body.classList.toggle('missing', !live);
  $('game-status').textContent = live ? 'game page open' : 'game page not open';
  $('game-status').className = `pill ${live ? 'good' : 'bad'}`;
  if (!live) $('server-status').hidden = true;
}, 500);

function render(state) {
  $('server-status').hidden = false;
  $('server-status').textContent = state.connected ? 'server connected' : 'server disconnected';
  $('server-status').className = `pill ${state.connected ? 'good' : 'bad'}`;

  const lobby = state.phase === 'lobby';
  button('start').hidden = !lobby;
  button('start').disabled = !state.canStart;
  button('clear').hidden = !lobby;
  button('end').hidden = lobby;
  button('end').textContent = state.over ? 'Back to lobby' : 'End round';
  $('log-section').hidden = lobby;
  renderDev(state.phase);
  cpus = state.cpus ?? {};
  const nCpus = Object.keys(cpus).length;
  $('remove-cpus').hidden = !lobby || !nCpus;
  $('cpu-note').textContent = lobby ? 'CPUs join by chatting and play through the server like anyone else.' : 'CPUs added now join next round.';

  if (lobby) renderLobby(state);
  else renderBattle(state);
}

function renderLobby({ players, canStart }) {
  const n = players.length;
  $('summary').textContent = `Lobby · ${n} player${n === 1 ? '' : 's'}${canStart ? '' : ' (need 2 to start)'}`;
  $('players-title').textContent = 'Players';
  $('players').replaceChildren(...players.map((p) => row([cell(p.emoji, 'emoji'), nameCell(p.name)])));
  if (!n) $('players').replaceChildren(row([cell('Nobody yet. Anyone who chats in the call joins.', 'muted')]));
  $('waiting').textContent = '';
}

function renderBattle({ fighting, over, winner, boost, heart, maxHp, fighters, waiting, log }) {
  const alive = fighters.filter((f) => !f.out).length;
  const summary = over ? `👑 ${winner} is the one!` : fighting ? `Battle · ${alive} of ${fighters.length} still standing` : 'Battle · get ready…';
  $('summary').replaceChildren(summary);
  if (boost && !over) $('summary').append(' · ', span(`⚡ sudden death, chases ×${boost}`, 'gold'));
  if (heart && !over) $('summary').append(' · ', `💖 ${heart}`);

  $('players-title').textContent = 'Fighters';
  $('players').replaceChildren(...fighters.map((f) => {
    const tr = row([
      cell(f.emoji, 'emoji'),
      nameCell(f.name),
      cell('❤️'.repeat(f.hp) + '🖤'.repeat(Math.max(0, maxHp - f.hp))),
      cell(f.out ? '' : over ? '🏆 winner' : !fighting ? '' : f.word ?? '… typing', 'word'),
      cell(fighterState(f), 'state'),
    ]);
    tr.classList.toggle('out', f.out);
    return tr;
  }));
  $('waiting').textContent = waiting.length ? `Next round: ${waiting.map((p) => `${p.emoji} ${p.name}${cpus[p.name] ? ' 🤖' : ''}`).join(', ')}` : '';

  const atBottom = $('log').scrollHeight - $('log').scrollTop - $('log').clientHeight < 8;
  $('log').replaceChildren(...log.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
  if (!log.length) $('log').replaceChildren(Object.assign(document.createElement('li'), { textContent: 'Nothing yet', className: 'muted' }));
  if (atBottom) $('log').scrollTop = $('log').scrollHeight;
}

function fighterState(f) {
  if (f.out) return '💀 out';
  const parts = [];
  if (f.chasing) parts.push(`⚔️ chasing ${f.chasing}`);
  if (f.parrying.length) parts.push(`🛡️ vs ${f.parrying.join(', ')}`);
  return parts.join(' · ');
}

// The dev buttons only change with the phase, so they're rebuilt then (not every snapshot, which would eat clicks).
function renderDev(phase) {
  if (phase === devPhase) return;
  devPhase = phase;
  $('dev').replaceChildren(...(DEV[phase] ?? []).map(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'secondary';
    b.append(Object.assign(document.createElement('kbd'), { textContent: key }), label);
    b.addEventListener('click', () => send(key));
    return b;
  }));
}

// ---- DOM helpers (names come from chat, so always set as text) ----

const button = (command) => document.querySelector(`[data-command="${command}"]`);

function cell(text, className = '') {
  return Object.assign(document.createElement('td'), { textContent: text, className });
}

// A player's name, tagged if they're a CPU.
function nameCell(name) {
  const td = cell(name, 'name');
  if (cpus[name]) td.append(span(`🤖 ${cpus[name]}`, 'cpu'));
  return td;
}

function span(text, className) {
  return Object.assign(document.createElement('span'), { textContent: text, className });
}

function row(cells) {
  const tr = document.createElement('tr');
  tr.append(...cells);
  return tr;
}
