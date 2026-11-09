// Carga el reporte diario del agente en Atalaya.
//   ATALAYA_URL=https://atalaya.sermaluc.cl AGENT_TOKEN=xxxx node scripts/enviar-reporte.mjs reporte.json
// El archivo JSON debe tener { "meta": {...}, "licitaciones": [...] } (formato en README.md).
import { readFileSync } from 'node:fs';

const archivo = process.argv[2];
const url = (process.env.ATALAYA_URL || 'http://localhost:8080').replace(/\/$/, '');
const token = process.env.AGENT_TOKEN;
if (!archivo || !token) {
  console.error('Uso: AGENT_TOKEN=... [ATALAYA_URL=...] node scripts/enviar-reporte.mjs reporte.json');
  process.exit(1);
}
const body = readFileSync(archivo, 'utf8');
JSON.parse(body); // falla aquí si el archivo no es JSON válido

const r = await fetch(`${url}/api/reporte`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body,
});
const res = await r.json().catch(() => ({}));
if (!r.ok) {
  console.error(`Error ${r.status}: ${res.error || 'sin detalle'}`);
  process.exit(1);
}
console.log(`Reporte cargado: ${res.recibidas} licitaciones, ${res.nuevas} nuevas.`);
