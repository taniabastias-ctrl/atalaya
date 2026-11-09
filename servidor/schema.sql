-- Atalaya · Radar de licitaciones Sermaluc: modelo relacional (SQLite / Cloudflare D1)
-- Se aplica solo en una base nueva. Para bases existentes, ver servidor/migraciones/.
-- Diagrama y descripción de cada tabla: docs/02-modelo-de-datos.md

-- ============ Equipo ============
-- Sin contraseña (hash vacío) = cuenta pendiente de activar.
CREATE TABLE IF NOT EXISTS usuarios (
  email            TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  cargo            TEXT NOT NULL DEFAULT '',
  rol              TEXT NOT NULL DEFAULT 'equipo' CHECK (rol IN ('equipo', 'admin')),
  hash             TEXT NOT NULL DEFAULT '',
  salt             TEXT NOT NULL DEFAULT '',
  creado           TEXT NOT NULL,
  revocado_desde   INTEGER NOT NULL DEFAULT 0,       -- sesiones emitidas antes de esto (ms) dejan de valer
  ultimo_ingreso   TEXT
);

-- ============ Reportes del agente ============
CREATE TABLE IF NOT EXISTS reportes (
  id         TEXT PRIMARY KEY,                       -- fecha-hora de recepción ISO (ordenable)
  generado   TEXT NOT NULL,                          -- cuándo lo generó el agente (hora de Chile)
  agente     TEXT NOT NULL DEFAULT '',
  fuente     TEXT NOT NULL DEFAULT '',
  revisadas  INTEGER NOT NULL DEFAULT 0              -- licitaciones revisadas en Mercado Público
);

CREATE TABLE IF NOT EXISTS palabras_clave (
  palabra  TEXT PRIMARY KEY
);

-- Palabras clave que vigilaba el agente en cada reporte
CREATE TABLE IF NOT EXISTS reporte_palabras (
  reporte_id  TEXT NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  palabra     TEXT NOT NULL REFERENCES palabras_clave(palabra),
  PRIMARY KEY (reporte_id, palabra)
);

-- ============ Compradores ============
CREATE TABLE IF NOT EXISTS organismos (
  id      INTEGER PRIMARY KEY,
  codigo  TEXT UNIQUE,                               -- CodigoOrganismo de Mercado Público (si se conoce)
  nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS unidades_compra (
  id           INTEGER PRIMARY KEY,
  organismo_id INTEGER NOT NULL REFERENCES organismos(id),
  codigo       TEXT,                                 -- CodigoUnidad de Mercado Público (si se conoce)
  nombre       TEXT NOT NULL,
  region       TEXT NOT NULL DEFAULT '',
  UNIQUE (organismo_id, nombre)
);

-- ============ Licitaciones ============
CREATE TABLE IF NOT EXISTS licitaciones (
  codigo           TEXT PRIMARY KEY,                 -- código de Mercado Público, p. ej. 1509-45-LP26
  nombre           TEXT NOT NULL,
  descripcion      TEXT NOT NULL DEFAULT '',
  organismo_id     INTEGER REFERENCES organismos(id),
  unidad_id        INTEGER REFERENCES unidades_compra(id),
  tipo             TEXT NOT NULL DEFAULT '',         -- L1, LE, LP, LQ, LR…
  moneda           TEXT NOT NULL DEFAULT 'CLP',
  monto_estimado   INTEGER NOT NULL DEFAULT 0,       -- en CLP; 0 = no informado o en otra moneda
  monto_original   REAL,                             -- monto en la moneda original
  duracion         TEXT NOT NULL DEFAULT '',
  coincidencia     INTEGER NOT NULL DEFAULT 0 CHECK (coincidencia BETWEEN 0 AND 100),
  url              TEXT,
  contacto_nombre  TEXT NOT NULL DEFAULT '',
  contacto_email   TEXT NOT NULL DEFAULT '',
  primer_reporte   TEXT NOT NULL REFERENCES reportes(id),
  ultimo_reporte   TEXT NOT NULL REFERENCES reportes(id)
);
CREATE INDEX IF NOT EXISTS licitaciones_organismo ON licitaciones (organismo_id);

-- Qué licitaciones trajo cada reporte (historial)
CREATE TABLE IF NOT EXISTS reporte_licitaciones (
  reporte_id  TEXT NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  codigo      TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  PRIMARY KEY (reporte_id, codigo)
);

-- Hitos del calendario: publicacion, visitaTerreno, finPreguntas, respuestas, cierre,
-- aperturaTecnica, aperturaEconomica, adjudicacion
CREATE TABLE IF NOT EXISTS licitacion_fechas (
  codigo  TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  hito    TEXT NOT NULL,
  fecha   TEXT NOT NULL,                             -- AAAA-MM-DDTHH:MM, hora de Chile
  PRIMARY KEY (codigo, hito)
);
CREATE INDEX IF NOT EXISTS licitacion_fechas_fecha ON licitacion_fechas (hito, fecha);

CREATE TABLE IF NOT EXISTS licitacion_palabras (
  codigo   TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  palabra  TEXT NOT NULL REFERENCES palabras_clave(palabra),
  PRIMARY KEY (codigo, palabra)
);

CREATE TABLE IF NOT EXISTS criterios_evaluacion (
  codigo  TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  orden   INTEGER NOT NULL,
  nombre  TEXT NOT NULL,
  peso    REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (codigo, orden)
);

CREATE TABLE IF NOT EXISTS garantias (
  codigo    TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  orden     INTEGER NOT NULL,
  tipo      TEXT NOT NULL,
  monto     TEXT NOT NULL DEFAULT '',
  vigencia  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (codigo, orden)
);

-- ============ Documentación ============
-- Checklist de lo que hay que presentar. origen: 'agente' (lo envía el agente) o 'equipo' (agregado a mano).
CREATE TABLE IF NOT EXISTS documentos_requeridos (
  codigo       TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  doc_id       TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'Administrativo' CHECK (tipo IN ('Administrativo', 'Técnico', 'Económico')),
  obligatorio  INTEGER NOT NULL DEFAULT 1 CHECK (obligatorio IN (0, 1)),
  orden        INTEGER NOT NULL DEFAULT 0,
  origen       TEXT NOT NULL DEFAULT 'agente' CHECK (origen IN ('agente', 'equipo')),
  PRIMARY KEY (codigo, doc_id)
);

-- Documentos marcados como listos (una fila por documento: marcar/desmarcar es atómico).
-- "por" no es clave foránea: el historial conserva quién lo marcó aunque deje el equipo.
CREATE TABLE IF NOT EXISTS documentos_listos (
  codigo  TEXT NOT NULL,
  doc_id  TEXT NOT NULL,
  por     TEXT NOT NULL,
  fecha   TEXT NOT NULL,
  PRIMARY KEY (codigo, doc_id),
  FOREIGN KEY (codigo, doc_id) REFERENCES documentos_requeridos(codigo, doc_id) ON DELETE CASCADE
);

-- Archivos subidos (bases, anexos, documentos preparados). El contenido vive en el almacén de archivos
-- (Cloudflare R2 en producción, carpeta local en desarrollo) bajo clave_almacen.
-- doc_id (opcional) lo asocia a un documento del checklist.
CREATE TABLE IF NOT EXISTS archivos (
  id             TEXT PRIMARY KEY,
  codigo         TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  doc_id         TEXT,
  categoria      TEXT NOT NULL DEFAULT 'bases' CHECK (categoria IN ('bases', 'preparado')),
  nombre         TEXT NOT NULL,
  tipo_mime      TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  clave_almacen  TEXT NOT NULL UNIQUE,
  subido_por     TEXT NOT NULL,
  fecha          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS archivos_codigo ON archivos (codigo);

-- ============ Trabajo del equipo ============
CREATE TABLE IF NOT EXISTS seguimiento (
  codigo           TEXT PRIMARY KEY REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  estado           TEXT NOT NULL DEFAULT 'nueva'
                   CHECK (estado IN ('nueva', 'evaluacion', 'preparacion', 'presentada', 'adjudicada', 'noadjudicada', 'descartada')),
  responsable      TEXT REFERENCES usuarios(email) ON DELETE SET NULL,
  actualizado      TEXT NOT NULL,
  actualizado_por  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS seguimiento_responsable ON seguimiento (responsable);

-- Bitácora: notas del equipo y cambios registrados por el sistema ("autor" sin clave foránea, igual que "por").
CREATE TABLE IF NOT EXISTS eventos (
  id      TEXT PRIMARY KEY,
  codigo  TEXT NOT NULL REFERENCES licitaciones(codigo) ON DELETE CASCADE,
  tipo    TEXT NOT NULL CHECK (tipo IN ('nota', 'sistema')),
  autor   TEXT NOT NULL,
  texto   TEXT NOT NULL,
  fecha   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eventos_codigo ON eventos (codigo, fecha);

-- ============ Configuración: palabras clave que usa el agente ============
-- peso > 0 suma puntaje (más relevante); peso < 0 resta (indica que NO es para Sermaluc).
-- El agente las descarga antes de cada consulta diaria (GET /api/agente/palabras) y compara sin tildes.
CREATE TABLE IF NOT EXISTS palabras_vigiladas (
  palabra     TEXT PRIMARY KEY,
  peso        INTEGER NOT NULL CHECK (peso BETWEEN -5 AND 5 AND peso <> 0),
  activa      INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  creada_por  TEXT NOT NULL DEFAULT 'sistema',
  creada      TEXT NOT NULL
);

-- ============ Registro de actividad (auditoría) ============
-- Una fila por acción. descripcion = frase legible; detalle = JSON técnico (IP, navegador, ruta, datos).
-- usuario y codigo sin claves foráneas: el registro se conserva aunque se borre la persona o la licitación.
CREATE TABLE IF NOT EXISTS auditoria (
  id           TEXT PRIMARY KEY,
  fecha        TEXT NOT NULL,
  usuario      TEXT NOT NULL,
  accion       TEXT NOT NULL,
  descripcion  TEXT NOT NULL,
  codigo       TEXT,
  resultado    TEXT NOT NULL DEFAULT 'ok' CHECK (resultado IN ('ok', 'error')),
  detalle      TEXT
);
CREATE INDEX IF NOT EXISTS auditoria_fecha ON auditoria (fecha);
CREATE INDEX IF NOT EXISTS auditoria_usuario ON auditoria (usuario, fecha);

-- Palabras iniciales (las mismas que traía el agente)
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('staffing', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('outsourcing', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('servicios ti', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('tecnologias de la informacion', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('consultoria ti', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('servicios informaticos', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('servicios gestionados', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('mesa de ayuda', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('mesa de servicio', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('mesa de soporte', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('soporte n2', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('soporte tecnico', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('soporte informatico', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('desarrollo de software', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('desarrollo de aplicaciones', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('mantencion de software', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('analista programador', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('programador', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('software', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('aplicacion movil', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('android', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('ios', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('java', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('microservicios', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('api', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('ux', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('qa', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('testing', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('arquitecto', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('devops', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('integracion', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('mulesoft', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('cloud', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('azure', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('aws', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('ciberseguridad', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('seguridad informatica', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('core bancario', 3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('banca', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('bancario', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('creditos', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('sistema de informacion', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('transformacion digital', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('automatizacion', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('inteligencia artificial', 2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('datos', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('plataforma', 1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('impresion', -3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('insumos', -3, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('suministro', -2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('equipamiento', -2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('adquisicion equipos', -2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('adquisicion de equipos', -2, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;
INSERT INTO palabras_vigiladas (palabra, peso, creada) VALUES ('datos personales', -1, '2026-11-06T00:00:00.000Z') ON CONFLICT (palabra) DO NOTHING;

-- ============ Técnicas ============
-- Contador de cambios: el navegador lo consulta para saber si debe recargar
CREATE TABLE IF NOT EXISTS kv (
  k  TEXT PRIMARY KEY,
  v  INTEGER NOT NULL
);

-- Límite de intentos (ingreso, activación)
CREATE TABLE IF NOT EXISTS limites (
  clave   TEXT PRIMARY KEY,
  conteo  INTEGER NOT NULL,
  desde   INTEGER NOT NULL
);
