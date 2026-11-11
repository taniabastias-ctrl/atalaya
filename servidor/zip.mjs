// Creación de archivos ZIP sin dependencias (método "store": sin recomprimir, ideal para PDF, Office e imágenes,
// que ya vienen comprimidos). Funciona igual en Cloudflare Workers y en Node.
//   const bytes = crearZip([{ nombre: 'carpeta/archivo.pdf', datos: Uint8Array, fecha: Date }]);

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(datos) {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fecha y hora en formato MS-DOS (la que muestran Windows y macOS al abrir el ZIP)
function fechaDos(f = new Date()) {
  const a = Math.max(1980, f.getFullYear());
  return {
    hora: (f.getHours() << 11) | (f.getMinutes() << 5) | (f.getSeconds() >> 1),
    dia: ((a - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate(),
  };
}

export function crearZip(entradas) {
  const enc = new TextEncoder();
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;
  for (const e of entradas) {
    const nombre = enc.encode(e.nombre);
    const datos = e.datos instanceof Uint8Array ? e.datos : new Uint8Array(e.datos);
    const crc = crc32(datos);
    const { hora, dia } = fechaDos(e.fecha);
    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);   // firma de cabecera local
    v.setUint16(4, 20, true);           // versión necesaria
    v.setUint16(6, 0x0800, true);       // nombres en UTF-8 (tildes y ñ)
    v.setUint16(8, 0, true);            // método: store
    v.setUint16(10, hora, true);
    v.setUint16(12, dia, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, datos.length, true);
    v.setUint32(22, datos.length, true);
    v.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    locales.push(local, datos);

    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);   // firma del directorio central
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    centrales.push(central);
    desplazamiento += local.length + datos.length;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);     // fin del directorio central
  f.setUint16(8, entradas.length, true);
  f.setUint16(10, entradas.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...centrales, fin];
  const total = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of partes) { total.set(x, p); p += x.length; }
  return total;
}
