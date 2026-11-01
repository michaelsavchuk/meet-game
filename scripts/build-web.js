// `npm run build:web`: the solo page as a static site in dist/web (deploy that folder to Netlify or any static host).
// It copies all of game/ except the extension's own files, so new game files are included without touching this.
// The solo page becomes index.html and the game page moves to game.html.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const GAME = path.join(ROOT, 'game');
const OUT = path.join(ROOT, 'dist', 'web');
// Relative to game/: the extension's own files, and the trailer page (dev only).
const SKIP = new Set(['extension', 'manifest.json', 'icons', 'trailer.html', path.join('src', 'trailer.js')]);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(GAME, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(GAME, src);
    return !SKIP.has(rel) && !path.basename(src).startsWith('.');
  },
});

fs.renameSync(path.join(OUT, 'index.html'), path.join(OUT, 'game.html'));
const solo = fs.readFileSync(path.join(OUT, 'solo.html'), 'utf8');
const GAME_SRC = 'src="/index.html?local"';
if (!solo.includes(GAME_SRC)) throw new Error(`solo.html no longer has ${GAME_SRC}; update scripts/build-web.js`);
fs.writeFileSync(path.join(OUT, 'index.html'), solo.replace(GAME_SRC, 'src="/game.html?local"'));
fs.rmSync(path.join(OUT, 'solo.html'));

console.log(`Built ${path.relative(ROOT, OUT)}/ (open index.html through any static server)`);
