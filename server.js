// Minimal stub game server: node server.js, then watch messages print as they arrive.
const http = require('http');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'POST' && req.url === '/messages') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const msg = JSON.parse(body);
      console.log(`${msg.receivedAt}  ${msg.sender ?? msg.userId}: ${msg.text}`);
      res.end('ok');
    });
  } else { res.statusCode = 404; res.end(); }
}).listen(8787, () => console.log('Game stub listening on http://localhost:8787'));
