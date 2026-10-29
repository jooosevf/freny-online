// Runs the /api functions locally without the Vercel CLI, for testing with the Unity editor:
//   SCORE_KEY=... node tools/api-server.js        (or put SCORE_KEY in .env.local)
// then "apiUrl": "http://localhost:3000" in the game's Assets/Resources/FirebaseConfig.json.
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 3000);
const ROUTES = {
  '/api/run/start': '../api/run/start.js',
  '/api/run/finish': '../api/run/finish.js',
};

if (!process.env.SCORE_KEY && fs.existsSync(new URL('../.env.local', import.meta.url))) {
  for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (!ROUTES[path]) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request('http://localhost' + req.url, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  try {
    const { default: handler } = await import(ROUTES[path]);
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    console.log(`${req.method} ${path} -> ${response.status}`);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end();
  }
}).listen(PORT, () => console.log(`API on http://localhost:${PORT} (SCORE_KEY ${process.env.SCORE_KEY ? 'set' : 'MISSING'})`));
