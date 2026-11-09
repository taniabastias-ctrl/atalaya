// Almacén de archivos en disco con la misma interfaz mínima que Cloudflare R2 (put / get / delete),
// para correr Atalaya en un servidor propio. Las claves las genera la API (licitaciones/<código>/<uuid>).
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

export function crearAlmacen(raiz) {
  const ruta = (clave) => {
    const p = path.resolve(raiz, clave);
    if (!p.startsWith(path.resolve(raiz) + path.sep)) throw new Error('Clave de archivo inválida');
    return p;
  };
  return {
    async put(clave, datos, opciones = {}) {
      const p = ruta(clave);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, Buffer.from(datos));
      await writeFile(p + '.meta.json', JSON.stringify(opciones));
    },
    async get(clave) {
      const p = ruta(clave);
      try {
        const body = await readFile(p);
        const meta = JSON.parse(await readFile(p + '.meta.json', 'utf8').catch(() => '{}'));
        return { body, httpMetadata: meta.httpMetadata || {}, customMetadata: meta.customMetadata || {} };
      } catch {
        return null;
      }
    },
    async delete(clave) {
      const p = ruta(clave);
      await rm(p, { force: true });
      await rm(p + '.meta.json', { force: true });
    },
  };
}
