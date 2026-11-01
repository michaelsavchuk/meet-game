// `npm run trailer`: waits for recordings from the trailer page (/trailer under the dev server) and turns each into
// dist/trailer.mp4, small enough to upload to the README, keeping the full-quality take as dist/trailer.webm. Click Record on
// the page while this runs; it posts the take here when it's done. Needs ffmpeg on the PATH.
// `npm run trailer -- some.webm` converts a recording saved earlier (the page downloads it if this isn't running).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = 8788;   // trailer.js (the page) posts here
const ROOT = path.join(import.meta.dirname, '..');
const TAKE = path.join(ROOT, 'dist', 'trailer.webm');
const OUTPUT = path.join(ROOT, 'dist', 'trailer.mp4');
// The captions (src/trailer.js CAPTION: the banner's 1.5 × 1280 bar at 0.6 scale) end about 65 px in from each side;
// cropping a little past that makes them run off the edges like the full-size banners.
const CROP = { x: 72, width: 1136 };

// The recording has a variable frame rate; fps=30 evens it out. CROP keeps the full height. H.264 + yuv420p plays everywhere, and faststart lets
// GitHub's player start before the whole file arrives.
function convert(input) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', input,
    '-vf', `fps=30,crop=${CROP.width}:ih:${CROP.x}:0`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    OUTPUT,
  ], { stdio: 'inherit' });
  const size = fs.statSync(OUTPUT).size;
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${(size / 1e6).toFixed(2)} MB)`);
  return size;
}

if (process.argv[2]) {
  convert(process.argv[2]);
} else {
  http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method !== 'POST') { res.end(); return; }   // and the CORS preflight
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    fs.mkdirSync(path.dirname(TAKE), { recursive: true });
    fs.writeFileSync(TAKE, Buffer.concat(chunks));
    console.log(`Got a take: ${path.relative(ROOT, TAKE)}`);
    try {
      const size = convert(TAKE);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ file: path.relative(ROOT, OUTPUT), size }));
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  }).listen(PORT, () => console.log(`Waiting for takes from the trailer page (http://localhost:8787/trailer), port ${PORT}`));
}
