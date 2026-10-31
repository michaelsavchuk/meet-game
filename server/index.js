// Optional dev server: `npm start`, then open http://localhost:8787 and http://localhost:8787/control.
// The extension doesn't need it (it runs the game from its own pages, see game/extension/background.js);
// it's for developing without reloading the extension, and for the /play page.
//
//   /play or dev keys --POST /messages, /reactions--> server --SSE /events--> Phaser game (game/)
//
// Posts are raw Meet payloads; the server normalizes them into game events (game/src/events.js) and
// streams them to every open game page. No dependencies beyond Node itself.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { normalize } from '../game/src/events.js';

const PORT = process.env.PORT || 8787;
const DEV = process.argv.includes('--dev');   // `npm run dev`: turns on the game's dev keys and buttons (game/src/dev.js)
const ROOT = path.join(import.meta.dirname, '..', 'game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf' };
const ROUTES = { '/messages': normalize['chat-message'], '/reactions': normalize['meet-reaction'] };

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
  if (DEV && url === '/src/dev.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.end('export const DEV_EVENTS = true;\n');
  }
  let file = path.join(ROOT, url.slice(1) || 'index.html');
  if (!path.extname(file)) file += '.html';   // /control -> control.html
  if (!file.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.end(data);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const toEvent = ROUTES[req.url];

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
}).listen(PORT, () => console.log(`Game server on http://localhost:${PORT}${DEV ? ' (dev keys on)' : ''}`));
