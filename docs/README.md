# Atalaya · Documentación técnica

Atalaya es la plataforma web donde el equipo comercial de Sermaluc ve, reparte y sigue las licitaciones de Mercado Público que detecta cada mañana el agente de licitaciones.

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](01-arquitectura.md) | Componentes, flujos, estructura del repositorio y las dos formas de ejecución (Cloudflare y servidor propio). |
| [02 · Modelo de datos](02-modelo-de-datos.md) | Diagrama entidad-relación y descripción de las 21 tablas. |
| [03 · API](03-api.md) | Referencia de todos los endpoints HTTP: autenticación, permisos, cuerpos y respuestas. |
| [04 · Seguridad](04-seguridad.md) | Autenticación, sesiones, Google OAuth, permisos, protección de la API, auditoría y riesgos conocidos. |
| [05 · Interfaz](05-interfaz.md) | Organización del frontend, vistas, actualización en vivo, línea de tiempo pública y estilo. |
| [06 · Integración con el agente](06-agente.md) | Cómo el agente publica su reporte y descarga las palabras clave. Formato del reporte. |
| [07 · Instalación en servidores de Sermaluc](07-instalacion-servidor-propio.md) | Paso a paso para instalar Atalaya en la nube de Sermaluc con Docker, migrar los datos desde Cloudflare y desconectarla de Cloudflare. |
| [08 · Operación y mantenimiento](08-operacion.md) | Respaldos, monitoreo, actualizaciones, migraciones de esquema, pruebas automáticas y solución de problemas. |

## Resumen técnico

| Aspecto | Detalle |
|---|---|
| Lenguaje | JavaScript (ES2022, módulos ES) en servidor y navegador. |
| Dependencias en ejecución | Ninguna. Solo Node.js 24 (incluye `node:sqlite`) o Cloudflare Workers. `wrangler` es solo herramienta de despliegue. |
| Base de datos | SQLite (archivo en el servidor propio) o Cloudflare D1 (SQLite administrado). Mismo `servidor/schema.sql`. |
| Archivos subidos | Disco local (servidor propio) o Cloudflare R2. Misma interfaz. |
| Frontend | HTML + CSS + JavaScript sin frameworks ni compilación. |
| Autenticación | Contraseña (PBKDF2) o Google OAuth 2.0 / OpenID Connect, solo cuentas `@sermaluc.cl` registradas. |
| Pruebas | `npm test` (70 pruebas de integración de la API sobre SQLite en memoria). |
| Agente | Python (repositorio `licitaciones-mp`), publica con `POST /api/reporte` y token propio. |
