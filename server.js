// Minimal stub game server: node server.js, then watch messages and reactions print as they arrive.
const http = require('http');

const handlers = {
  '/messages': (msg) => console.log(`${msg.receivedAt}  ${msg.sender ?? msg.userId}: ${msg.text}`),
  '/reactions': (evt) => console.log(`${evt.receivedAt}  ${evt.sender ?? evt.participantId} reacted ${evt.emoji}`),
};

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const handler = handlers[req.url];
  if (req.method === 'POST' && handler) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      handler(JSON.parse(body));
      res.end('ok');
    });
  } else { res.statusCode = 404; res.end(); }
}).listen(8787, () => console.log('Game stub listening on http://localhost:8787'));
