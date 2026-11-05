# Agente de licitaciones Mercado Público (Sermaluc)

## Objetivo
Agente que revisa diariamente las licitaciones PUBLICADAS en Mercado Público (Chile), las filtra por
palabras clave TI y entrega un Excel con listado + resumen. Uso: detección de oportunidades comerciales
para Sermaluc Ltda. (staffing TI y servicios gestionados, sector financiero). Usuaria: Tania Bastías. Idioma: español.

## Decisiones ya tomadas
- Enfoque: API oficial (`api.mercadopublico.cl`) como fuente principal + scraping de la ficha HTML solo como respaldo.
- Filtros: palabras clave TI + estado (publicadas/activas).
- Entregable: Excel (hoja "Licitaciones" + hoja "Resumen").
- Ejecución: tarea programada diaria (días hábiles).

## API (resumen)
- Base: `https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json`
- Parámetros: `ticket` (obligatorio), `codigo`, `fecha` (ddmmaaaa), `estado` (publicada, cerrada, desierta,
  adjudicada, revocada, suspendida, todos, activas), `CodigoOrganismo`, `CodigoProveedor`.
- Listado entrega datos básicos; consulta por `codigo` entrega detalle.
- Límite: 10.000 requests/día por ticket; consultas masivas recomendadas entre 22:00 y 07:00.
- Ticket gratuito vía Clave Única en api.mercadopublico.cl (uno por persona). Se pasa como variable `MP_TICKET`.

## Estado actual (2026-11-04)
- Probado contra la API real el 2026-11-04: 5.135 activas, 54 candidatas por nombre, 22 relevantes. Campos
  `Comprador`, `Fechas`, `MontoEstimado`, `Moneda`, `Descripcion` confirmados. Respuestas reales (redactadas) en `tests/fixtures/real_*`.
- Ficha HTML validada: `parse_ficha` usa ids reales (`lblFicha1Descripcion`, `lnkFicha2Razon`, `lblFicha2Unidad`,
  `lblFicha2Region`, `lblFicha3Cierre`, `lblFicha3Publicacion`). Fixture: `tests/fixtures/ficha_584264-52-LP26.html`.
- `NEGATIVOS` en `mp_agent.py`: términos que restan puntaje (impresión, insumos, equipamiento...).
- Correo: `enviar_correo.py` (SMTP; variables SMTP_HOST/PORT/USER/PASSWORD, MAIL_TO, MAIL_FROM). `--mail` en mp_agent.
- GitHub Actions: `.github/workflows/licitaciones.yml` (L-V 09:30 UTC; vistos.json vía actions/cache; Excel como artifact).
  AÚN NO SUBIDO a GitHub ni configurados los secrets; correo NO probado (faltan datos SMTP de Sermaluc).
- Python local: 3.15 vía `py`; entorno en `.venv`. 32 tests pasan.
- Hecho antes el 2026-11-04:
  - Corregido: `IndexError` cuando el detalle viene con `Listado` vacío (`primer_detalle`).
  - Corregido: fechas de la ficha HTML (dd-mm-aaaa) se normalizan a AAAA-MM-DD HH:MM (`fmt_fecha`) para ordenar bien.
  - `api_get` informa el motivo del fallo (sin imprimir el ticket) y no reintenta errores definitivos (ticket inválido).
  - Pre-filtro por nombre con `--min-score-nombre` (default 2) para no gastar cuota en coincidencias débiles ("datos", "plataforma").
  - Deduplicación: `vistos.json` (código -> fecha en que se vio por primera vez), columna "Nueva", fila verde, `--solo-nuevas`.
  - Palabras clave agregadas: banca, bancario, core bancario, créditos, Android, iOS, Java, microservicios, API, servicios gestionados.
  - Tests en `tests/` con fixtures en `tests/fixtures/` (forma de respuesta SUPUESTA; reemplazar por respuestas reales guardadas).

## Pendientes (en orden)
1. Subir a un repo GitHub PRIVADO y crear los secrets (ver README). Lanzar el workflow a mano y revisar el correo.
2. Correo: Sermaluc usa Google Workspace (MX aspmx.l.google.com) → smtp.gmail.com:587 con contraseña de aplicación.
   Envía tania.bastias@sermaluc.cl; destinatarios (MAIL_TO): michael.ibanez, marco.ponce, joaquin.letelier,
   cristian.andrade, valentina.erns (@sermaluc.cl). Envío oficial manual hecho el 2026-11-05 (22 licitaciones);
   `vistos_inicial.json` = ese registro, para que la 1.ª ejecución en Actions no las repita.
3. Seguir afinando `KEYWORDS`/`NEGATIVOS` con Tania: ¿interesan compras de licencias de software? (hoy salen como relevantes).
4. Opcional: scoring con LLM para explicar por qué una licitación calza con Sermaluc.

## Convenciones
- Python 3.10+, dependencias en `requirements.txt`. Nunca commitear el ticket (usar `.env`).
- Respetar límites de la API (pausas entre requests). No hacer scraping agresivo del sitio.
