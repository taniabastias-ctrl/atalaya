from datetime import date

import openpyxl
import pytest

import mp_agent
from conftest import load


# ---------- score / norm ----------

def test_score_ignora_tildes_y_mayusculas():
    s, kws = mp_agent.score("Servicio de DESARROLLO DE SOFTWARE y Mesa de Ayuda")
    assert "desarrollo de software" in kws and "mesa de ayuda" in kws
    assert s >= 6


def test_score_no_matchea_dentro_de_palabras():
    # "ios" no debe calzar dentro de "servicios"; "api" no dentro de "capitulo"
    _, kws = mp_agent.score("Servicios de aseo, capítulo 3")
    assert "ios" not in kws and "api" not in kws


def test_score_irrelevante_es_cero():
    assert mp_agent.score("Adquisición de resmas de papel")[0] == 0


# ---------- fmt_fecha ----------

@pytest.mark.parametrize("entrada,esperado", [
    ("2026-11-20T15:00:00", "2026-11-20 15:00"),
    ("20-11-2026 15:00:00", "2026-11-20 15:00"),
    ("20/11/2026 9:05", "2026-11-20 09:05"),
    ("20-11-2026", "2026-11-20"),
    ("", ""),
    (None, ""),
])
def test_fmt_fecha(entrada, esperado):
    assert mp_agent.fmt_fecha(entrada) == esperado


def test_primer_detalle_vacio_no_revienta():
    assert mp_agent.primer_detalle(load("detalle_vacio.json")) == {}
    assert mp_agent.primer_detalle(None) == {}
    assert mp_agent.primer_detalle({"Listado": None}) == {}


# ---------- api_get ----------

class FakeResp:
    def __init__(self, data, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise mp_agent.requests.HTTPError(str(self.status_code))


def test_api_get_error_de_ticket_no_reintenta(monkeypatch, capsys):
    llamadas = []
    monkeypatch.setattr(mp_agent.requests, "get",
                        lambda *a, **k: llamadas.append(k) or FakeResp(load("error_ticket.json")))
    assert mp_agent.api_get({"estado": "activas"}, "SECRETO") is None
    assert len(llamadas) == 1
    err = capsys.readouterr().err
    assert "Ticket no válido" in err and "SECRETO" not in err


def test_api_get_reintenta_en_sobrecarga(monkeypatch):
    respuestas = iter([FakeResp({"Codigo": 10500, "Mensaje": "ocupado"}), FakeResp(load("listado_activas.json"))])
    monkeypatch.setattr(mp_agent.requests, "get", lambda *a, **k: next(respuestas))
    data = mp_agent.api_get({"estado": "activas"}, "t")
    assert data["Cantidad"] == 4


# ---------- run (flujo completo con API simulada) ----------

@pytest.fixture
def api_simulada(monkeypatch):
    llamadas = []

    def fake_api_get(params, ticket, retries=4):
        llamadas.append(params)
        if "codigo" in params:
            if params["codigo"] == "1234-56-LE26":
                return load("detalle_1234-56-LE26.json")
            return load("detalle_vacio.json")
        return load("listado_activas.json")

    monkeypatch.setattr(mp_agent, "api_get", fake_api_get)
    monkeypatch.setattr(mp_agent, "ficha_fallback",
                        lambda code: {"Descripcion": "", "FechaCierre": "25-11-2026 16:00:00"})
    return llamadas


def test_run_filtra_ordena_y_usa_respaldo(api_simulada):
    rows, total = mp_agent.run("t", dias=2, min_score=3, hoy=date(2026, 11, 4))
    assert total == 4  # el mismo listado en 3 consultas se deduplica
    assert [r["Código"] for r in rows] == ["1234-56-LE26", "3333-20-LP26"]

    r0 = rows[0]
    assert r0["Organismo"] == "Servicio de Impuestos Internos"
    assert r0["Publicación"] == "2026-11-03"
    assert r0["Cierre"] == "2026-11-20 15:00"
    assert r0["Monto estimado"] == 120000000
    assert "analista programador" in r0["Palabras clave"]

    # sin detalle en la API -> fecha de la ficha HTML normalizada
    assert rows[1]["Cierre"] == "2026-11-25 16:00"


def test_run_no_pide_detalle_de_irrelevantes(api_simulada):
    mp_agent.run("t", dias=1, min_score=3, hoy=date(2026, 11, 4))
    pedidos = {p["codigo"] for p in api_simulada if "codigo" in p}
    # papel (0) y "base de datos" (1 < min_score_nombre=2) no gastan consulta de detalle
    assert pedidos == {"1234-56-LE26", "3333-20-LP26"}


def test_run_consulta_fechas_en_formato_ddmmaaaa(api_simulada):
    mp_agent.run("t", dias=2, min_score=3, hoy=date(2026, 11, 4))
    fechas = [p["fecha"] for p in api_simulada if "fecha" in p]
    assert fechas == ["04112026", "03112026"]


# ---------- deduplicación ----------

def test_marcar_nuevas_y_persistencia(tmp_path):
    path = str(tmp_path / "vistos.json")
    vistos = mp_agent.cargar_vistos(path)
    assert vistos == {}

    rows = [{"Código": "A"}, {"Código": "B"}]
    mp_agent.marcar_nuevas(rows, vistos, hoy="2026-11-03")
    assert [r["Nueva"] for r in rows] == ["Sí", "Sí"]
    mp_agent.guardar_vistos(path, vistos)

    vistos2 = mp_agent.cargar_vistos(path)
    rows2 = [{"Código": "A"}, {"Código": "C"}]
    mp_agent.marcar_nuevas(rows2, vistos2, hoy="2026-11-04")
    assert [r["Nueva"] for r in rows2] == ["No", "Sí"]
    assert vistos2["A"] == "2026-11-03"  # conserva la primera fecha en que se vio


def test_cargar_vistos_corrupto(tmp_path):
    p = tmp_path / "vistos.json"
    p.write_text("{no es json", encoding="utf-8")
    assert mp_agent.cargar_vistos(str(p)) == {}


# ---------- Excel ----------

def test_to_excel(api_simulada, tmp_path):
    rows, total = mp_agent.run("t", dias=1, min_score=3, hoy=date(2026, 11, 4))
    mp_agent.marcar_nuevas(rows, {"3333-20-LP26": "2026-11-01"})
    out = tmp_path / "out.xlsx"
    mp_agent.to_excel(rows, total, str(out))

    wb = openpyxl.load_workbook(out)
    ws = wb["Licitaciones"]
    headers = [c.value for c in ws[1]]
    assert "Nueva" in headers and "Link" in headers
    assert ws.max_row == 3
    link = ws.cell(row=2, column=headers.index("Link") + 1)
    assert link.hyperlink is not None

    rs = wb["Resumen"]
    resumen = {r[0].value: r[1].value for r in rs.iter_rows(max_row=4)}
    assert resumen["Licitaciones revisadas"] == 4
    assert resumen["Relevantes (TI)"] == 2
    assert resumen["Nuevas desde la última ejecución"] == 1


def test_to_excel_sin_resultados(tmp_path):
    out = tmp_path / "vacio.xlsx"
    mp_agent.to_excel([], 10, str(out))
    assert openpyxl.load_workbook(out)["Resumen"]["B3"].value == 0


def test_main_sin_ticket(monkeypatch):
    monkeypatch.delenv("MP_TICKET", raising=False)
    monkeypatch.setattr(mp_agent, "cargar_env", lambda *a: None)  # no leer el .env real
    with pytest.raises(SystemExit):
        mp_agent.main([])
