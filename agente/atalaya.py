"""
Publica el resultado del agente en Atalaya (radar de licitaciones de Sermaluc).

Convierte cada licitación relevante (con el detalle completo de la API de Mercado Público) al formato
que recibe Atalaya en POST /api/reporte. Variables de entorno:
    ATALAYA_URL    p. ej. https://atalaya-sermaluc.tania-bastias.workers.dev
    ATALAYA_TOKEN  token del agente (AGENT_TOKEN configurado en Atalaya)

La API de Mercado Público no entrega la lista de documentos que exigen las bases: se envía un checklist
estándar según el tipo de licitación, para validar contra las bases de cada una.
"""
import os
import sys
from datetime import datetime

import requests

from mp_agent import KEYWORDS, fmt_fecha, norm

# Fechas de la API de Mercado Público -> hitos de Atalaya
FECHAS = {
    "publicacion": ["FechaPublicacion"],
    "visitaTerreno": ["FechaVisitaTerreno"],
    "finPreguntas": ["FechaFinal"],
    "respuestas": ["FechaPubRespuestas"],
    "cierre": ["FechaCierre"],
    "aperturaTecnica": ["FechaActoAperturaTecnica"],
    "aperturaEconomica": ["FechaActoAperturaEconomica"],
    "adjudicacion": ["FechaAdjudicacion", "FechaEstimadaAdjudicacion"],
}
UNIDADES_TIEMPO = {1: "horas", 2: "días", 3: "semanas", 4: "meses", 5: "años"}
# Por ley, las licitaciones de 2.000 UTM o más (LQ, LR) exigen garantía de seriedad de la oferta.
TIPOS_CON_GARANTIA = {"LQ", "LR"}


def config_faltante():
    return [v for v in ("ATALAYA_URL", "ATALAYA_TOKEN") if not os.environ.get(v)]


def cargar_palabras(timeout=30):
    """Palabras clave configuradas en Atalaya (Configuración > Palabras clave).
    Devuelve (positivas, negativas) como {palabra_normalizada: peso}. Lanza excepción si no se pueden leer."""
    url = os.environ["ATALAYA_URL"].rstrip("/") + "/api/agente/palabras"
    r = requests.get(url, timeout=timeout, headers={"authorization": f"Bearer {os.environ['ATALAYA_TOKEN']}"})
    r.raise_for_status()
    d = r.json()

    def limpiar(dic, signo):
        out = {}
        for k, v in (dic or {}).items():
            k = " ".join(norm(str(k)).split())
            try:
                v = int(v)
            except (TypeError, ValueError):
                continue
            if k and v and (v > 0) == (signo > 0):
                out[k] = v
        return out
    pos, neg = limpiar(d.get("positivas"), 1), limpiar(d.get("negativas"), -1)
    if not pos:
        raise ValueError("Atalaya no tiene palabras clave activas que sumen")
    return pos, neg


def iso(s):
    """'2026-11-12T15:05:00' o '12-11-2026 15:05' -> '2026-11-12T15:05' (formato de Atalaya)."""
    f = fmt_fecha(s)
    return f.replace(" ", "T") if f else None


def match_pct(relevancia):
    """Puntaje del agente (3 = mínimo relevante) -> % de coincidencia que muestra Atalaya."""
    return max(0, min(99, 55 + 6 * int(relevancia or 0)))


def duracion(det):
    n, u = det.get("TiempoDuracionContrato"), det.get("UnidadTiempoDuracionContrato")
    try:
        n = int(float(n))
    except (TypeError, ValueError):
        return ""
    return f"{n} {UNIDADES_TIEMPO.get(int(u or 0), '')}".strip() if n else ""


def documentos(tipo):
    """Checklist estándar de una licitación pública en Chile. La lista definitiva está en las bases."""
    docs = [
        ("adm-bases", "Revisar bases y anexos en la ficha de Mercado Público (lista definitiva de documentos)", "Administrativo", True),
        ("adm-identificacion", "Anexo de identificación del oferente", "Administrativo", True),
        ("adm-declaracion", "Declaración jurada para ofertar (inhabilidades y conflicto de interés)", "Administrativo", True),
        ("adm-registro", "Inscripción y habilidad vigente en el Registro de Proveedores", "Administrativo", True),
    ]
    if tipo in TIPOS_CON_GARANTIA:
        docs.append(("adm-garantia", "Garantía de seriedad de la oferta", "Administrativo", True))
    elif tipo == "LP":
        docs.append(("adm-garantia", "Garantía de seriedad de la oferta (verificar si la exigen las bases)", "Administrativo", False))
    docs += [
        ("tec-oferta", "Oferta técnica según el formato de las bases", "Técnico", True),
        ("tec-experiencia", "Experiencia del oferente (certificados o listado de clientes)", "Técnico", True),
        ("tec-equipo", "Equipo de trabajo propuesto y CV", "Técnico", False),
        ("eco-oferta", "Oferta económica (formulario de las bases)", "Económico", True),
    ]
    return [{"id": i, "nombre": n, "tipo": t, "obligatorio": o} for i, n, t, o in docs]


def a_licitacion(row):
    """Fila del agente (con '_detalle' de la API) -> licitación en formato Atalaya. None si no tiene cierre."""
    det = row.get("_detalle") or {}
    f = det.get("Fechas") or {}
    fechas = {}
    for k, campos in FECHAS.items():
        for c in campos:
            v = iso(f.get(c))
            if v:
                fechas[k] = v
                break
    fechas.setdefault("cierre", iso(row.get("Cierre")))
    fechas.setdefault("publicacion", iso(row.get("Publicación")))
    fechas = {k: v for k, v in fechas.items() if v}
    if not fechas.get("cierre"):
        return None

    tipo = det.get("Tipo") or row["Código"].rsplit("-", 1)[-1][:2]
    moneda = det.get("Moneda") or row.get("Moneda") or "CLP"
    monto = det.get("MontoEstimado") or row.get("Monto estimado")
    comp = det.get("Comprador") or {}
    contacto_nombre = det.get("NombreResponsableContrato") or ""
    contacto_email = det.get("EmailResponsableContrato") or ""
    if not contacto_nombre or contacto_nombre == "REDACTADO":
        contacto_nombre, contacto_email = f"Unidad de compras · {comp.get('NombreUnidad') or row.get('Unidad', '')}", ""

    return {
        "codigo": row["Código"],
        "nombre": row["Nombre"],
        "organismo": row.get("Organismo") or comp.get("NombreOrganismo", ""),
        "unidad": row.get("Unidad") or comp.get("NombreUnidad", ""),
        "region": row.get("Región") or comp.get("RegionUnidad", ""),
        "organismoCodigo": str(comp.get("CodigoOrganismo") or "") or None,
        "unidadCodigo": str(comp.get("CodigoUnidad") or "") or None,
        "tipo": tipo,
        "montoEstimado": round(float(monto)) if monto and moneda == "CLP" else 0,
        "moneda": moneda,
        "montoOriginal": monto,
        "duracion": duracion(det),
        "publicada": fechas.get("publicacion"),
        "match": match_pct(row.get("Relevancia")),
        "palabrasClave": [k.strip() for k in (row.get("Palabras clave") or "").split(",") if k.strip()],
        "descripcion": (det.get("Descripcion") or row.get("Descripción") or "")[:4000],
        "fechas": fechas,
        "documentos": documentos(tipo),
        "criterios": [],
        "garantias": [],
        "contacto": {"nombre": contacto_nombre, "email": contacto_email},
        "url": row.get("Link"),
    }


def armar_reporte(rows, total, ahora=None):
    ahora = ahora or datetime.now()
    lics, omitidas = [], []
    for r in rows:
        l = a_licitacion(r)
        (lics if l else omitidas).append(l or r["Código"])
    reporte = {
        "meta": {
            "agente": "Agente de licitaciones Sermaluc",
            "fuente": "API Mercado Público (ChileCompra)",
            "generado": ahora.strftime("%Y-%m-%dT%H:%M"),
            "revisadas": total,
            "palabrasClave": list(KEYWORDS),
        },
        "licitaciones": lics,
    }
    return reporte, omitidas


def publicar(rows, total):
    """Envía el reporte a Atalaya. Devuelve True si se cargó. Nunca imprime el token."""
    reporte, omitidas = armar_reporte(rows, total)
    if omitidas:
        print(f"[aviso] Atalaya: sin fecha de cierre, no se envían: {', '.join(omitidas)}", file=sys.stderr)
    url = os.environ["ATALAYA_URL"].rstrip("/") + "/api/reporte"
    try:
        r = requests.post(url, json=reporte, timeout=60,
                          headers={"authorization": f"Bearer {os.environ['ATALAYA_TOKEN']}"})
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    except requests.RequestException as e:
        print(f"[error] Atalaya: {type(e).__name__}", file=sys.stderr)
        return False
    if not r.ok:
        print(f"[error] Atalaya {r.status_code}: {data.get('error', 'sin detalle')}", file=sys.stderr)
        return False
    print(f"Atalaya: {data.get('recibidas')} licitaciones cargadas ({data.get('nuevas')} nuevas en la plataforma).")
    return True
