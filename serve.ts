// Local dev server for NIGHTSHIFT. Serves this directory on port 8080 so a
// desktop browser can open http://localhost:8080 and play the game offline.
// Node 22, standard library only.
//
//   node serve.ts
//   open http://localhost:8080

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8080;
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/game/index.html' : req.url.split('?')[0];
  const file = join(here, decodeURIComponent(path));
  if (!existsSync(file) || !file.startsWith(here)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`NIGHTSHIFT dev server: http://localhost:${PORT}`);
});
