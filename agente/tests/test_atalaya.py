from datetime import datetime

import atalaya
import mp_agent
from conftest import load


def fila_real():
    det = mp_agent.primer_detalle(load("real_detalle_584264-52-LP26.json"))
    return {
        "Código": "584264-52-LP26", "Nombre": det["Nombre"], "Organismo": "", "Unidad": "", "Región": "",
        "Monto estimado": det["MontoEstimado"], "Moneda": "CLP", "Publicación": "2026-10-23",
        "Cierre": "2026-11-12 15:05", "Relevancia": 7, "Palabras clave": "servicios ti, azure",
        "Descripción": "", "Link": mp_agent.FICHA.format(code="584264-52-LP26"), "_detalle": det,
    }


def test_licitacion_real_mapea_fechas_y_datos():
    l = atalaya.a_licitacion(fila_real())
    assert l["codigo"] == "584264-52-LP26"
    assert l["organismo"] == "I MUNICIPALIDAD DE INDEPENDENCIA"
    assert l["organismoCodigo"] == "99105" and l["unidadCodigo"] == "584264"
    assert l["tipo"] == "LP"
    assert l["montoEstimado"] == 148290220
    assert l["duracion"] == "24 meses"
    assert l["fechas"]["cierre"] == "2026-11-12T15:05"
    assert l["fechas"]["finPreguntas"] == "2026-10-28T18:00"
    assert l["fechas"]["respuestas"] == "2026-11-09T18:00"
    assert l["fechas"]["adjudicacion"] == "2026-12-03T18:00"
    assert "visitaTerreno" not in l["fechas"]  # viene null en la API
    assert l["palabrasClave"] == ["servicios ti", "azure"]
    assert 0 < l["match"] <= 99
    # contacto redactado en el fixture -> se usa la unidad de compras
    assert l["contacto"]["nombre"].startswith("Unidad de compras")


def test_documentos_segun_tipo():
    ids = lambda t: {d["id"]: d["obligatorio"] for d in atalaya.documentos(t)}
    assert ids("LR")["adm-garantia"] is True
    assert ids("LP")["adm-garantia"] is False
    assert "adm-garantia" not in ids("LE")
    assert all(d["tipo"] in ("Administrativo", "Técnico", "Económico") for d in atalaya.documentos("LE"))


def test_sin_cierre_se_omite_y_moneda_extranjera_sin_monto():
    f = fila_real()
    f["_detalle"] = {**f["_detalle"], "Moneda": "UTM", "Fechas": {}}
    f["Cierre"] = ""
    rep, omitidas = atalaya.armar_reporte([f], 100, ahora=datetime(2026, 11, 6, 8, 0))
    assert omitidas == ["584264-52-LP26"] and rep["licitaciones"] == []
    f["Cierre"] = "2026-11-20 15:00"
    l = atalaya.a_licitacion(f)
    assert l["montoEstimado"] == 0 and l["moneda"] == "UTM"


def test_reporte_meta():
    rep, _ = atalaya.armar_reporte([fila_real()], 5135, ahora=datetime(2026, 11, 6, 8, 0))
    assert rep["meta"]["generado"] == "2026-11-06T08:00"
    assert rep["meta"]["revisadas"] == 5135
    assert "mesa de ayuda" in rep["meta"]["palabrasClave"]
    assert len(rep["licitaciones"]) == 1


def test_publicar_no_imprime_token(monkeypatch, capsys):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example")
    monkeypatch.setenv("ATALAYA_TOKEN", "secreto-123")
    enviado = {}

    class Resp:
        ok, status_code = True, 200
        headers = {"content-type": "application/json"}
        def json(self): return {"recibidas": 1, "nuevas": 1}

    def fake_post(url, json, timeout, headers):
        enviado.update(url=url, auth=headers["authorization"], n=len(json["licitaciones"]))
        return Resp()
    monkeypatch.setattr(atalaya.requests, "post", fake_post)
    assert atalaya.publicar([fila_real()], 10)
    assert enviado == {"url": "https://atalaya.example/api/reporte", "auth": "Bearer secreto-123", "n": 1}
    assert "secreto-123" not in capsys.readouterr().out


# ---------- palabras clave desde Atalaya ----------
import pytest


@pytest.fixture
def palabras_originales():
    k, n = dict(mp_agent.KEYWORDS), dict(mp_agent.NEGATIVOS)
    yield
    mp_agent.KEYWORDS.clear(); mp_agent.KEYWORDS.update(k)
    mp_agent.NEGATIVOS.clear(); mp_agent.NEGATIVOS.update(n)


class _Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise atalaya.requests.HTTPError(str(self.status_code))

    def json(self):
        return self._d


def test_cargar_palabras_normaliza(monkeypatch):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example/")
    monkeypatch.setenv("ATALAYA_TOKEN", "t" * 30)
    pedido = {}

    def fake_get(url, timeout, headers):
        pedido.update(url=url, auth=headers["authorization"])
        return _Resp({"positivas": {"Inteligencia  de Negocios": 3, "malo": "x", "mal signo": -2},
                      "negativas": {"Impresión": -3, "positivo aquí": 2}})
    monkeypatch.setattr(atalaya.requests, "get", fake_get)
    pos, neg = atalaya.cargar_palabras()
    assert pedido == {"url": "https://atalaya.example/api/agente/palabras", "auth": "Bearer " + "t" * 30}
    assert pos == {"inteligencia de negocios": 3}
    assert neg == {"impresion": -3}


def test_agente_usa_las_palabras_de_atalaya(monkeypatch, palabras_originales):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example")
    monkeypatch.setenv("ATALAYA_TOKEN", "t" * 30)
    monkeypatch.setattr(atalaya.requests, "get", lambda *a, **k: _Resp({"positivas": {"gobierno de datos": 3}, "negativas": {"aseo": -3}}))
    assert mp_agent.usar_palabras_de_atalaya() is True
    assert mp_agent.score("Consultoría en Gobierno de Datos")[0] == 3
    assert mp_agent.score("Servicio de mesa de ayuda")[0] == 0  # ya no está en la lista
    assert mp_agent.score("Gobierno de datos y aseo")[0] == 0
    assert list(atalaya.armar_reporte([], 1)[0]["meta"]["palabrasClave"]) == ["gobierno de datos"]


def test_si_atalaya_falla_se_usan_las_del_codigo(monkeypatch, palabras_originales, capsys):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example")
    monkeypatch.setenv("ATALAYA_TOKEN", "t" * 30)

    def caido(*a, **k):
        raise atalaya.requests.ConnectionError("sin red")
    monkeypatch.setattr(atalaya.requests, "get", caido)
    antes = dict(mp_agent.KEYWORDS)
    assert mp_agent.usar_palabras_de_atalaya() is False
    assert mp_agent.KEYWORDS == antes
    assert "no se pudieron leer" in capsys.readouterr().err


def test_palabras_locales_no_consulta_atalaya(monkeypatch):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example")
    monkeypatch.setenv("ATALAYA_TOKEN", "t" * 30)
    monkeypatch.setattr(atalaya.requests, "get", lambda *a, **k: pytest.fail("no debía consultar"))
    assert mp_agent.usar_palabras_de_atalaya(locales=True) is False


def _main_simulado(monkeypatch, tmp_path, publicar):
    monkeypatch.setenv("MP_TICKET", "t")
    monkeypatch.setattr(mp_agent, "cargar_env", lambda *a: None)
    monkeypatch.setattr(mp_agent, "usar_palabras_de_atalaya", lambda *a: False)
    monkeypatch.setattr(mp_agent, "run", lambda *a, **k: ([fila_real()], 100))
    monkeypatch.setattr(mp_agent.time, "sleep", lambda s: None)
    llamadas = []
    monkeypatch.setattr(atalaya, "publicar", lambda rows, total: llamadas.append(len(rows)) or publicar(len(llamadas)))
    return llamadas, ["--atalaya", "--out", str(tmp_path / "x.xlsx"), "--vistos", str(tmp_path / "v.json")]


def test_sin_configuracion_igual_genera_excel_y_falla_al_final(monkeypatch, tmp_path):
    monkeypatch.delenv("ATALAYA_URL", raising=False)
    monkeypatch.delenv("ATALAYA_TOKEN", raising=False)
    llamadas, args = _main_simulado(monkeypatch, tmp_path, lambda n: True)
    with pytest.raises(SystemExit, match="faltan ATALAYA_URL, ATALAYA_TOKEN"):
        mp_agent.main(args)
    assert (tmp_path / "x.xlsx").exists() and llamadas == []


def test_reintenta_la_publicacion(monkeypatch, tmp_path):
    monkeypatch.setenv("ATALAYA_URL", "https://atalaya.example")
    monkeypatch.setenv("ATALAYA_TOKEN", "t" * 30)
    llamadas, args = _main_simulado(monkeypatch, tmp_path, lambda n: n >= 2)
    mp_agent.main(args)
    assert llamadas == [1, 1]
