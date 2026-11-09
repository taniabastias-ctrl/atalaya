# Agente de licitaciones Mercado Público

Consulta la API oficial de Mercado Público, filtra licitaciones publicadas por palabras clave TI, genera un Excel
y (opcionalmente) lo envía por correo. Recuerda las licitaciones ya reportadas (`vistos.json`) y marca en verde las nuevas.
Si la API no trae el detalle de una licitación, lo lee desde la ficha pública (web scraping de respaldo).

## Uso local (Windows / PowerShell)
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # y pega tu ticket en .env
python mp_agent.py --dias 1 --min-score 3
```
El script lee `MP_TICKET` desde `.env` automáticamente.

Opciones útiles:
- `--mail`: envía el Excel por correo (requiere las variables SMTP de abajo).
- `--solo-nuevas`: el Excel incluye solo licitaciones no reportadas antes.
- `--min-score-nombre N` (por defecto 2): puntaje mínimo del nombre para pedir el detalle a la API (ahorra cuota).
- `--vistos archivo.json`: dónde se guardan los códigos ya vistos.

## Ejecución diaria en GitHub Actions
El workflow `.github/workflows/licitaciones.yml` corre de lunes a viernes a las 06:30 hora de Chile. No usa el horario
de GitHub (se atrasaba horas): lo lanza un Worker de Cloudflare, ver [`disparador/README.md`](disparador/README.md).
También se puede lanzar a mano desde la pestaña **Actions → Run workflow**.

1. Crea un repositorio **privado** en GitHub y sube esta carpeta (el `.gitignore` ya excluye `.env`).
2. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, crea:

| Secret | Ejemplo | Nota |
|---|---|---|
| `MP_TICKET` | (tu ticket) | obligatorio |
| `SMTP_HOST` | `smtp.gmail.com` | Sermaluc usa Google Workspace |
| `SMTP_PORT` | `587` | opcional (587 por defecto; 465 = SSL) |
| `SMTP_USER` | `tania.bastias@sermaluc.cl` | cuenta que envía |
| `SMTP_PASSWORD` | (contraseña de aplicación) | ver abajo; NO la contraseña normal |
| `MAIL_TO` | `michael.ibanez@sermaluc.cl,marco.ponce@sermaluc.cl` | separados por coma |
| `MAIL_FROM` | `tania.bastias@sermaluc.cl` | opcional |

**Contraseña de aplicación de Google:** requiere tener activada la verificación en 2 pasos. Se crea en
https://myaccount.google.com/apppasswords (nombre sugerido: "Licitaciones MP"). Si la página dice que no está
disponible, el administrador de Google Workspace de Sermaluc debe permitirlas.

El Excel también queda como *artifact* de cada ejecución durante 30 días. `vistos.json` se conserva entre ejecuciones
con la caché de Actions (si pasan más de 7 días sin ejecutarse, se pierde y todas vuelven a salir como nuevas).
Si la caché está vacía (primera ejecución), se parte de `vistos_inicial.json`: las licitaciones ya enviadas
manualmente el 05-11-2026.

## Tests
```powershell
pytest
```
Usan respuestas de la API y una ficha HTML reales guardadas en `tests/fixtures/` (datos de contacto redactados);
no necesitan ticket ni internet.

Ticket gratuito: https://api.mercadopublico.cl (Clave Única → Solicitud de Ticket).

## Con Claude Code
Abre esta carpeta y ejecuta `claude`. El archivo `CLAUDE.md` contiene el contexto, las decisiones y los pendientes.
