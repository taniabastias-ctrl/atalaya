"""Envío del Excel por correo vía SMTP.

Variables de entorno (en GitHub Actions: Settings → Secrets and variables → Actions):
    SMTP_HOST      p. ej. smtp.office365.com (Microsoft 365) o smtp.gmail.com
    SMTP_PORT      587 (STARTTLS, por defecto) o 465 (SSL)
    SMTP_USER      cuenta que envía
    SMTP_PASSWORD  contraseña o "contraseña de aplicación"
    MAIL_TO        destinatarios separados por coma
    MAIL_FROM      opcional; por defecto SMTP_USER
"""
import os
import smtplib
from datetime import date
from email.message import EmailMessage
from html import escape

REQUERIDAS = ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_TO")


def config_faltante():
    return [k for k in REQUERIDAS if not os.environ.get(k)]


def armar_mensaje(rows, total, adjunto, remitente, destinatarios, hoy=None):
    hoy = hoy or date.today()
    nuevas = [r for r in rows if r.get("Nueva") == "Sí"]
    msg = EmailMessage()
    msg["Subject"] = f"Licitaciones TI Mercado Público {hoy:%d-%m-%Y}: {len(nuevas)} nuevas, {len(rows)} relevantes"
    msg["From"] = remitente
    msg["To"] = ", ".join(destinatarios)

    lineas = [f"Revisadas: {total} · Relevantes: {len(rows)} · Nuevas: {len(nuevas)}", ""]
    filas_html = []
    for r in (nuevas or rows)[:15]:
        lineas.append(f"- [{r['Relevancia']}] {r['Nombre']} — {r['Organismo']} (cierre {r['Cierre']})\n  {r['Link']}")
        filas_html.append(
            f"<tr><td>{r['Relevancia']}</td><td><a href=\"{escape(r['Link'])}\">{escape(r['Nombre'])}</a></td>"
            f"<td>{escape(r['Organismo'] or '')}</td><td>{escape(r['Cierre'] or '')}</td></tr>")
    titulo = "Nuevas" if nuevas else "Relevantes (sin nuevas hoy)"
    msg.set_content("\n".join(lineas) + "\n\nDetalle completo en el Excel adjunto.")
    msg.add_alternative(
        f"<p>Revisadas: <b>{total}</b> · Relevantes: <b>{len(rows)}</b> · Nuevas: <b>{len(nuevas)}</b></p>"
        f"<h3>{titulo} (máx. 15)</h3>"
        "<table border='1' cellpadding='4' cellspacing='0' style='border-collapse:collapse;font-family:sans-serif;font-size:13px'>"
        "<tr style='background:#1F3864;color:#fff'><th>Puntaje</th><th>Licitación</th><th>Organismo</th><th>Cierre</th></tr>"
        + "".join(filas_html) + "</table><p>Detalle completo en el Excel adjunto.</p>",
        subtype="html")
    with open(adjunto, "rb") as f:
        msg.add_attachment(f.read(), maintype="application",
                           subtype="vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                           filename=os.path.basename(adjunto))
    return msg


def enviar(rows, total, adjunto):
    faltan = config_faltante()
    if faltan:
        raise RuntimeError(f"Faltan variables para enviar correo: {', '.join(faltan)}")
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT") or 587)
    user, pwd = os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"]
    if host == "smtp.gmail.com":
        pwd = pwd.replace(" ", "")  # Google muestra la contraseña de aplicación como "abcd efgh ijkl mnop"
    destinatarios = [d.strip() for d in os.environ["MAIL_TO"].split(",") if d.strip()]
    msg = armar_mensaje(rows, total, adjunto, os.environ.get("MAIL_FROM") or user, destinatarios)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=60) as s:
            s.login(user, pwd)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=60) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
    print(f"Correo enviado a {len(destinatarios)} destinatario(s).")
