// Exporta TODA la información de Atalaya que está hoy en Cloudflare (base D1 y archivos de R2)
// para cargarla en el servidor de Sermaluc con scripts/crear-base.mjs.
//
//   node scripts/exportar-desde-cloudflare.mjs [carpeta-salida]     (por defecto instalacion/datos)
//
// Requiere: haber iniciado sesión en wrangler con la cuenta de Cloudflare dueña de Atalaya.
// La salida contiene datos personales y hashes de contraseñas: trátela como confidencial.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D1 = 'atalaya-sermaluc';
const R2 = 'atalaya-sermaluc-archivos';
const salida = path.resolve(process.argv[2] || path.join(RAIZ, 'instalacion', 'datos'));
// wrangler se ejecuta con node directamente (sin shell): los argumentos con espacios llegan intactos
const WRANGLER = path.join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
if (!existsSync(WRANGLER)) { console.error('Falta wrangler: ejecute "npm install" en la carpeta de Atalaya.'); process.exit(1); }
const wrangler = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

mkdirSync(path.join(salida, 'archivos'), { recursive: true });

console.log('1/3 Exportando la base de datos (solo datos)…');
const sql = path.join(salida, 'atalaya-datos.sql');
wrangler(['d1', 'export', D1, '--remote', '--no-schema', '--output', sql]);
console.log(`    ${sql} (${(statSync(sql).size / 1024).toFixed(0)} KB)`);

console.log('2/3 Buscando archivos subidos…');
const salidaJson = wrangler(['d1', 'execute', D1, '--remote', '-y', '--json', '--command', 'SELECT clave_almacen, nombre, tamano FROM archivos']);
const res = JSON.parse(salidaJson.slice(salidaJson.indexOf('[')));
const archivos = res[0]?.results || [];
console.log(`    ${archivos.length} archivos registrados`);

console.log('3/3 Descargando archivos desde R2…');
let ok = 0;
for (const a of archivos) {
  const destino = path.join(salida, 'archivos', a.clave_almacen);
  mkdirSync(path.dirname(destino), { recursive: true });
  wrangler(['r2', 'object', 'get', `${R2}/${a.clave_almacen}`, '--remote', '--file', destino]);
  // metadatos que espera el almacén en disco del servidor propio
  writeFileSync(destino + '.meta.json', JSON.stringify({ httpMetadata: {}, customMetadata: { nombre: a.nombre } }));
  if (existsSync(destino)) ok++;
}
console.log(`    ${ok} de ${archivos.length} descargados en ${path.join(salida, 'archivos')}`);
console.log('\nListo. Copie la carpeta completa al servidor (por un canal seguro) y ejecute crear-base.mjs.');
