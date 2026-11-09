-- Migración 002: de licitaciones guardadas como JSON a modelo relacional.
-- Aplicar UNA vez sobre una base creada con el esquema anterior:
--   npx wrangler d1 export atalaya-sermaluc --remote --output respaldo-antes-002.sql   (respaldo)
--   npx wrangler d1 execute atalaya-sermaluc --remote --file servidor/migraciones/002-modelo-relacional.sql
-- Conserva: reportes, licitaciones, estados, responsables, documentos marcados y bitácora.
-- Las tablas usuarios, kv y limites no cambian.

PRAGMA defer_foreign_keys = true;

ALTER TABLE reportes RENAME TO v1_reportes;
ALTER TABLE licitaciones RENAME TO v1_licitaciones;
ALTER TABLE seguimiento RENAME TO v1_seguimiento;
ALTER TABLE documentos_listos RENAME TO v1_documentos_listos;
ALTER TABLE eventos RENAME TO v1_eventos;
DROP INDEX IF EXISTS eventos_codigo;

-- ---------- tablas nuevas (idénticas a schema.sql) ----------
CREATE TABLE reportes (
  id TEXT PRIMARY KEY, generado TEXT NOT NULL, agente TEXT NOT NULL DEFAULT '',
  fuente TEXT NOT NULL DEFAULT '', revisadas INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE palabras_clave (palabra TEXT PRIMARY KEY);
CREATE TABLE reporte_palabras (
  reporte_id TEXT NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  palabra TEXT NOT NULL REFERENCES palabras_clave(palabra),
  PRIMARY KEY (reporte_id, palabra)
);
CREATE TABLE organismos (id INTEGER PRIMARY KEY, codigo TEXT UNIQUE, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE unidades_compra (
  id INTEGER PRIMARY KEY, organismo_id INTEGER NOT NULL REFERENCES organismos(id), codigo TEXT,
  nombre TEXT NOT NULL, region TEXT NOT NULL DEFAULT '', UNIQUE (organismo_id, nombre)
);
CREATE TABLE licitaciones (
  codigo TEXT PRIMARY KEY, nombre TEXT NOT NULL, descripcion TEXT NOT NULL DEFAULT '',
  organismo_id INTEGER REFERENCES organismos(id), unidad_id INTEGER REFERENCES unidades_compra(id),
  tipo TEXT NOT NULL DEFAULT '', moneda TEXT NOT NULL DEFAULT 'CLP', monto_estimado INTEGER NOT NULL DEFAULT 0,
  monto_original REAL, duracion TEXT NOT NULL DEFAULT '',
  coincidencia INTEGER NOT NULL DEFAULT 0 CHECK (coincidencia BETWEEN 0 AND 100), url TEXT,
  contacto_nombre TEXT NOT NULL DEFAULT '', contacto_email TEXT NOT NULL DEFAULT '',
  primer_reporte TEXT NOT NULL REFERENCES reportes(id), ultimo_reporte TEXT NOT NULL REFERENCES reportes(id)
);
CREATE INDEX licitaciones_organismo ON licitaciones (organismo_id);
CREATE TABLE reporte_licitaciones (
  reporte_id TEXT NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  PRIMARY KEY (reporte_id, codigo)
);
CREATE TABLE licitacion_fechas (
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  hito TEXT NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY (codigo, hito)
);
CREATE INDEX licitacion_fechas_fecha ON licitacion_fechas (hito, fecha);
CREATE TABLE licitacion_palabras (
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  palabra TEXT NOT NULL REFERENCES palabras_clave(palabra), PRIMARY KEY (codigo, palabra)
);
CREATE TABLE criterios_evaluacion (
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  orden INTEGER NOT NULL, nombre TEXT NOT NULL, peso REAL NOT NULL DEFAULT 0, PRIMARY KEY (codigo, orden)
);
CREATE TABLE garantias (
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  orden INTEGER NOT NULL, tipo TEXT NOT NULL, monto TEXT NOT NULL DEFAULT '', vigencia TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (codigo, orden)
);
CREATE TABLE documentos_requeridos (
  codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  doc_id TEXT NOT NULL, nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Administrativo' CHECK (tipo IN ('Administrativo', 'Técnico', 'Económico')),
  obligatorio INTEGER NOT NULL DEFAULT 1 CHECK (obligatorio IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'agente' CHECK (origen IN ('agente', 'equipo')),
  PRIMARY KEY (codigo, doc_id)
);
CREATE TABLE documentos_listos (
  codigo TEXT NOT NULL, doc_id TEXT NOT NULL, por TEXT NOT NULL, fecha TEXT NOT NULL,
  PRIMARY KEY (codigo, doc_id),
  FOREIGN KEY (codigo, doc_id) REFERENCES documentos_requeridos(codigo, doc_id) ON DELETE CASCADE
);
CREATE TABLE archivos (
  id TEXT PRIMARY KEY, codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  doc_id TEXT, categoria TEXT NOT NULL DEFAULT 'bases' CHECK (categoria IN ('bases', 'preparado')),
  nombre TEXT NOT NULL, tipo_mime TEXT NOT NULL, tamano INTEGER NOT NULL,
  clave_almacen TEXT NOT NULL UNIQUE, subido_por TEXT NOT NULL, fecha TEXT NOT NULL
);
CREATE INDEX archivos_codigo ON archivos (codigo);
CREATE TABLE seguimiento (
  codigo TEXT PRIMARY KEY REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  estado TEXT NOT NULL DEFAULT 'nueva'
    CHECK (estado IN ('nueva', 'evaluacion', 'preparacion', 'presentada', 'adjudicada', 'noadjudicada', 'descartada')),
  responsable TEXT REFERENCES usuarios(email) ON DELETE SET NULL,
  actualizado TEXT NOT NULL, actualizado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX seguimiento_responsable ON seguimiento (responsable);
CREATE TABLE eventos (
  id TEXT PRIMARY KEY, codigo TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'sistema')), autor TEXT NOT NULL, texto TEXT NOT NULL, fecha TEXT NOT NULL
);
CREATE INDEX eventos_codigo ON eventos (codigo, fecha);

-- ---------- copia de datos ----------
INSERT INTO reportes (id, generado, agente, fuente, revisadas)
  SELECT id, generado, COALESCE(json_extract(meta, '$.agente'), ''), COALESCE(json_extract(meta, '$.fuente'), ''),
         COALESCE(json_extract(meta, '$.revisadas'), 0)
  FROM v1_reportes;

INSERT OR IGNORE INTO palabras_clave (palabra)
  SELECT DISTINCT trim(j.value) FROM v1_reportes r, json_each(r.meta, '$.palabrasClave') j WHERE trim(j.value) <> '';
INSERT OR IGNORE INTO palabras_clave (palabra)
  SELECT DISTINCT trim(j.value) FROM v1_licitaciones l, json_each(l.data, '$.palabrasClave') j WHERE trim(j.value) <> '';
INSERT OR IGNORE INTO reporte_palabras (reporte_id, palabra)
  SELECT r.id, trim(j.value) FROM v1_reportes r, json_each(r.meta, '$.palabrasClave') j WHERE trim(j.value) <> '';

INSERT OR IGNORE INTO organismos (nombre, codigo)
  SELECT json_extract(data, '$.organismo'), MAX(json_extract(data, '$.organismoCodigo'))
  FROM v1_licitaciones WHERE COALESCE(json_extract(data, '$.organismo'), '') <> ''
  GROUP BY json_extract(data, '$.organismo');
INSERT OR IGNORE INTO unidades_compra (organismo_id, nombre, region)
  SELECT o.id, COALESCE(json_extract(l.data, '$.unidad'), ''), MAX(COALESCE(json_extract(l.data, '$.region'), ''))
  FROM v1_licitaciones l JOIN organismos o ON o.nombre = json_extract(l.data, '$.organismo')
  GROUP BY o.id, COALESCE(json_extract(l.data, '$.unidad'), '');

INSERT INTO licitaciones (codigo, nombre, descripcion, organismo_id, unidad_id, tipo, moneda, monto_estimado,
                          monto_original, duracion, coincidencia, url, contacto_nombre, contacto_email,
                          primer_reporte, ultimo_reporte)
  SELECT l.codigo,
         json_extract(l.data, '$.nombre'),
         COALESCE(json_extract(l.data, '$.descripcion'), ''),
         o.id, u.id,
         COALESCE(json_extract(l.data, '$.tipo'), ''),
         COALESCE(json_extract(l.data, '$.moneda'), 'CLP'),
         CAST(COALESCE(json_extract(l.data, '$.montoEstimado'), 0) AS INTEGER),
         json_extract(l.data, '$.montoOriginal'),
         COALESCE(json_extract(l.data, '$.duracion'), ''),
         MIN(100, MAX(0, CAST(COALESCE(json_extract(l.data, '$.match'), 0) AS INTEGER))),
         json_extract(l.data, '$.url'),
         COALESCE(json_extract(l.data, '$.contacto.nombre'), ''),
         COALESCE(json_extract(l.data, '$.contacto.email'), ''),
         l.primer_reporte, l.ultimo_reporte
  FROM v1_licitaciones l
  LEFT JOIN organismos o ON o.nombre = json_extract(l.data, '$.organismo')
  LEFT JOIN unidades_compra u ON u.organismo_id = o.id AND u.nombre = COALESCE(json_extract(l.data, '$.unidad'), '');

INSERT OR IGNORE INTO reporte_licitaciones (reporte_id, codigo)
  SELECT primer_reporte, codigo FROM v1_licitaciones
  UNION SELECT ultimo_reporte, codigo FROM v1_licitaciones;

INSERT INTO licitacion_fechas (codigo, hito, fecha)
  SELECT l.codigo, j.key, j.value FROM v1_licitaciones l, json_each(l.data, '$.fechas') j
  WHERE j.value IS NOT NULL AND j.value <> '';

INSERT OR IGNORE INTO licitacion_palabras (codigo, palabra)
  SELECT l.codigo, trim(j.value) FROM v1_licitaciones l, json_each(l.data, '$.palabrasClave') j WHERE trim(j.value) <> '';

INSERT INTO criterios_evaluacion (codigo, orden, nombre, peso)
  SELECT l.codigo, j.key, json_extract(j.value, '$.nombre'), COALESCE(json_extract(j.value, '$.peso'), 0)
  FROM v1_licitaciones l, json_each(l.data, '$.criterios') j WHERE json_extract(j.value, '$.nombre') IS NOT NULL;

INSERT INTO garantias (codigo, orden, tipo, monto, vigencia)
  SELECT l.codigo, j.key, json_extract(j.value, '$.tipo'), COALESCE(json_extract(j.value, '$.monto'), ''),
         COALESCE(json_extract(j.value, '$.vigencia'), '')
  FROM v1_licitaciones l, json_each(l.data, '$.garantias') j WHERE json_extract(j.value, '$.tipo') IS NOT NULL;

INSERT OR IGNORE INTO documentos_requeridos (codigo, doc_id, nombre, tipo, obligatorio, orden, origen)
  SELECT l.codigo, json_extract(j.value, '$.id'), json_extract(j.value, '$.nombre'),
         CASE WHEN json_extract(j.value, '$.tipo') IN ('Administrativo', 'Técnico', 'Económico')
              THEN json_extract(j.value, '$.tipo') ELSE 'Administrativo' END,
         CASE WHEN json_extract(j.value, '$.obligatorio') THEN 1 ELSE 0 END,
         j.key, 'agente'
  FROM v1_licitaciones l, json_each(l.data, '$.documentos') j;

INSERT INTO seguimiento (codigo, estado, responsable, actualizado, actualizado_por)
  SELECT s.codigo, s.estado,
         CASE WHEN s.responsable IN (SELECT email FROM usuarios) THEN s.responsable ELSE NULL END,
         s.actualizado, s.actualizado_por
  FROM v1_seguimiento s WHERE s.codigo IN (SELECT codigo FROM licitaciones);

INSERT INTO documentos_listos (codigo, doc_id, por, fecha)
  SELECT d.codigo, d.doc_id, d.por, d.fecha FROM v1_documentos_listos d
  JOIN documentos_requeridos r ON r.codigo = d.codigo AND r.doc_id = d.doc_id;

INSERT INTO eventos (id, codigo, tipo, autor, texto, fecha)
  SELECT id, codigo, tipo, autor, texto, fecha FROM v1_eventos WHERE codigo IN (SELECT codigo FROM licitaciones);

-- ---------- limpieza ----------
DROP TABLE v1_eventos;
DROP TABLE v1_documentos_listos;
DROP TABLE v1_seguimiento;
DROP TABLE v1_licitaciones;
DROP TABLE v1_reportes;
INSERT INTO kv (k, v) VALUES ('version', 1) ON CONFLICT (k) DO UPDATE SET v = kv.v + 1;
