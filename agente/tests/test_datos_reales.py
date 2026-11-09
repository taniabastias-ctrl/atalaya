"""Tests con respuestas REALES guardadas el 2026-11-04 (datos de contacto redactados)."""
from datetime import date

import pytest

import enviar_correo
import mp_agent
from conftest import FIX, load


def test_parse_ficha_real():
    d = mp_agent.parse_ficha((FIX / "ficha_584264-52-LP26.html").read_bytes())
    assert d["Descripcion"].startswith("Contratar servicio integral de administración")
    assert d["Comprador"]["NombreOrganismo"] == "I MUNICIPALIDAD DE INDEPENDENCIA"
    assert d["Comprador"]["NombreUnidad"] == "DIRECCION DE SECPLA"
    assert d["Comprador"]["RegionUnidad"] == "Región Metropolitana de Santiago"
    assert mp_agent.fmt_fecha(d["Fechas"]["FechaCierre"]) == "2026-11-12 15:05"
    assert mp_agent.fmt_fecha(d["Fechas"]["FechaPublicacion"], 10) == "2026-10-23"


def test_parse_ficha_pagina_sin_datos():
    assert mp_agent.parse_ficha(b"<html><body>Error</body></html>") == {}


@pytest.mark.parametrize("nombre,relevante", [
    ("SERVICIOS TI ADMIN. MICROSOFT AZURE SOPORTE", True),
    ("CONSULTORÍA DE CIBERSEGURIDAD Y DATOS PERSONALES", True),
    ("ESTABILIZADOR DE SUELO TIPO QUIMICO", False),
    ("SERVICIOS GESTIONADOS DE IMPRESIÓN", False),
    ("ADQUISICION EQUIPOS Y EQUIPAMIENTO TECNOLOGÍAS DE LA INFORMACIÓN PARA CESFAM", False),
    ("IC CONVENIO SUMINISTRO INSUMOS PARA ELECTROFORESIS CON SOFTWARE", False),
])
def test_score_nombres_reales(nombre, relevante):
    assert (mp_agent.score(nombre)[0] >= 2) is relevante


def test_run_con_respuestas_reales(monkeypatch):
    def fake_api_get(params, ticket, retries=4):
        if "codigo" in params:
            return load(f"real_detalle_{params['codigo']}.json") if params["codigo"] == "584264-52-LP26" \
                else {"Cantidad": 0, "Listado": []}
        return load("real_listado_activas.json")

    monkeypatch.setattr(mp_agent, "api_get", fake_api_get)
    monkeypatch.setattr(mp_agent, "ficha_fallback", lambda code: {})
    rows, total = mp_agent.run("t", dias=1, min_score=3, hoy=date(2026, 11, 4))
    assert total == 5
    azure = next(r for r in rows if r["Código"] == "584264-52-LP26")
    assert azure["Organismo"] == "I MUNICIPALIDAD DE INDEPENDENCIA"
    assert azure["Monto estimado"] == 148290220.0
    assert azure["Moneda"] == "CLP"
    assert azure["Cierre"].startswith("2026-11-12")
    assert azure["Publicación"].startswith("2026-")
    assert rows[0]["Código"] == "584264-52-LP26"  # la más relevante primero
    assert "1436733-32-LR26" not in {r["Código"] for r in rows}  # impresión descartada


def test_cargar_env(tmp_path, monkeypatch):
    p = tmp_path / ".env"
    p.write_text('# comentario\nMP_TICKET="abc"\nOTRA=1\n', encoding="utf-8")
    monkeypatch.delenv("MP_TICKET", raising=False)
    monkeypatch.setenv("OTRA", "ya-definida")
    mp_agent.cargar_env(str(p))
    import os
    assert os.environ["MP_TICKET"] == "abc"
    assert os.environ["OTRA"] == "ya-definida"  # no pisa variables existentes


def test_armar_mensaje(tmp_path):
    xlsx = tmp_path / "x.xlsx"
    mp_agent.to_excel([], 0, str(xlsx))
    rows = [{"Código": "A", "Nombre": "Mesa de ayuda <TI>", "Organismo": "SII", "Cierre": "2026-11-20 15:00",
             "Relevancia": 6, "Link": "https://x/A", "Nueva": "Sí"},
            {"Código": "B", "Nombre": "Software", "Organismo": "TGR", "Cierre": "", "Relevancia": 2,
             "Link": "https://x/B", "Nueva": "No"}]
    msg = enviar_correo.armar_mensaje(rows, 100, str(xlsx), "a@sermaluc.cl", ["b@sermaluc.cl", "c@sermaluc.cl"],
                                      hoy=date(2026, 11, 4))
    assert msg["Subject"] == "Licitaciones TI Mercado Público 04-11-2026: 1 nuevas, 2 relevantes"
    assert msg["To"] == "b@sermaluc.cl, c@sermaluc.cl"
    html = msg.get_body(("html",)).get_content()
    assert "Mesa de ayuda &lt;TI&gt;" in html and "TGR" not in html  # solo nuevas, HTML escapado
    adj = [p for p in msg.iter_attachments()]
    assert adj[0].get_filename() == "x.xlsx"


def test_main_mail_sin_config_falla_antes_de_consultar(monkeypatch):
    monkeypatch.setenv("MP_TICKET", "t")
    for k in enviar_correo.REQUERIDAS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(mp_agent, "cargar_env", lambda *a: None)
    monkeypatch.setattr(mp_agent, "run", lambda *a, **k: pytest.fail("no debió consultar la API"))
    with pytest.raises(SystemExit):
        mp_agent.main(["--mail"])
