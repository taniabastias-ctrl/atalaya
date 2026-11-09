# 04 · Seguridad

## Quién puede entrar

- Solo personas **registradas por la administración** (tabla `usuarios`) y con correo del dominio `ALLOWED_DOMAIN` (`sermaluc.cl`).
- Los correos de `ADMIN_EMAILS` se registran solos como administración al iniciar el servidor y no pueden perder ese rol ni ser eliminados desde la interfaz.
- Roles: `admin` (gestiona usuarios y palabras clave) y `equipo` (trabaja las licitaciones y ve configuración y registro, sin modificarlos).

## Formas de ingreso

### Ingreso con Google (recomendado)

OpenID Connect con flujo *authorization code* + **PKCE (S256)**:

1. `/api/auth/google` genera `state` y `code_verifier` aleatorios, los guarda en la cookie `atalaya_oauth` firmada con HMAC (10 minutos, `HttpOnly`, `SameSite=Lax`, ruta `/api/auth/google`) y redirige a Google con `hd=sermaluc.cl` y `prompt=select_account`.
2. En la vuelta se verifica la firma y vigencia de la cookie, que `state` coincida, se intercambia el código por tokens (con el `code_verifier`) y se validan del `id_token`: emisor `accounts.google.com`, audiencia = `GOOGLE_CLIENT_ID`, vigencia, `email_verified = true`, dominio del correo y `hd`.
3. Solo si el correo está registrado en Atalaya se crea la sesión. Los rechazos quedan en la auditoría con el motivo.

### Contraseña

- **Activación:** la persona escribe su correo `@sermaluc.cl` y crea su contraseña (mínimo 10 caracteres). Solo funciona si la administración la registró y la cuenta aún no tiene contraseña.
- **Almacenamiento:** PBKDF2-SHA256, 100.000 iteraciones, sal aleatoria de 16 bytes por usuario. Comparación en tiempo constante.
- **Restablecer acceso** (administración): borra la contraseña y cierra todas las sesiones de esa persona (`revocado_desde`).

> **Riesgo conocido:** desde que se eliminó la "clave del equipo", quien conozca el correo de una persona **registrada que aún no ha activado su cuenta** podría activarla primero. Mitigaciones: registrar a las personas justo antes de que ingresen, preferir el ingreso con Google (que no tiene este riesgo) y revisar el registro de actividad (`sesion.activacion`). Mejora sugerida: enviar un código de verificación por correo al activar.

## Sesiones

- Cookie `atalaya_sesion` = `payload.firma`, donde el payload es `{ e: email, iat, exp }` en base64url y la firma es HMAC-SHA256 con `SESSION_SECRET`.
- Atributos: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` cuando el sitio está en HTTPS, duración 30 días.
- En cada petición se verifica firma, vigencia, que el usuario siga existiendo y que la sesión sea posterior a `revocado_desde`. Eliminar o restablecer a un usuario invalida sus sesiones al instante.
- **Cambiar `SESSION_SECRET` cierra todas las sesiones.** Por eso el servidor propio usa un secreto nuevo, distinto del de Cloudflare.

## Protección de la API

| Medida | Detalle |
|---|---|
| CSRF | Toda escritura con sesión exige que `Origin` sea el mismo sitio y rechaza `sec-fetch-site: cross-site`. La cookie es `SameSite=Lax`. |
| Límite de intentos | Tabla `limites`: 5 ingresos fallidos por correo y 30 por IP cada 15 min; 10 activaciones por IP; 20 tokens de agente inválidos por IP. Responde `429`. |
| Token del agente | Comparación en tiempo constante; mínimo 24 caracteres (los generados tienen 64). Solo da acceso a `/api/reporte` y `/api/agente/palabras`. |
| Validación de entradas | Longitudes máximas, expresiones regulares para códigos, correos, ids y documentos; consultas siempre con parámetros (`bind`), nunca concatenando valores. |
| Archivos | Máximo 25 MB; lista blanca de extensiones; el tipo MIME lo decide el servidor; nombre saneado; descarga como `attachment`; solo con sesión. |
| Tamaño de cuerpos | JSON hasta 2–20 KB según la ruta; reporte del agente hasta 10 MB; el servidor propio corta cuerpos sobre 27 MB y Caddy sobre 30 MB. |
| Errores | Los errores internos devuelven un mensaje genérico; el detalle va a la consola del servidor. |

## Cabeceras de seguridad

Se envían en Cloudflare (`site/_headers` y `worker.mjs`) y en el servidor propio (`server.mjs`; Caddy agrega HSTS):

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=31536000`.

La interfaz no usa scripts en línea ni `eval`, y escapa todo texto antes de insertarlo en el HTML.

## Datos expuestos sin sesión

Solo `/api/publico/linea`: código, nombre, organismo, estado, fechas y **nombre** del responsable. No expone correos, montos, notas, documentos ni archivos.

## Registro de actividad (auditoría)

Cada acción relevante (ingresos y salidas, intentos fallidos, activaciones, cambios de estado y responsable, documentos, notas, archivos, palabras clave, usuarios, cargas del agente) queda en la tabla `auditoria` con fecha, usuario, una frase legible y un detalle técnico (método, ruta, código de respuesta, IP, navegador, duración y datos antes/después). Lo puede leer todo el equipo en **Configuración → Registro de actividad**; nadie puede modificarlo desde la interfaz.

## Secretos

| Secreto | Dónde vive | Notas |
|---|---|---|
| `SESSION_SECRET` | Secreto de Wrangler / `instalacion/.env` | 64 caracteres hex aleatorios. |
| `AGENT_TOKEN` | Secreto de Wrangler / `instalacion/.env` | Mismo valor que `ATALAYA_TOKEN` del agente. |
| `GOOGLE_CLIENT_SECRET` | Secreto de Wrangler / `instalacion/.env` | Desde Google Cloud Console. |
| `TEAM_KEY` | Secreto de Wrangler (Cloudflare) | **Ya no se usa.** Se puede borrar con `npx wrangler secret delete TEAM_KEY`. |

`instalacion/.env`, `instalacion/agente.env`, `.secretos-produccion.json` e `instalacion/datos/` están excluidos de git y de la imagen Docker. **`instalacion/datos/` contiene datos personales y hashes de contraseñas**: se debe mover al servidor por un canal seguro y borrar cuando ya no se necesite.
