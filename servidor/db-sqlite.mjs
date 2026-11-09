// Base de datos SQLite (incluida en Node 22.5+, sin dependencias) con una interfaz mínima para la API:
//   db.prepare(sql).bind(...).first() / .all() -> { results } / .run() -> { meta: { changes } }
import { DatabaseSync } from 'node:sqlite';

export function crearDB(ruta) {
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  const norm = (v) => (typeof v === 'boolean' ? Number(v) : v === undefined ? null : v);
  const plain = (row) => (row ? { ...row } : null);
  const stmt = (sql, vals) => ({
    bind: (...v) => stmt(sql, v),
    async first() { return plain(db.prepare(sql).get(...vals.map(norm))); },
    async all() { return { results: db.prepare(sql).all(...vals.map(norm)).map(plain), success: true }; },
    async run() { const r = db.prepare(sql).run(...vals.map(norm)); return { success: true, results: [], meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql, []), close: () => db.close() };
}
