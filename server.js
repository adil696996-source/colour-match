const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const rooms = new Map(); // code -> Map(id -> {presence, res})
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

function clean(p) {
  const o = {};
  if (typeof p.name === 'string') o.name = p.name.slice(0, 14);
  for (const k of ['joinedAt', 'gid', 'r', 'total']) if (Number.isFinite(p[k])) o[k] = p[k];
  if (typeof p.done === 'boolean') o.done = p.done;
  return o;
}
function broadcast(code) {
  const room = rooms.get(code); if (!room) return;
  const list = [...room].map(([id, c]) => ({ id, presence: c.presence }));
  const msg = 'data: ' + JSON.stringify(list) + '\n\n';
  for (const c of room.values()) c.res.write(msg);
}
const okCode = (c) => /^[A-Z]{4}$/.test(c || '');
const okId = (i) => /^[a-z0-9]{4,16}$/.test(i || '');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    const code = url.searchParams.get('room'), id = url.searchParams.get('id');
    if (!okCode(code) || !okId(id)) { res.writeHead(400); return res.end(); }
    if (!rooms.has(code)) rooms.set(code, new Map());
    const room = rooms.get(code);
    if (room.size >= 12 && !room.has(id)) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    room.set(id, { presence: room.has(id) ? room.get(id).presence : {}, res });
    broadcast(code);
    const ka = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ka);
      const r = rooms.get(code);
      if (r && r.get(id) && r.get(id).res === res) { r.delete(id); if (r.size === 0) rooms.delete(code); else broadcast(code); }
    });
    return;
  }
  if (url.pathname === '/presence' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      try {
        const { room, id, presence } = JSON.parse(body);
        const c = rooms.get(room) && rooms.get(room).get(id);
        if (c && presence && typeof presence === 'object') { Object.assign(c.presence, clean(presence)); broadcast(room); }
      } catch (e) {}
      res.writeHead(204); res.end();
    });
    return;
  }
  if (url.pathname !== '/' && url.pathname !== '/index.html') { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Missing index.html'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Colour Match running on port ' + PORT));
