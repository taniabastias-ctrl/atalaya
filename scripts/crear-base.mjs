// Crea la base de datos de Atalaya (SQLite) desde servidor/schema.sql y, opcionalmente,
// carga los datos exportados desde Cloudflare y copia los archivos subidos.
//
//   node scripts/crear-base.mjs                                   # base nueva y vacía
//   node scripts/crear-base.mjs --datos instalacion/datos/atalaya-datos.sql --archivos instalacion/datos/archivos
//   node scripts/crear-base.mjs --db /data/atalaya.db --datos /importar/atalaya-datos.sql --archivos /importar/archivos --reemplazar
//
// Opciones:
//   --db <ruta>         archivo de la base (por defecto DB_PATH o ./datos/atalaya.db)
//   --datos <sql>       INSERTs exportados con scripts/exportar-desde-cloudflare.mjs
//   --archivos <dir>    carpeta con los archivos exportados (licitaciones/<código>/<id>)
//   --destino-archivos  carpeta donde quedan los archivos (por defecto FILES_PATH o <carpeta de la base>/archivos)
//   --reemplazar        si la base ya tiene datos, los borra y carga los exportados
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, cpSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (n) => process.argv.includes(n);

const rutaDB = path.resolve(arg('--db') || process.env.DB_PATH || path.join(RAIZ, 'datos', 'atalaya.db'));
const rutaDatos = arg('--datos');
const origenArchivos = arg('--archivos');
const destinoArchivos = path.resolve(arg('--destino-archivos') || process.env.FILES_PATH || path.join(path.dirname(rutaDB), 'archivos'));

const fallar = (m) => { console.error('ERROR: ' + m); process.exit(1); };
if (rutaDatos && !existsSync(rutaDatos)) fallar(`no existe el archivo de datos ${rutaDatos}`);
if (origenArchivos && !existsSync(origenArchivos)) fallar(`no existe la carpeta de archivos ${origenArchivos}`);

mkdirSync(path.dirname(rutaDB), { recursive: true });
const nueva = !existsSync(rutaDB);
const db = new DatabaseSync(rutaDB);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

console.log(`${nueva ? 'Creando' : 'Actualizando'} la base ${rutaDB}`);
db.exec(readFileSync(path.join(RAIZ, 'servidor', 'schema.sql'), 'utf8'));   // CREATE ... IF NOT EXISTS: seguro de repetir

const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
const contar = () => Object.fromEntries(tablas.map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n]));

if (rutaDatos) {
  const conDatos = db.prepare('SELECT (SELECT COUNT(*) FROM licitaciones) + (SELECT COUNT(*) FROM usuarios) AS n').get().n > 0;
  if (conDatos && !flag('--reemplazar')) fallar('la base ya tiene datos. Use --reemplazar para borrarlos y cargar los exportados.');
  const sql = readFileSync(rutaDatos, 'utf8').replace(/^PRAGMA defer_foreign_keys\s*=\s*TRUE;\s*$/gim, '');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const t of tablas) db.exec(`DELETE FROM "${t}"`);   // incluye las palabras clave iniciales del esquema
    db.exec(sql);
    db.exec('DELETE FROM limites');                           // contadores de intentos: no se migran
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    fallar('no se pudieron cargar los datos: ' + e.message);
  }
  db.exec('PRAGMA foreign_keys = ON');
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) fallar(`los datos cargados tienen ${fk.length} referencias rotas: ${JSON.stringify(fk.slice(0, 5))}`);
  console.log('Datos cargados.');
}

const integridad = db.prepare('PRAGMA integrity_check').get();
if (Object.values(integridad)[0] !== 'ok') fallar('integridad de la base: ' + JSON.stringify(integridad));

if (origenArchivos) {
  mkdirSync(destinoArchivos, { recursive: true });
  cpSync(origenArchivos, destinoArchivos, { recursive: true, force: true });
  const faltan = db.prepare('SELECT clave_almacen FROM archivos').all().filter((r) => !existsSync(path.join(destinoArchivos, r.clave_almacen)));
  if (faltan.length) console.warn(`AVISO: ${faltan.length} archivos registrados no están en ${destinoArchivos} (p. ej. ${faltan[0].clave_almacen})`);
  console.log(`Archivos copiados a ${destinoArchivos}`);
} else {
  mkdirSync(destinoArchivos, { recursive: true });
}

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');   // deja todo en el archivo principal
const c = contar();
console.log('\nResumen de la base:');
for (const t of ['usuarios', 'reportes', 'organismos', 'licitaciones', 'licitacion_fechas', 'documentos_requeridos', 'documentos_listos', 'archivos', 'seguimiento', 'eventos', 'palabras_vigiladas', 'auditoria']) {
  console.log(`  ${t.padEnd(24)} ${c[t]}`);
}
const tamano = (statSync(rutaDB).size / 1024).toFixed(0);
console.log(`\nListo: ${rutaDB} (${tamano} KB). Integridad OK, sin referencias rotas.`);
db.close();
