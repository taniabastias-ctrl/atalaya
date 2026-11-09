# 03 · Referencia de la API

Todas las rutas están bajo `/api/` y responden JSON (`content-type: application/json; charset=utf-8`, `cache-control: no-store`), salvo las redirecciones y las descargas de archivos. Los errores tienen la forma `{ "error": "mensaje legible" }`.

## Tipos de acceso

| Acceso | Cómo se autentica |
|---|---|
| **Público** | Sin autenticación. |
| **Agente** | Cabecera `Authorization: Bearer <AGENT_TOKEN>`. No usa cookie ni CSRF. |
| **Sesión** | Cookie `atalaya_sesion` (la crea `/api/ingresar`, `/api/activar` o el ingreso con Google). Las escrituras deben venir del mismo origen (CSRF). |
| **Admin** | Sesión de un usuario con `rol = 'admin'`. |

## Rutas públicas

| Método y ruta | Descripción |
|---|---|
| `GET /api/salud` | `{ ok: true }`. No toca la base. Para monitoreo. |
| `GET /api/config` | `{ google: boolean, dominio: "sermaluc.cl" }`. La pantalla de ingreso muestra el botón de Google si `google` es `true`. |
| `GET /api/publico/linea` | Datos de la línea de tiempo pública: `{ actualizado, licitaciones: [{ codigo, nombre, organismo, estado, responsable, fechas: { publicacion, cierre, ... } }] }`. Excluye descartadas y no adjudicadas. No incluye correos, montos, notas, documentos ni archivos. Caché pública 60 s. |
| `GET /api/auth/google` | Inicia el ingreso con Google (redirección 302 a Google con PKCE y `state`). |
| `GET /api/auth/google/callback` | Vuelta desde Google. Valida `state`, intercambia el código, verifica el `id_token` y crea la sesión. Redirige a `/` (o a `/?error_login=<motivo>`). |
| `POST /api/salir` | Borra la cookie de sesión. |

En el servidor propio existe además `GET /healthz` (texto `ok`), atendido por `server.mjs` sin pasar por la API.

## Rutas del agente

### `GET /api/agente/palabras`

Devuelve las palabras clave activas configuradas en Atalaya, que el agente usa en su consulta del día:

```json
{ "positivas": { "mesa de ayuda": 3, "ciberseguridad": 3 }, "negativas": { "aseo": -5 } }
```

### `POST /api/reporte`

Carga el reporte diario (máximo 10 MB). Ver el formato completo en [06 · Integración con el agente](06-agente.md).

Respuesta: `{ ok: true, reporte, recibidas, nuevas }` (`reporte` es la fecha y hora en que se recibió).

Errores: `401` (token inválido; además cuenta para el límite de intentos), `503` (el servidor no tiene `AGENT_TOKEN` o tiene menos de 24 caracteres), `400` (falta la lista `licitaciones`), `413` (más de 2000 licitaciones), `422` (licitaciones sin campos obligatorios; el mensaje indica las primeras 5), `429` (20 intentos fallidos por IP cada 15 min).

## Ingreso

| Método y ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /api/ingresar` | `{ email, password }` | `200 { ok, usuario }` + cookie. `401` credenciales incorrectas o cuenta sin activar. `429` demasiados intentos (5 por correo y 30 por IP cada 15 min). |
| `POST /api/activar` | `{ email, password }` | Crea la contraseña de una cuenta **registrada por la administración** y aún sin contraseña. `400` si el correo no es `@sermaluc.cl` o la contraseña tiene menos de 10 caracteres. `403` correo no registrado. `409` cuenta ya activada. `429` más de 10 intentos por IP cada 15 min. |

## Rutas con sesión

| Método y ruta | Descripción |
|---|---|
| `GET /api/sesion` | `{ usuario: { email, nombre, cargo, rol } }`. |
| `GET /api/version` | `{ version: n }`. Número que sube con cada cambio; la interfaz lo consulta cada 15 s. |
| `GET /api/datos` | Todo lo que necesita la interfaz: usuario, último reporte, palabras del reporte, licitaciones (con organismo, unidad, fechas, palabras, criterios, garantías, checklist, documentos listos, archivos, seguimiento y bitácora), equipo y versión. |

### Licitaciones

`:cod` es el código de Mercado Público (por ejemplo `1509-45-LP26`). Todas responden `{ ok: true, version }` y quedan en la bitácora de la licitación y en el registro de actividad.

| Método y ruta | Cuerpo | Efecto |
|---|---|---|
| `POST /api/licitaciones/:cod/estado` | `{ estado }` | `nueva`, `evaluacion`, `preparacion`, `presentada`, `adjudicada`, `noadjudicada` o `descartada`. |
| `POST /api/licitaciones/:cod/responsable` | `{ responsable: email \| "" }` | Asigna o quita al responsable (debe ser un usuario). Si estaba `nueva`, pasa a `evaluacion`. |
| `POST /api/licitaciones/:cod/documentos` | `{ doc, listo: boolean }` | Marca un ítem del checklist como listo o pendiente. El primero listo pasa la licitación a `preparacion`. |
| `POST /api/licitaciones/:cod/notas` | `{ texto }` | Agrega una nota (hasta 4000 caracteres) a la bitácora. |
| `POST /api/licitaciones/:cod/requeridos` | `{ nombre, tipo, obligatorio }` | Agrega un documento al checklist (`tipo`: `Administrativo`, `Técnico` o `Económico`). |
| `DELETE /api/licitaciones/:cod/requeridos/:doc` | — | Quita un documento agregado por el equipo (no los que informó el agente). |
| `GET /api/licitaciones/:cod/adjuntos` | — | Redirección 302 a la pantalla de adjuntos de Mercado Público (`ViewAttachment.aspx?enc=...`). El enlace lleva un token que cambia en cada visita, así que el servidor lee la ficha en ese momento; si no puede, redirige a la ficha. **Requiere que el servidor tenga salida a internet hacia `www.mercadopublico.cl`.** |

### Archivos

| Método y ruta | Descripción |
|---|---|
| `POST /api/licitaciones/:cod/archivos` | `multipart/form-data` con `archivo` (obligatorio), `categoria` (`bases` o `preparado`) y `doc_id` (opcional, ítem del checklist). Máximo 25 MB. Extensiones permitidas: pdf, doc, docx, xls, xlsx, ppt, pptx, odt, ods, csv, txt, zip, rar, 7z, jpg, jpeg, png. El tipo MIME se deduce de la extensión (no se confía en el navegador). `413` muy grande, `415` tipo no permitido. |
| `GET /api/archivos/:id` | Descarga el archivo (`content-disposition: attachment`). |
| `DELETE /api/archivos/:id` | Borra el archivo. Solo quien lo subió o la administración. |

Los archivos se guardan con la clave `licitaciones/<código>/<uuid>`.

### Configuración

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `GET /api/configuracion/palabras` | Sesión | Lista de palabras clave con peso, estado y quién las cambió. |
| `POST /api/configuracion/palabras` | Admin | `{ palabra, peso }`. Peso entero distinto de 0 (positivo suma, negativo resta). |
| `PATCH /api/configuracion/palabras/:palabra` | Admin | `{ peso?, activa? }`. |
| `DELETE /api/configuracion/palabras/:palabra` | Admin | Elimina la palabra. |
| `GET /api/auditoria` | Sesión | Registro de actividad. Parámetros: `q` (texto), `usuario` (correo), `resultado` (`ok`/`error`), `antes` (fecha ISO, para paginar), `limite` (10–200, por defecto 50). Respuesta `{ registros: [{ id, fecha, usuario, accion, descripcion, codigo, resultado, detalle }], hayMas }`. |

### Usuarios (solo administración)

| Método y ruta | Cuerpo | Efecto |
|---|---|---|
| `POST /api/equipo` | `{ email, nombre?, cargo?, rol? }` | Registra a una persona (`@sermaluc.cl`). Queda pendiente hasta que active su cuenta o ingrese con Google. |
| `PATCH /api/equipo/:email` | `{ nombre?, cargo?, rol? }` | Edita. Las cuentas de `ADMIN_EMAILS` no pueden perder el rol de administración. |
| `POST /api/equipo/:email` | — | Restablece el acceso: borra la contraseña y cierra todas sus sesiones. |
| `DELETE /api/equipo/:email` | — | Elimina al usuario; sus licitaciones quedan sin responsable. No se puede eliminar la propia cuenta ni las de `ADMIN_EMAILS`. |

## Códigos de estado usados

`200` ok · `302` redirección · `400` datos inválidos · `401` sin sesión o token inválido · `403` sin permiso u origen no permitido · `404` no encontrado · `405` método no permitido · `409` conflicto · `413` archivo muy grande · `415` tipo no permitido · `422` reporte con errores · `429` demasiados intentos · `500` error interno (el detalle queda en la consola del servidor y en la auditoría) · `503` servicio no configurado.
