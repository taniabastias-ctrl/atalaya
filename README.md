# Atalaya · Radar de licitaciones Sermaluc

**Vigila. Prioriza. Gana.** Atalaya es la plataforma donde el equipo comercial de Sermaluc ve, reparte y sigue las licitaciones de Mercado Público que el agente detecta cada mañana.

Es una plataforma independiente, con identidad, interfaz y servidor propios.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Radar** | Radar animado donde cada punto es una licitación abierta. Mientras más cerca del centro, menos días quedan para el cierre. Incluye resumen del día, cuenta regresiva, novedades del último reporte, hitos de la semana y palabras clave. |
| **Licitaciones** | Tabla con filtros por estado, responsable, palabra clave y urgencia. |
| **Ficha** | Reloj en vivo hasta el cierre de ofertas (días, horas, minutos y segundos). Incluye estado, responsable, resumen, documentación, fechas importantes y bitácora del equipo. |
| **Documentación** | Subida de bases y anexos (arrastrando o eligiendo archivos, hasta 25 MB cada uno) y documentos preparados adjuntos a cada ítem del checklist. El equipo puede agregar ítems al checklist según lo que pidan las bases. Al final del checklist, **"Descargar todos (ZIP)"** exporta en un solo archivo los documentos adjuntos a cada ítem, con una carpeta por documento y un índice. |
| **Tablero** | Una tarjeta por licitación con su estado (editable en la misma tarjeta) y un reloj en vivo con días, horas, minutos y segundos hasta el cierre. Se filtra por estado. |
| **Equipo** | Carga de trabajo de cada persona y su próximo cierre. |
| **Configuración** | **Palabras clave** que usa el agente (suman o restan puntaje; se pueden agregar, pausar, cambiar de peso o eliminar). **Usuarios** (crear, editar rol y cargo, restablecer acceso, eliminar). **Registro de actividad**: todo lo que se hace en Atalaya, con usuario, fecha y una frase legible, y el detalle técnico detrás del botón "Detalle técnico". Todo el equipo puede ver la configuración y el registro; solo la administración puede modificarlos. |

**Carrera de licitaciones (pública):** desde la pantalla de ingreso, el botón "🏇 Ver la carrera de licitaciones" abre `/linea/` sin necesidad de ingresar: cada licitación es un carril donde un caballito avanza desde la publicación hasta el cierre, con la persona asignada. No muestra correos, montos ni documentos.

**Alertas:** colores según los días que faltan (rojo: 2 días o menos; naranja: 5 o menos; azul: 10 o menos). Además hay una campana con los plazos, una franja del agente con las licitaciones que cierran en menos de 48 h y un aviso al ingresar. También se advierte cuando una licitación no tiene responsable o le faltan documentos obligatorios.

**Avisos por correo:** cuando se asigna una licitación, la persona asignada recibe un correo con la ficha resumida y el plazo; cuando alguien agrega una nota, la nota llega por correo a todo el equipo (los usuarios @sermaluc.cl registrados en Atalaya). Los correos tienen el diseño de Atalaya y se configuran en **Configuración → Notificaciones**.

**Trabajo compartido:** el estado, el responsable, los documentos y las notas se guardan en el servidor. Cada navegador revisa si hay cambios cada 15 segundos y se actualiza solo.

## Ingreso con Google

El código ya está listo; solo falta crear las credenciales en Google, algo que debe hacer una persona con acceso a Google Cloud de Sermaluc:

1. En [Google Cloud Console](https://console.cloud.google.com/), crea o elige un proyecto y ve a **APIs y servicios → Pantalla de consentimiento de OAuth**. Elige el tipo **Interno** (solo cuentas de sermaluc.cl).
2. Ve a **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web** y, en **URI de redireccionamiento autorizados**, agrega:
   `https://atalaya-sermaluc.tania-bastias.workers.dev/api/auth/google/callback`
3. Copia el **ID de cliente** en `wrangler.toml` (`[vars] GOOGLE_CLIENT_ID = "..."`) y carga el **secreto** sin escribirlo en ningún archivo:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

4. Publica con `npx wrangler deploy`. Aparecerá el botón **Ingresar con Google**.

Solo pueden entrar los correos **@sermaluc.cl verificados** que estén **registrados como usuarios** en Atalaya. Quien entra con Google no necesita contraseña.

## Documentos de Mercado Público

Los adjuntos de cada licitación **no se pueden descargar automáticamente**. La página de adjuntos de Mercado Público está protegida con Google reCAPTCHA (verificación anti-robots), y tampoco aparecen en las APIs oficiales: ni en la API de licitaciones ni en la API de datos abiertos OCDS (revisado el 06-11-2026). Por eso Atalaya ofrece el botón **Abrir adjuntos en Mercado Público** y la **carga manual**. El enlace a la pantalla de adjuntos lleva un token que cambia en cada visita, así que, al hacer clic, Atalaya lee la ficha en ese momento y te lleva directo a la pantalla de descarga (`ViewAttachment.aspx`); Mercado Público puede pedirte allí su verificación anti-robots. Los archivos se guardan en Cloudflare R2 (`atalaya-sermaluc-archivos`) y solo se descargan con sesión iniciada.

## Modelo de datos

La base es relacional: organismos, unidades de compra, licitaciones, fechas, palabras clave, checklist, archivos, seguimiento, bitácora, etc. Ver [docs/02-modelo-de-datos.md](docs/02-modelo-de-datos.md), que incluye el diagrama.

## Arquitectura

```
site/        Interfaz (HTML, CSS y JS sin frameworks)
servidor/    server.mjs (HTTP + estáticos), worker.mjs (Cloudflare), api.mjs (API), schema.sql,
             db-sqlite.mjs y archivos-disco.mjs (servidor propio), migraciones/, pruebas.mjs (npm test)
scripts/     enviar-reporte.mjs, exportar-desde-cloudflare.mjs, crear-base.mjs, generar-secretos.mjs, respaldar.mjs
agente/      Agente de licitaciones (Python): consulta Mercado Público, envía el correo y publica en Atalaya
.github/     Flujo diario del agente y pruebas automáticas
instalacion/ Docker Compose, Caddy y plantillas para instalar en servidores de Sermaluc
docs/        Documentación técnica
data/        demo.json (datos de demostración)
datos/       atalaya.db (base de datos SQLite; se crea sola)
```

- **Node.js 24 (o 22.5+), sin dependencias externas** (usa el SQLite que viene con Node).
- **Seguridad:**
  - Solo pueden entrar las personas registradas por la administración y con correo `@sermaluc.cl`.
  - Las contraseñas se guardan con PBKDF2-SHA256 (100.000 iteraciones).
  - Las sesiones van en una cookie firmada `HttpOnly` y `SameSite=Lax`.
  - Hay protección contra solicitudes de otros sitios (CSRF), límite de intentos de ingreso y cabeceras de seguridad (CSP, X-Frame-Options, etc.).
  - El agente se autentica con un token propio.

## Producción (Cloudflare)

Publicada en **https://atalaya-sermaluc.tania-bastias.workers.dev**

- **Worker:** `atalaya-sermaluc`, con entrada `servidor/worker.mjs`, que sirve `site/` y la API.
- **Base de datos:** D1 `atalaya-sermaluc`, con el mismo `schema.sql`.
- **Configuración:** en `wrangler.toml`.
  - **Rendimiento:** la base D1 está en el este de EE.UU. (Cloudflare no tiene región en Sudamérica). Por eso la API corre junto a ella (`[placement] region = "aws:us-east-1"`) y agrupa sus consultas en un solo viaje, mientras que HTML, CSS y JS salen del servidor más cercano al usuario (`run_worker_first = ["/api/*"]`, cabeceras en `site/_headers`).
  - Administración: `tania.bastias@sermaluc.cl`.
  - `DEMO=0`: la plataforma parte vacía y se llena con los reportes del agente.
- **Secretos:** `SESSION_SECRET` y `AGENT_TOKEN` se cargaron con `wrangler secret bulk` desde `.secretos-produccion.json`. Ese archivo es local y no debe compartirse ni subirse a un repositorio. (`TEAM_KEY` ya no se usa y se puede borrar con `npx wrangler secret delete TEAM_KEY`.)
- **Publicar una nueva versión:**

```bash
npx wrangler deploy
```

- **Usuarios:** la administración registra a cada persona en **Configuración → Usuarios**; luego la persona entra con Google o usa "Activar mi cuenta" con su correo `@sermaluc.cl` para crear su contraseña.
- **Agente:** debe usar `ATALAYA_URL=https://atalaya-sermaluc.tania-bastias.workers.dev` y el `AGENT_TOKEN` de producción.

## Instalación en los servidores de Sermaluc

Atalaya puede funcionar fuera de Cloudflare, en cualquier servidor con Docker, con toda la información actual (usuarios, licitaciones, seguimiento, archivos y registro de actividad):

```bash
node scripts/exportar-desde-cloudflare.mjs                      # en el computador con acceso a Cloudflare
node scripts/generar-secretos.mjs atalaya.sermaluc.cl           # en el servidor
cd instalacion
docker compose run --rm atalaya node scripts/crear-base.mjs --db /data/atalaya.db --datos /importar/atalaya-datos.sql --archivos /importar/archivos --reemplazar
docker compose up -d
```

La guía completa, paso a paso, está en [docs/06-instalacion-servidor-propio.md](docs/07-instalacion-servidor-propio.md).

## Documentación técnica

Ver [docs/README.md](docs/README.md): arquitectura, modelo de datos, API, seguridad, interfaz, integración con el agente, instalación y operación.

## Conexión con el agente de licitaciones

Cada mañana, junto con el correo, el agente envía el mismo contenido a la plataforma:

```bash
AGENT_TOKEN=... ATALAYA_URL=https://atalaya.sermaluc.cl node scripts/enviar-reporte.mjs reporte.json
```

También puede hacer directamente un `POST /api/reporte` con la cabecera `Authorization: Bearer <AGENT_TOKEN>` y este cuerpo:

```json
{
  "meta": { "generado": "2026-11-06T08:00", "revisadas": 342, "fuente": "API Mercado Público",
            "palabrasClave": ["mesa de ayuda", "ciberseguridad"] },
  "licitaciones": [{
    "codigo": "1509-45-LP26", "nombre": "…", "organismo": "…", "unidad": "…", "region": "…",
    "tipo": "LP", "montoEstimado": 480000000, "duracion": "36 meses", "publicada": "2026-10-20T09:00",
    "match": 96, "palabrasClave": ["mesa de ayuda"], "descripcion": "…",
    "fechas": { "publicacion": "…", "visitaTerreno": "…", "finPreguntas": "…", "respuestas": "…",
                "cierre": "2026-11-08T15:00", "aperturaTecnica": "…", "aperturaEconomica": "…", "adjudicacion": "…" },
    "documentos": [{ "id": "d1", "nombre": "Anexo N°1 · Identificación del oferente", "tipo": "Administrativo", "obligatorio": true }],
    "criterios": [{ "nombre": "Precio", "peso": 35 }],
    "garantias": [{ "tipo": "Seriedad de la oferta", "monto": "$ 5.000.000", "vigencia": "90 días" }],
    "contacto": { "nombre": "…", "email": "…" }
  }]
}
```

Campos obligatorios: `codigo`, `nombre`, `fechas.cierre` y `documentos` (puede ser una lista vacía). Las fechas van en hora de Chile, con formato `AAAA-MM-DDTHH:MM`.

Una licitación aparece como **NUEVA** cuando llega por primera vez. Si vuelve a venir en otro reporte, se actualizan sus datos, pero se conservan su estado, su responsable, los documentos marcados y las notas.

## Demostración local

Con `DEMO=1` en `.env` y la base vacía, se cargan 12 licitaciones de ejemplo con las fechas ajustadas al día de hoy.

- Cuentas de prueba: `camila.rojas@sermaluc.cl` (administración), `matias.fuentes@sermaluc.cl` y el resto del equipo de ejemplo. Cada una se activa con "Activar mi cuenta", creando su contraseña la primera vez.
- Para volver a empezar desde cero, detén el servidor y borra la carpeta `datos/`.
