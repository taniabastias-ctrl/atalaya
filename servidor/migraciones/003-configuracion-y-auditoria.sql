-- Migración 003: palabras clave configurables y registro de actividad.
--   npx wrangler d1 execute atalaya-sermaluc --remote --file servidor/migraciones/003-configuracion-y-auditoria.sql
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
