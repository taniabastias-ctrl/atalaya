// Respaldo en caliente de Atalaya: copia consistente de la base (VACUUM INTO) y de los archivos subidos.
//   node scripts/respaldar.mjs [carpeta]        (por defecto <carpeta de la base>/respaldos)
// En Docker:  docker compose exec atalaya node scripts/respaldar.mjs
// Conserva los últimos RESPALDOS_A_CONSERVAR (por defecto 14).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rutaDB = path.resolve(process.env.DB_PATH || path.join(RAIZ, 'datos', 'atalaya.db'));
const archivos = path.resolve(process.env.FILES_PATH || path.join(path.dirname(rutaDB), 'archivos'));
const carpeta = path.resolve(process.argv[2] || path.join(path.dirname(rutaDB), 'respaldos'));
const conservar = Number(process.env.RESPALDOS_A_CONSERVAR || 14);

const marca = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const dir = path.join(carpeta, `atalaya-${marca}`);
mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(rutaDB);
db.exec(`VACUUM INTO '${path.join(dir, 'atalaya.db').replace(/'/g, "''")}'`);
db.close();
if (existsSync(archivos)) cpSync(archivos, path.join(dir, 'archivos'), { recursive: true });
console.log(`Respaldo creado: ${dir} (base ${(statSync(path.join(dir, 'atalaya.db')).size / 1024).toFixed(0)} KB)`);

const todos = readdirSync(carpeta).filter((n) => n.startsWith('atalaya-')).sort();
for (const viejo of todos.slice(0, Math.max(0, todos.length - conservar))) {
  rmSync(path.join(carpeta, viejo), { recursive: true, force: true });
  console.log(`Eliminado respaldo antiguo: ${viejo}`);
}
