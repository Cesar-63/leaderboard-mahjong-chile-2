#!/usr/bin/env node
// Empaqueta el sitio estático en un único HTML autocontenido, para previsualizar
// una rama sin desplegar nada. Inlinea CSS, datos, React y el JSX ya transpilado
// (no queda ninguna dependencia de CDN ni de rutas relativas).
//
//   node scripts/build_preview.mjs                  -> dist/preview.html (escritorio)
//   node scripts/build_preview.mjs --entry Mobile.html --name mobile
//
// Emite dos archivos por corrida:
//   dist/<name>.html           documento completo, para abrir con file:// o http.server
//   dist/<name>.artifact.html  mismo contenido sin <html>/<head>/<body>, para Artifacts
//
// Las dependencias (react, react-dom, @babel/standalone) se instalan solas en
// .vendor/ la primera vez. .vendor/ y dist/ no se versionan.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, '.vendor');
const DEPS = ['react@18.3.1', 'react-dom@18.3.1', '@babel/standalone@7.29.0'];

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ENTRY = arg('--entry', 'index.html');
const NAME = arg('--name', ENTRY === 'index.html' ? 'preview' : path.basename(ENTRY, '.html').toLowerCase());
const OUTDIR = path.join(ROOT, arg('--outdir', 'dist'));

// Los builds UMD viven fuera de los "exports" de cada paquete, así que se
// resuelven por ruta y no con require.resolve().
const vendorFile = (rel) => path.join(VENDOR, 'node_modules', rel);
const RUNTIME_FILES = [
  'react/umd/react.production.min.js',
  'react-dom/umd/react-dom.production.min.js',
];
const BABEL_FILE = '@babel/standalone/babel.min.js';

function ensureVendor() {
  const missing = [...RUNTIME_FILES, BABEL_FILE].some((rel) => !fs.existsSync(vendorFile(rel)));
  if (!missing) return;
  console.log('· instalando dependencias de build en .vendor/ (una sola vez)…');
  fs.mkdirSync(VENDOR, { recursive: true });
  const pkg = path.join(VENDOR, 'package.json');
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: 'preview-vendor', private: true }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...DEPS], { cwd: VENDOR, stdio: 'inherit' });
}

ensureVendor();
const Babel = createRequire(import.meta.url)(vendorFile(BABEL_FILE));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripQuery = (src) => src.split('?')[0];

// Un archivo inlineado no puede contener la secuencia que cierra su propio
// <script>; el escape mantiene el JS válido.
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');

function dataUri(rel) {
  const ext = path.extname(rel).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(path.join(ROOT, rel)).toString('base64')}`;
}

// url('assets/x.png') -> url('data:image/png;base64,…')
function inlineCssAssets(css) {
  return css.replace(/url\((['"]?)((?!data:|https?:)[^'")]+)\1\)/g, (whole, q, url) => {
    const rel = stripQuery(url);
    if (!fs.existsSync(path.join(ROOT, rel))) return whole;
    return `url('${dataUri(rel)}')`;
  });
}

const html = read(ENTRY);

const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [, 'Liga Mahjong Chile'])[1].trim();
const fonts = [...html.matchAll(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi)].map((m) => m[0]).join('\n');

// CSS local, en el orden en que lo declara el HTML.
const styles = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
  .map((m) => stripQuery(m[1]))
  .filter((href) => !/^https?:/i.test(href))
  .map((href) => `/* ${href} */\n${inlineCssAssets(read(href))}`)
  .join('\n\n');

// Runtime de React desde .vendor, en vez del CDN que usa el sitio en producción.
const runtime = RUNTIME_FILES.map((rel) => fs.readFileSync(vendorFile(rel), 'utf8')).join('\n;\n');

// El sitio lee localStorage sin guardas; en un visor sandboxed el acceso puede
// lanzar y dejar la página en blanco. Este shim degrada a memoria.
const shim = `(function () {
  try { window.localStorage.getItem('probe'); } catch (e) {
    var mem = {};
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
    } });
  }
})();`;

// Scripts locales en orden: los .jsx se transpilan acá, así el bundle no
// necesita Babel en el navegador.
const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi)]
  .map((m) => ({ attrs: m[1] + m[3], src: stripQuery(m[2]) }))
  .filter((s) => !/^https?:/i.test(s.src))
  .map(({ attrs, src }) => {
    const code = read(src);
    if (/text\/babel/i.test(attrs) || src.endsWith('.jsx')) {
      const out = Babel.transform(code, { presets: [['react', { runtime: 'classic' }]], filename: src }).code;
      return `/* ${src} (jsx→js) */\n${out}`;
    }
    return `/* ${src} */\n${code}`;
  })
  .join('\n;\n');

let branch = 'desconocida';
let commit = 'sin commit';
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim();
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
} catch { /* fuera de un repo git: el sello queda genérico */ }
const dirty = (() => {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim() !== ''; } catch { return false; }
})();
const stamp = `${ENTRY} · ${branch}@${commit}${dirty ? '+cambios sin commitear' : ''} · ${new Date().toISOString()}`;

const head = `<title>${title}</title>
${fonts}
<style>
${styles}
</style>`;

const body = `<div id="root"></div>
<script>${safe(shim)}</script>
<script>${safe(runtime)}</script>
<script>${safe(scripts)}</script>`;

fs.mkdirSync(OUTDIR, { recursive: true });

const full = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<!-- build: ${stamp} -->
<link rel="icon" type="image/png" href="${dataUri('assets/logo.png')}" />
${head}
</head>
<body>
${body}
</body>
</html>
`;

// Artifacts envuelve el archivo en su propio <html>/<head>/<body>.
const fragment = `<!-- build: ${stamp} -->
${head}
${body}
`;

const outFull = path.join(OUTDIR, `${NAME}.html`);
const outFrag = path.join(OUTDIR, `${NAME}.artifact.html`);
fs.writeFileSync(outFull, full);
fs.writeFileSync(outFrag, fragment);

const kb = (p) => `${Math.round(fs.statSync(p).size / 1024)} KB`;
console.log(`· ${path.relative(ROOT, outFull)} (${kb(outFull)})`);
console.log(`· ${path.relative(ROOT, outFrag)} (${kb(outFrag)})`);
console.log(`· ${stamp}`);
