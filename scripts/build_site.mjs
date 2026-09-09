#!/usr/bin/env node
// Build de producción del sitio estático (el que corre Vercel).
//
//   node scripts/build_site.mjs            -> dist-site/
//   node scripts/build_site.mjs --outdir X
//
// Qué cambia respecto de abrir index.html directo:
//
//   1. El JSX se transpila acá. En producción el navegador ya no descarga
//      @babel/standalone (~1,5 MB) ni transpila 8 archivos en cada carga.
//   2. React viaja en su build de producción y desde el mismo dominio, no
//      desde unpkg: sin CDN de terceros no hay integrity que recalcular ni
//      un tercero del que dependa que la liga se vea.
//   3. Cada .js/.css sale bajo /static/ con el hash de su contenido en el
//      nombre, así vercel.json puede darles cache inmutable y aun así el
//      commit de datos del bot se ve al instante: el HTML, que no lleva hash,
//      se revalida siempre y apunta a los nombres nuevos.
//
// El sitio servido queda sólo con lo que el navegador pide: nada de scripts,
// tests, paipus crudos ni planillas.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ROOT, RUNTIME_FILES, loadBabel, transpileJsx, vendorFile } from './build-vendor.mjs';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUTDIR = path.resolve(ROOT, arg('--outdir', 'dist-site'));

// Entradas del sitio. El nombre de salida se mantiene igual al de la fuente
// para no romper enlaces ya compartidos.
const ENTRIES = ['index.html'];

// Directorios que se copian tal cual, en la raíz de la salida.
const COPY_DIRS = ['assets'];

// Subdirectorio de los artefactos con hash.
const STATIC = 'static';

const Babel = loadBabel();

const abs = (rel) => path.join(ROOT, rel);
const stripQuery = (src) => src.split('?')[0];
const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(path.join(OUTDIR, STATIC), { recursive: true });

// ---------------------------------------------------------------- artefactos

// Cada contenido se escribe una sola vez: styles.css y los .jsx compartidos
// entre escritorio y móvil no se duplican en el deploy.
const emitted = new Map(); // sha del contenido -> nombre de archivo emitido
const manifest = [];

// Devuelve la ruta con la que el HTML referencia el artefacto. Absoluta: los
// artefactos viven en /static/ y las entradas en la raíz.
function emit(name, ext, content) {
  const key = hash8(content);
  const cached = emitted.get(key);
  if (cached) return cached;
  const file = `${STATIC}/${name}.${key}${ext}`;
  fs.writeFileSync(path.join(OUTDIR, file), content);
  emitted.set(key, `/${file}`);
  manifest.push(file);
  return `/${file}`;
}

// El CSS vive ahora un nivel más abajo que su fuente: url('assets/logo.png')
// se vuelve absoluta para que siga resolviendo. Sólo se reescribe lo que
// apunta a un archivo real del repo: dentro de un data:image/svg+xml hay
// url(%23n) apuntando a un filtro del propio SVG, y tocarlo lo rompe.
const absolutizeCssUrls = (css) =>
  css.replace(/url\((['"]?)((?!data:|https?:|\/)[^'")]+)\1\)/g, (whole, q, url) =>
    (fs.existsSync(abs(stripQuery(url))) ? `url('/${url}')` : whole));

function emitLocalFile(rel) {
  const src = abs(rel);
  if (!fs.existsSync(src)) return null;
  const base = path.basename(rel, path.extname(rel));
  const ext = path.extname(rel);
  const raw = fs.readFileSync(src, 'utf8');
  if (rel.endsWith('.jsx')) return emit(base, '.js', `/* ${rel} (jsx→js) */\n${transpileJsx(Babel, raw, rel)}`);
  if (ext === '.css') return emit(base, ext, absolutizeCssUrls(raw));
  return emit(base, ext, raw);
}

// React y ReactDOM de producción, concatenados y servidos desde el propio
// dominio en vez de unpkg.
const vendorFileName = emit(
  'vendor',
  '.js',
  RUNTIME_FILES.map((rel) => fs.readFileSync(vendorFile(rel), 'utf8')).join('\n;\n'),
);

// ------------------------------------------------------------------- entradas

const commit = (process.env.VERCEL_GIT_COMMIT_SHA || (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { return 'sin commit'; }
})()).slice(0, 7);

function buildEntry(entry) {
  let html = fs.readFileSync(abs(entry), 'utf8');
  const used = [];

  // 1. Fuera el CDN: react, react-dom y babel salen del <head>, y en el lugar
  //    del primero entra el runtime local ya en build de producción.
  let vendorPlaced = false;
  html = html.replace(/[ \t]*<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*><\/script>\n?/gi, (whole, src) => {
    if (!/react|babel/i.test(src)) return whole;
    if (vendorPlaced) return '';
    vendorPlaced = true;
    return `  <script src="${vendorFileName}"></script>\n`;
  });
  if (!vendorPlaced) throw new Error(`${entry}: no se encontró el runtime de React en el HTML`);

  // 2. Hojas de estilo locales (las de Google Fonts se dejan como están).
  html = html.replace(/<link\b([^>]*\brel=["']stylesheet["'][^>]*)>/gi, (whole, attrs) => {
    const href = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (!href || /^https?:/i.test(href)) return whole;
    const rel = stripQuery(href);
    const file = emitLocalFile(rel);
    if (!file) throw new Error(`${entry}: falta la hoja de estilo ${rel}`);
    used.push(rel);
    return whole.replace(href, file);
  });

  // 3. Scripts locales, en el mismo orden que declara el HTML. type="text/babel"
  //    desaparece: lo que se sirve ya es JavaScript.
  html = html.replace(/[ \t]*<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>\n?/gi, (whole, pre, src, post) => {
    // El runtime local ya quedó puesto en el paso 1; no es un fuente del repo.
    if (/^https?:/i.test(src) || src === vendorFileName) return whole;
    const rel = stripQuery(src);
    const file = emitLocalFile(rel);
    if (!file) {
      // Los datos publicados deben venir del pipeline de sincronización.
      console.warn(`  ! ${rel} no existe, se omite`);
      return '';
    }
    used.push(rel);
    const attrs = `${pre}${post}`.replace(/\btype=["']text\/babel["']/gi, '').replace(/\s+/g, ' ').trim();
    return `  <script src="${file}"${attrs ? ` ${attrs}` : ''}></script>\n`;
  });

  // 4. Rutas a los directorios copiados: absolutas, para que no dependan de en
  // qué ruta esté servida la entrada.
  html = html.replace(new RegExp(`(src|href)=(["'])(${COPY_DIRS.join('|')})/`, 'gi'), '$1=$2/$3/');

  html = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n  <!-- build: ${entry} · ${commit} · ${new Date().toISOString()} -->`);

  fs.writeFileSync(path.join(OUTDIR, entry), html);
  return used;
}

// --------------------------------------------------------------------- correr

for (const dir of COPY_DIRS) {
  if (fs.existsSync(abs(dir))) fs.cpSync(abs(dir), path.join(OUTDIR, dir), { recursive: true });
}

const kb = (p) => `${Math.round(fs.statSync(p).size / 1024)} KB`;

for (const entry of ENTRIES) {
  const used = buildEntry(entry);
  console.log(`· ${entry} (${kb(path.join(OUTDIR, entry))}) ← ${used.length} archivos locales`);
}

const total = manifest.reduce((n, f) => n + fs.statSync(path.join(OUTDIR, f)).size, 0);
console.log(`· ${manifest.length} artefactos con hash, ${Math.round(total / 1024)} KB en total`);
console.log(`· salida: ${path.relative(ROOT, OUTDIR)}/`);
