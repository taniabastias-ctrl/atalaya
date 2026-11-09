# 06 · Integración con el agente de licitaciones

El agente es un programa en Python (repositorio GitHub `taniabastias-ctrl/licitaciones-mp`, carpeta local `MPbl/mercado_publico_agent`). Atalaya no consulta Mercado Público por su cuenta: recibe lo que el agente publica.

## Ciclo diario

```mermaid
sequenceDiagram
  participant T as Programador (disparador)
  participant A as Agente (mp_agent.py)
  participant AT as Atalaya
  participant MP as API Mercado Público
  participant M as Correo
  T->>A: inicia la ejecución (días hábiles, mañana)
  A->>AT: GET /api/agente/palabras (Bearer ATALAYA_TOKEN)
  AT-->>A: palabras positivas y negativas
  A->>MP: licitaciones publicadas (ticket MP_TICKET)
  A->>A: puntaje por palabras, filtra y arma Excel
  A->>M: envía el Excel (--mail)
  A->>AT: POST /api/reporte (hasta 3 intentos)
  AT-->>A: { recibidas, nuevas }
```

- Comando: `python mp_agent.py --dias 1 --min-score 3 --out licitaciones_AAAAMMDD.xlsx --mail --atalaya`.
- `--atalaya` hace dos cosas: usa las palabras clave configuradas en Atalaya (si Atalaya no responde, usa las de su código) y publica el reporte **en cada ejecución**, aunque no haya licitaciones nuevas.
- Si falta `ATALAYA_URL` o `ATALAYA_TOKEN`, el agente igual genera el Excel y envía el correo, pero termina con código de salida 1 para que la falla se note.
- `--palabras-locales` fuerza las palabras del código (sin consultar Atalaya).

## Variables del agente

| Variable | Uso |
|---|---|
| `MP_TICKET` | Ticket de la API de Mercado Público. |
| `ATALAYA_URL` | URL de Atalaya (hoy `https://atalaya-sermaluc.tania-bastias.workers.dev`; en el servidor propio `https://<dominio>` o `http://atalaya:8080` dentro de Docker). |
| `ATALAYA_TOKEN` | Igual a `AGENT_TOKEN` del servidor Atalaya. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_TO` | Envío del correo diario. |

## Dónde se programa hoy

- El flujo de GitHub Actions del repositorio del agente se ejecuta con `workflow_dispatch`.
- Lo dispara un Worker de Cloudflare ("disparador", carpeta `disparador/` del repositorio del agente) a la hora programada.
- `ATALAYA_URL` y `ATALAYA_TOKEN` son secretos del repositorio en GitHub.

**Importante para desacoplarse de Cloudflare:** el disparador también vive en Cloudflare. Al migrar hay que elegir otro programador (ver [instalación, paso 7](07-instalacion-servidor-propio.md#paso-7--agente-de-licitaciones)): el servicio `agente` incluido en Docker Compose, un `cron` del servidor o un `schedule` de GitHub Actions.

## Formato del reporte (`POST /api/reporte`)

```json
{
  "meta": { "generado": "2026-11-06T08:00", "revisadas": 342, "fuente": "API Mercado Público",
            "agente": "mp_agent", "palabrasClave": ["mesa de ayuda", "ciberseguridad"] },
  "licitaciones": [{
    "codigo": "1509-45-LP26", "nombre": "…", "organismo": "…", "organismoCodigo": "…", "unidad": "…", "region": "…",
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

- Obligatorios por licitación: `codigo`, `nombre`, `fechas.cierre` y `documentos` (puede ser `[]`).
- Fechas en hora de Chile, formato `AAAA-MM-DDTHH:MM`.
- Máximo 2000 licitaciones y 10 MB por reporte.

## Reglas de carga

- Cada reporte queda en `reportes` con sus palabras (`reporte_palabras`) y sus licitaciones (`reporte_licitaciones`).
- Una licitación que llega por primera vez queda **NUEVA** con estado `nueva`.
- Si vuelve a llegar, se actualizan sus datos (nombre, fechas, montos, criterios, documentos informados por el agente), pero **se conservan** estado, responsable, documentos marcados, archivos, notas y los ítems del checklist agregados por el equipo.
- Organismos y unidades de compra se normalizan en sus propias tablas.

## Envío manual

```bash
AGENT_TOKEN=... ATALAYA_URL=https://atalaya.sermaluc.cl node scripts/enviar-reporte.mjs reporte.json
```
