const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const LOG_FILE = path.join(__dirname, '..', 'debug.log');
const MAX_LINES = 10000;

// Ensure log file exists
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '');
}

function trimLogFile() {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) {
      const trimmed = lines.slice(lines.length - MAX_LINES);
      fs.writeFileSync(LOG_FILE, trimmed.join('\n') + '\n');
    }
  } catch { /* ignore */ }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // POST /log — append log entry
  if (url.pathname === '/log' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const entry = JSON.parse(body);
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(LOG_FILE, line);
      trimLogFile();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /log/batch — append multiple log entries
  if (url.pathname === '/log/batch' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const entries = JSON.parse(body);
      if (!Array.isArray(entries)) throw new Error('Expected array');
      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(LOG_FILE, lines);
      trimLogFile();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`{"ok":true,"count":${entries.length}}`);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /log/clear — truncate log file
  if (url.pathname === '/log/clear' && req.method === 'POST') {
    fs.writeFileSync(LOG_FILE, '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // GET /log/tail?lines=100 — return last N lines
  if (url.pathname === '/log/tail' && req.method === 'GET') {
    const n = parseInt(url.searchParams.get('lines') || '100', 10);
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const tail = lines.slice(-n);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tail.map((l) => { try { return JSON.parse(l); } catch { return l; } })));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[DebugServer] Port ${PORT} is already in use. Try killing the process on that port or use a different port.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`[DebugServer] Listening on http://localhost:${PORT} — writing to debug.log`);
});
