#!/usr/bin/env python3
"""
Agente de licitaciones Mercado Público (Chile)
- Fuente principal: API oficial (api.mercadopublico.cl) con ticket gratuito.
- Respaldo: lectura HTML de la ficha pública cuando la API no entrega detalle.
- Filtra licitaciones PUBLICADAS por palabras clave TI y genera un Excel.
- Recuerda los códigos ya vistos (vistos.json) y marca las licitaciones nuevas.

Uso:
    export MP_TICKET="tu-ticket"
    python mp_agent.py                 # licitaciones activas hoy
    python mp_agent.py --dias 3        # últimos 3 días (por fecha de publicación)
    python mp_agent.py --out salida.xlsx --solo-nuevas
Requisitos: pip install -r requirements.txt
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta

import requests
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

BASE = "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json"
FICHA = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion={code}"

# Códigos de sobrecarga: se reintenta. Cualquier otro {"Codigo": ...} sin "Listado" es un error definitivo
# (p. ej. ticket inválido) y no se reintenta, para no gastar cuota.
CODIGOS_SOBRECARGA = (10500, 10501)

# Palabra clave (sin tildes, minúsculas) -> peso. Ajustar con licitaciones reales (pendiente 3).
KEYWORDS = {
    # Servicios TI / staffing
    "staffing": 3, "outsourcing": 3, "servicios ti": 3, "tecnologias de la informacion": 3,
    "consultoria ti": 3, "servicios informaticos": 3, "servicios gestionados": 3,
    "mesa de ayuda": 3, "mesa de servicio": 3, "mesa de soporte": 3, "soporte n2": 3,
    "soporte tecnico": 2, "soporte informatico": 2,
    # Desarrollo
    "desarrollo de software": 3, "desarrollo de aplicaciones": 3, "mantencion de software": 3,
    "analista programador": 3, "programador": 2, "software": 2, "aplicacion movil": 2,
    "android": 2, "ios": 2, "java": 2, "microservicios": 2, "api": 1, "ux": 1,
    "qa": 1, "testing": 2, "arquitecto": 2, "devops": 3,
    # Integración / cloud / seguridad
    "integracion": 2, "mulesoft": 3, "cloud": 2, "azure": 2, "aws": 2,
    "ciberseguridad": 3, "seguridad informatica": 3,
    # Sector financiero
    "core bancario": 3, "banca": 2, "bancario": 2, "creditos": 1,
    # Otros
    "sistema de informacion": 2, "transformacion digital": 2, "automatizacion": 2,
    "inteligencia artificial": 2, "datos": 1, "plataforma": 1,
}

# Términos que indican que NO es un servicio TI para Sermaluc (restan puntaje).
# Vistos en licitaciones reales del 2026-11-04: impresión, insumos de laboratorio, compra de equipos.
NEGATIVOS = {
    "impresion": -3, "insumos": -3, "suministro": -2, "equipamiento": -2,
    "adquisicion equipos": -2, "adquisicion de equipos": -2, "datos personales": -1,
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def api_get(params, ticket, retries=4):
    """GET a la API. Devuelve el JSON o None. Informa el motivo del fallo por stderr."""
    params = {**params, "ticket": ticket}
    publico = {k: v for k, v in params.items() if k != "ticket"}  # nunca imprimir el ticket
    motivo = "desconocido"
    for i in range(retries):
        try:
            r = requests.get(BASE, params=params, timeout=40)
            data = r.json()
            if isinstance(data, dict) and "Codigo" in data and "Listado" not in data:
                if data["Codigo"] in CODIGOS_SOBRECARGA:
                    motivo = f"sobrecarga ({data['Codigo']})"
                    time.sleep(2 * (i + 1))
                    continue
                print(f"[error] API {publico}: Codigo {data['Codigo']} - {data.get('Mensaje', '')}",
                      file=sys.stderr)
                return None
            r.raise_for_status()
            return data
        except ValueError:
            motivo = "respuesta no es JSON"
        except requests.RequestException as e:
            motivo = f"red/HTTP: {type(e).__name__}"
        time.sleep(2 * (i + 1))
    print(f"[aviso] API {publico}: sin respuesta tras {retries} intentos ({motivo})", file=sys.stderr)
    return None


def score(text: str):
    """Puntaje = suma de pesos positivos encontrados + negativos. Devuelve (puntaje, palabras positivas)."""
    t = norm(text)

    def hits(d):
        return [(k, w) for k, w in d.items() if re.search(r"\b" + re.escape(k) + r"\b", t)]
    pos, neg = hits(KEYWORDS), hits(NEGATIVOS)
    return sum(w for _, w in pos) + sum(w for _, w in neg), [k for k, _ in pos]


def fmt_fecha(s, largo=16):
    """Normaliza fechas a 'AAAA-MM-DD HH:MM' (o 'AAAA-MM-DD' con largo=10).
    Acepta ISO de la API ('2026-11-04T15:00:00') y formato chileno de la ficha ('04-11-2026 15:00:00')."""
    s = (s or "").strip()
    if not s:
        return ""
    m = re.search(r"(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?", s)
    if m:
        d, mth, y, hh, mm = m.groups()
        s = f"{y}-{mth}-{d}" + (f" {int(hh):02d}:{mm}" if hh else "")
    return s.replace("T", " ")[:largo]


def parse_ficha(html):
    """Extrae datos de la ficha HTML pública con la misma forma que el detalle de la API.
    Ids verificados contra una ficha real el 2026-11-04."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    def txt(id_):
        el = soup.find(id=id_)
        return el.get_text(" ", strip=True) if el else ""
    d = {
        "Descripcion": txt("lblFicha1Descripcion"),
        "Comprador": {
            "NombreOrganismo": txt("lnkFicha2Razon") or txt("lblFicha2Razon"),
            "NombreUnidad": txt("lblFicha2Unidad"),
            "RegionUnidad": txt("lblFicha2Region"),
        },
        "Fechas": {
            "FechaCierre": txt("lblFicha3Cierre") or txt("lblCierre"),
            "FechaPublicacion": txt("lblFicha3Publicacion"),
        },
    }
    return d if (d["Descripcion"] or d["Fechas"]["FechaCierre"]) else {}


def ficha_fallback(code):
    """Respaldo: lee la ficha HTML pública cuando la API no entrega el detalle."""
    try:
        r = requests.get(FICHA.format(code=code), timeout=40, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        return parse_ficha(r.content)
    except Exception as e:
        print(f"[aviso] ficha {code}: {type(e).__name__}", file=sys.stderr)
        return {}


def primer_detalle(det):
    """Primer elemento de 'Listado' de una respuesta de detalle, o {} si viene vacío/None."""
    listado = (det or {}).get("Listado") or []
    return listado[0] if listado else {}


# ---------- Registro de licitaciones ya vistas (deduplicación entre ejecuciones) ----------

def cargar_vistos(path):
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        print(f"[aviso] no se pudo leer {path}; se parte de cero", file=sys.stderr)
        return {}


def guardar_vistos(path, vistos):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(vistos, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def marcar_nuevas(rows, vistos, hoy=None):
    """Agrega la columna 'Nueva' y registra en `vistos` la fecha en que se vio cada código por primera vez."""
    hoy = hoy or date.today().isoformat()
    for r in rows:
        r["Nueva"] = "Sí" if r["Código"] not in vistos else "No"
        vistos.setdefault(r["Código"], hoy)
    return rows


# ---------- Flujo principal ----------

def run(ticket, dias, min_score, min_score_nombre=2, hoy=None):
    hoy = hoy or date.today()
    results, seen = [], set()
    fechas = [hoy - timedelta(days=d) for d in range(dias)]
    # 1) Listado de activas + listado por fecha de publicación para los días pedidos
    queries = [{"estado": "activas"}] + [{"fecha": f.strftime("%d%m%Y"), "estado": "publicada"} for f in fechas]
    listado = []
    for q in queries:
        d = api_get(q, ticket)
        if not d:
            continue
        for l in d.get("Listado") or []:
            code = l.get("CodigoExterno")
            if code and code not in seen:
                seen.add(code)
                listado.append(l)
        time.sleep(0.5)
    print(f"Licitaciones únicas en listado: {len(listado)}")

    # 2) Pre-filtro por nombre (barato). Solo los candidatos gastan una consulta de detalle.
    candidatos = [l for l in listado if score(l.get("Nombre", ""))[0] >= min_score_nombre]
    print(f"Candidatas por nombre (score >= {min_score_nombre}): {len(candidatos)}")
    for l in candidatos:
        code = l["CodigoExterno"]
        d0 = primer_detalle(api_get({"codigo": code}, ticket))
        time.sleep(0.4)
        if not d0:
            d0 = ficha_fallback(code)
        full = f'{l.get("Nombre","")} {d0.get("Descripcion","")}'
        s2, k2 = score(full)
        if s2 < min_score:
            continue
        comp = d0.get("Comprador") or {}
        fechas_ = d0.get("Fechas") or {}
        results.append({
            "Código": code,
            "Nombre": l.get("Nombre", ""),
            "Organismo": comp.get("NombreOrganismo", ""),
            "Unidad": comp.get("NombreUnidad", ""),
            "Región": comp.get("RegionUnidad", ""),
            "Monto estimado": d0.get("MontoEstimado"),
            "Moneda": d0.get("Moneda", ""),
            "Publicación": fmt_fecha(fechas_.get("FechaPublicacion"), 10),
            "Cierre": fmt_fecha(fechas_.get("FechaCierre") or d0.get("FechaCierre") or l.get("FechaCierre")),
            "Relevancia": s2,
            "Palabras clave": ", ".join(k2),
            "Descripción": (d0.get("Descripcion") or "")[:500],
            "Link": FICHA.format(code=code),
        })
    # Más relevantes primero; a igual relevancia, la que cierra antes. Sin fecha de cierre, al final.
    results.sort(key=lambda r: (-r["Relevancia"], r["Cierre"] or "9999"))
    return results, len(listado)


def to_excel(rows, total, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Licitaciones"
    cols = list(rows[0].keys()) if rows else ["Código", "Nombre"]
    ws.append(cols)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3864")
    nueva_fill = PatternFill("solid", fgColor="E2EFDA")
    for r in rows:
        ws.append([r[c] for c in cols])
        if r.get("Nueva") == "Sí":
            for cell in ws[ws.max_row]:
                cell.fill = nueva_fill
    widths = {"Nombre": 55, "Organismo": 35, "Descripción": 70, "Palabras clave": 30, "Link": 40, "Nueva": 8}
    for i, c in enumerate(cols, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths.get(c, 16)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"
    if rows and "Link" in cols:
        li = cols.index("Link") + 1
        for (cell,) in ws.iter_rows(min_row=2, min_col=li, max_col=li):
            cell.hyperlink = cell.value
            cell.font = Font(color="0563C1", underline="single")

    rs = wb.create_sheet("Resumen")
    rs.append(["Generado", datetime.now().strftime("%Y-%m-%d %H:%M")])
    rs.append(["Licitaciones revisadas", total])
    rs.append(["Relevantes (TI)", len(rows)])
    rs.append(["Nuevas desde la última ejecución", sum(1 for r in rows if r.get("Nueva") == "Sí")])
    rs.append([])
    rs.append(["Top 10 por relevancia"])
    rs.cell(row=rs.max_row, column=1).font = Font(bold=True)
    for r in rows[:10]:
        rs.append([r["Código"], r["Nombre"], r["Organismo"], r["Cierre"], r.get("Nueva", "")])
    rs.column_dimensions["A"].width = 32
    rs.column_dimensions["B"].width = 60
    rs.column_dimensions["C"].width = 35
    rs.column_dimensions["D"].width = 18
    wb.save(path)


def cargar_env(path=".env"):
    """Carga variables KEY=VALOR desde un archivo .env sin pisar las ya definidas en el entorno."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8-sig") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Licitaciones TI de Mercado Público -> Excel")
    ap.add_argument("--dias", type=int, default=1)
    ap.add_argument("--min-score", type=int, default=3, help="puntaje mínimo (nombre + descripción)")
    ap.add_argument("--min-score-nombre", type=int, default=2,
                    help="puntaje mínimo del nombre para pedir el detalle (ahorra cuota de API)")
    ap.add_argument("--out", default=f"licitaciones_{date.today():%Y%m%d}.xlsx")
    ap.add_argument("--vistos", default="vistos.json", help="archivo con los códigos ya reportados")
    ap.add_argument("--solo-nuevas", action="store_true", help="incluir en el Excel solo las nuevas")
    ap.add_argument("--mail", action="store_true", help="enviar el Excel por correo (variables SMTP_*, MAIL_TO)")
    a = ap.parse_args(argv)
    cargar_env()
    t = os.environ.get("MP_TICKET")
    if not t:
        sys.exit("Falta la variable de entorno MP_TICKET (ticket de api.mercadopublico.cl)")
    if a.mail:
        import enviar_correo
        faltan = enviar_correo.config_faltante()
        if faltan:  # fallar antes de gastar cuota de API
            sys.exit(f"--mail requiere estas variables: {', '.join(faltan)}")
    rows, total = run(t, a.dias, a.min_score, a.min_score_nombre)
    if total == 0:
        # La API no respondió (o ticket inválido): fallar para que se note, en vez de enviar un informe vacío.
        sys.exit("La API no devolvió licitaciones; revisa los avisos anteriores.")
    vistos = cargar_vistos(a.vistos)
    marcar_nuevas(rows, vistos)
    if a.solo_nuevas:
        rows = [r for r in rows if r["Nueva"] == "Sí"]
    to_excel(rows, total, a.out)
    nuevas = sum(1 for r in rows if r["Nueva"] == "Sí")
    print(f"{len(rows)} relevantes ({nuevas} nuevas) de {total}. Excel: {a.out}")
    if a.mail:
        enviar_correo.enviar(rows, total, a.out)
    # Se guarda al final: si el correo falla, mañana estas licitaciones vuelven a salir como nuevas.
    guardar_vistos(a.vistos, vistos)


if __name__ == "__main__":
    main()
