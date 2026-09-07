// Dependencias de build compartidas por build_preview.mjs y build_site.mjs.
//
// Se instalan solas en .vendor/ la primera vez (no hay package.json en la raíz
// del repo a propósito: el sitio no tiene toolchain de npm). Las versiones van
// fijas acá para que el bundle no cambie por debajo entre corridas.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VENDOR = path.join(ROOT, '.vendor');
const DEPS = ['react@18.3.1', 'react-dom@18.3.1', '@babel/standalone@7.29.0'];

// Los builds UMD viven fuera de los "exports" de cada paquete, así que se
// resuelven por ruta y no con require.resolve().
export const vendorFile = (rel) => path.join(VENDOR, 'node_modules', rel);

export const RUNTIME_FILES = [
  'react/umd/react.production.min.js',
  'react-dom/umd/react-dom.production.min.js',
];

export const BABEL_FILE = '@babel/standalone/babel.min.js';

export function ensureVendor() {
  const missing = [...RUNTIME_FILES, BABEL_FILE].some((rel) => !fs.existsSync(vendorFile(rel)));
  if (!missing) return;
  console.log('· instalando dependencias de build en .vendor/ (una sola vez)…');
  fs.mkdirSync(VENDOR, { recursive: true });
  const pkg = path.join(VENDOR, 'package.json');
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: 'preview-vendor', private: true }, null, 2));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...DEPS], { cwd: VENDOR, stdio: 'inherit' });
}

// Babel sólo se puede cargar después de instalar; por eso es una función y no
// un import de módulo.
export function loadBabel() {
  ensureVendor();
  return createRequire(import.meta.url)(vendorFile(BABEL_FILE));
}

// El JSX del sitio se escribe contra el runtime clásico (React.createElement),
// que es el que exponen los UMD.
export function transpileJsx(Babel, code, filename) {
  return Babel.transform(code, { presets: [['react', { runtime: 'classic' }]], filename }).code;
}
