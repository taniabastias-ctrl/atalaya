# 08 · Operación y mantenimiento

## Respaldos

### Servidor propio

```bash
cd /opt/atalaya/instalacion
docker compose exec atalaya node scripts/respaldar.mjs
```

- Hace una copia consistente de la base **sin detener el servicio** (`VACUUM INTO`) y copia la carpeta de archivos.
- Queda en `/data/respaldos/atalaya-AAAA-MM-DD-HH-MM/` (dentro del volumen) y conserva los últimos 14 (`RESPALDOS_A_CONSERVAR`).
- Programe un respaldo diario con `cron` del servidor (`crontab -e`):

```
0 2 * * * cd /opt/atalaya/instalacion && docker compose exec -T atalaya node scripts/respaldar.mjs >> /var/log/atalaya-respaldo.log 2>&1
```

- **Copie los respaldos fuera del servidor** (almacenamiento de objetos o disco de respaldo de la nube de Sermaluc). Por ejemplo:

```bash
docker run --rm -v atalaya_atalaya-datos:/data -v /respaldos-externos:/destino alpine cp -r /data/respaldos/. /destino/
```

- **Restaurar:** detenga el servicio, reemplace `/data/atalaya.db` y `/data/archivos` por los del respaldo y vuelva a iniciar.

```bash
docker compose stop atalaya
docker compose run --rm --entrypoint sh atalaya -c "cp /data/respaldos/<carpeta>/atalaya.db /data/atalaya.db && rm -f /data/atalaya.db-wal /data/atalaya.db-shm && rm -rf /data/archivos && cp -r /data/respaldos/<carpeta>/archivos /data/archivos"
docker compose start atalaya
```

### Cloudflare (mientras siga en uso)

```bash
npx wrangler d1 export atalaya-sermaluc --remote --output respaldos/atalaya-$(date +%Y%m%d).sql
```

o `node scripts/exportar-desde-cloudflare.mjs respaldos/<carpeta>` para incluir los archivos de R2. D1 además ofrece *Time Travel* (restaurar a cualquier minuto de los últimos 30 días).

## Monitoreo

| Qué | Cómo |
|---|---|
| Servicio vivo | `GET /healthz` (texto `ok`, sin tocar la base) y `GET /api/salud` (pasa por la API). Docker marca el contenedor `unhealthy` si `/healthz` falla 3 veces. |
| Registros | `docker compose logs -f atalaya` (una línea por petición: método, ruta, estado, duración) y `docker compose logs -f caddy` (JSON). Se rotan a 5 × 10 MB. |
| Actividad del agente | **Configuración → Registro de actividad**, buscar "agente". Cada día hábil debe aparecer "El agente cargó su reporte". La cabecera del Radar muestra la fecha del último reporte. |
| Intentos sospechosos | Registro de actividad filtrado por resultado "error" (ingresos fallidos, tokens inválidos, rechazos de Google). |
| Certificado | Caddy lo renueva solo; revisar `docker compose logs caddy` si el sitio deja de cargar por HTTPS. |

## Publicar una nueva versión

1. Haga los cambios y ejecute las pruebas: `npm test`.
2. Si cambió `site/app.js`, `site/styles.css` o `site/tema.js`, **suba el número `?v=N`** en `site/index.html` (y en `site/linea/index.html` si corresponde).
3. Si cambió el esquema, agregue una migración (ver abajo).
4. Publique:

| Entorno | Comando |
|---|---|
| Servidor propio | `cd instalacion && docker compose up -d --build atalaya` (respalde antes) |
| Cloudflare | `npx wrangler deploy` (la propagación puede tardar unos minutos) |

## Cambios en la base de datos (migraciones)

- `servidor/schema.sql` describe el esquema completo con `CREATE TABLE IF NOT EXISTS`; se aplica cada vez que la API arranca, así que **crear tablas o índices nuevos** no requiere pasos extra.
- **Modificar tablas existentes** (agregar columnas, cambiar restricciones) requiere una migración en `servidor/migraciones/NNN-descripcion.sql` y actualizar también `schema.sql` para las bases nuevas.
- Aplicar una migración:

| Entorno | Comando |
|---|---|
| Servidor propio | `docker compose exec atalaya node -e "const {DatabaseSync}=require('node:sqlite');const fs=require('fs');new DatabaseSync('/data/atalaya.db').exec(fs.readFileSync('servidor/migraciones/NNN-descripcion.sql','utf8'))"` |
| Cloudflare | `npx wrangler d1 execute atalaya-sermaluc --remote --file servidor/migraciones/NNN-descripcion.sql` |

Migraciones existentes (ya aplicadas en producción y ya incluidas en `schema.sql`): `002-modelo-relacional.sql` (paso del modelo JSON al modelo relacional) y `003-configuracion-y-auditoria.sql` (palabras clave configurables y registro de actividad).

## Pruebas automáticas

```bash
npm test
```

`servidor/pruebas.mjs` levanta la API sobre una base SQLite en memoria y un almacén de archivos temporal, y ejecuta 70 pruebas de punta a punta: activación (solo `@sermaluc.cl`, registrados, sin reactivar) e ingreso; modelo relacional sin claves foráneas rotas; estados, responsables y checklist; subida, descarga y borrado de archivos (incluido el rechazo de tipos no permitidos); carga de reportes del agente (conserva el trabajo del equipo, rechaza reportes inválidos); palabras clave y token del agente; usuarios; ingreso con Google (PKCE, dominio, `state` manipulado, tokens de otra aplicación); enlace directo a adjuntos; registro de actividad (sin guardar contraseñas); línea pública sin datos sensibles; CSRF y cierre de sesión.

El agente tiene sus propias pruebas (`cd agente && pytest -q`, 43 pruebas). Ambas se ejecutan solas en GitHub Actions con cada cambio (`.github/workflows/pruebas.yml`).

## Tareas administrativas frecuentes

| Tarea | Dónde |
|---|---|
| Agregar o quitar personas | Configuración → Usuarios (administración). |
| Persona olvidó su contraseña | Configuración → Usuarios → Restablecer acceso; luego la persona usa "Activar mi cuenta" o ingresa con Google. |
| Cambiar palabras clave del agente | Configuración → Palabras clave. Se aplican en la próxima ejecución del agente. |
| Agregar una administradora permanente | `ADMIN_EMAILS` en `instalacion/.env` + `docker compose up -d`. |
| Rotar el token del agente | Cambie `AGENT_TOKEN` en `instalacion/.env`, reinicie, y actualice `ATALAYA_TOKEN` del agente. |
| Cerrar todas las sesiones | Cambie `SESSION_SECRET` y reinicie. |

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| El contenedor se reinicia con "SESSION_SECRET debe tener al menos 32 caracteres" | Falta o es corto en `instalacion/.env`. |
| `crear-base.mjs` dice "la base ya tiene datos" | El servicio ya arrancó y registró a la administración. Repita con `--reemplazar`. |
| Atalaya no muestra el reporte del día | Revisar el registro de actividad ("agente") y los registros del agente. `401` = token distinto entre agente y servidor. |
| Botón de Google no aparece | Falta `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET`. |
| Google devuelve "redirect_uri_mismatch" | Falta el URI `https://<dominio>/api/auth/google/callback` en Google Cloud. |
| "Abrir adjuntos" lleva a la ficha y no a los adjuntos | El servidor no logra salir a `www.mercadopublico.cl` o Mercado Público no respondió en 10 s. |
| Error 413 al subir un archivo | Supera 25 MB. |
| Los cambios de diseño no se ven | Falta subir `?v=N` en `site/index.html` o el navegador tiene caché; recargar con Ctrl+F5. |
