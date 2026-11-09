// Genera instalacion/.env con secretos nuevos y aleatorios a partir de instalacion/.env.example.
//   node scripts/generar-secretos.mjs atalaya.sermaluc.cl
// No sobrescribe un .env existente. Muestra el AGENT_TOKEN una sola vez para configurar el agente.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destino = path.join(RAIZ, 'instalacion', '.env');
const dominio = process.argv[2];
if (!dominio) { console.error('Uso: node scripts/generar-secretos.mjs <dominio>   (p. ej. atalaya.sermaluc.cl)'); process.exit(1); }
if (existsSync(destino)) { console.error(`Ya existe ${destino}; no se sobrescribe.`); process.exit(1); }

const sesion = randomBytes(32).toString('hex');
const agente = randomBytes(32).toString('hex');
const env = readFileSync(path.join(RAIZ, 'instalacion', '.env.example'), 'utf8')
  .replace(/^DOMINIO=.*$/m, `DOMINIO=${dominio}`)
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${sesion}`)
  .replace(/^AGENT_TOKEN=.*$/m, `AGENT_TOKEN=${agente}`);
writeFileSync(destino, env, { mode: 0o600 });
console.log(`Creado ${destino} con secretos nuevos.`);
console.log('Use este valor como ATALAYA_TOKEN del agente (instalacion/agente.env o el secreto de GitHub):');
console.log(agente);
