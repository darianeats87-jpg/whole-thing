// Vendor browser-side assets locally so Projection Studios serves the Scramjet UI
// and client files from its own origin. The Wisp WebSocket transport remains on the
// separately deployed compatible Scramjet backend.
import { mkdirSync, copyFileSync, cpSync, existsSync } from 'node:fs';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { libcurlPath } from '@mercuryworkshop/libcurl-transport';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
}
const hls = 'node_modules/hls.js/dist/hls.min.js';
if (!existsSync(hls)) {
  console.error('Missing ' + hls + '. Run npm install first.');
  process.exit(1);
}
mkdirSync('public/vendor', { recursive: true });
copyFileSync(hls, 'public/vendor/hls.min.js');
copyTree(scramjetPath, 'public/scram');
copyTree(libcurlPath, 'public/libcurl');
copyTree(baremuxPath, 'public/baremux');
console.log('[vendor] copied HLS and Scramjet client assets into public/');
