// Game server: `npm start`, then open http://localhost:8787 and share that tab in Meet.
// The host runs the game from http://localhost:8787/control in another tab.
//
//   extension --POST /messages, /reactions--> server --SSE /events--> Phaser game (game/)
//
// The extension posts raw Meet events; the server normalizes them into game events and
// streams them to every open game page. No dependencies beyond Node itself.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');
const STATIC = {
  '/': path.join(ROOT, 'game'),
  '/vendor/': path.join(ROOT, 'node_modules', 'phaser', 'dist'),
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' };

// ---- Normalizing: every game event has { type, player: { id, name }, at, ... } ----
// Chat and reactions identify people differently (Chat user id vs. Meet participant id),
// so the display name is the only key the two share. The game keys players by name for now.
const normalize = {
  '/messages': (m) => ({
    type: 'chat',
    id: m.id,
    player: { id: m.userId, name: m.sender ?? 'Unknown' },
    text: m.text,
    at: m.receivedAt,
  }),
  '/reactions': (r) => ({
    type: 'reaction',
    player: { id: r.participantId, name: r.sender ?? 'Unknown' },
    emoji: r.emoji,
    at: r.receivedAt,
  }),
};

// ---- Broadcasting to game pages over Server-Sent Events ----
const clients = new Set();

function broadcast(event) {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(frame);
}

function openStream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// Keep idle connections from timing out.
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---- Static files ----
function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = url.startsWith('/vendor/') ? '/vendor/' : '/';
  const base = STATIC[prefix];
  let file = path.join(base, url.slice(prefix.length) || 'index.html');
  if (!path.extname(file)) file += '.html';   // /control -> control.html
  if (!file.startsWith(base + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.end(data);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const toEvent = normalize[req.url];

  if (req.method === 'POST' && toEvent) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const event = toEvent(JSON.parse(body));
        console.log(`${event.at}  [${event.type}] ${event.player.name}: ${event.text ?? event.emoji}`);
        broadcast(event);
        res.end('ok');
      } catch (err) {
        res.statusCode = 400;
        res.end(err.message);
      }
    });
  } else if (req.method === 'GET' && req.url === '/events') {
    openStream(req, res);
  } else if (req.method === 'GET') {
    serveStatic(req, res);
  } else {
    res.statusCode = 404;
    res.end();
  }
}).listen(PORT, () => console.log(`Game server on http://localhost:${PORT}`));
