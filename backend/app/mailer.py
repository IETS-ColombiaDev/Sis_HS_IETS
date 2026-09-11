"""Canal de correo institucional (P3-2 y P4-2 del backlog).

Envia la invitacion al revisor externo (RF16) y las alertas tempranas (RF20)
cuando hay un servidor SMTP configurado (`SMTP_HOST`). Sin configuracion el
envio es un no-op explicito: la plataforma sigue operando y la interfaz ofrece
copiar el enlace, que es el comportamiento previo.

Reglas del modulo:

- Un fallo de correo nunca rompe la operacion metodologica que lo origino. La
  invitacion o la alerta ya quedaron registradas en base de datos; el correo es
  un aviso adicional.
- Nada de lo que se envia se reconstruye desde texto libre del usuario sin
  escapar: el cuerpo HTML se arma con `html.escape`.
"""
from __future__ import annotations

import logging
import smtplib
import ssl
import threading
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape

from .config import settings

logger = logging.getLogger("iets.mailer")

# Registro en memoria de lo enviado, util para pruebas y diagnostico. Se acota
# para no crecer sin limite en un proceso de larga vida.
_SENT: list[dict] = []
_SENT_LIMIT = 50


@dataclass
class MailResult:
    sent: bool
    detail: str


def is_configured() -> bool:
    return bool((settings.smtp_host or "").strip())


def _sender() -> str:
    sender = (settings.smtp_from or settings.smtp_user or "").strip()
    return sender or "no-responder@iets.org.co"


def _build(to: str, subject: str, text: str, html_body: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr(("Escaneo de Horizonte IETS", _sender()))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=_sender().split("@")[-1] or "iets.org.co")
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    return msg


def _deliver(msg: EmailMessage) -> None:
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)
    timeout = 20
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return
    with smtplib.SMTP(host, port, timeout=timeout) as smtp:
        smtp.ehlo()
        if settings.smtp_tls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _remember(to: str, subject: str) -> None:
    _SENT.append({"to": to, "subject": subject})
    del _SENT[:-_SENT_LIMIT]


def send_mail(to: str, subject: str, text: str, html_body: str | None = None) -> MailResult:
    """Envio sincrono. Devuelve el resultado en lugar de lanzar excepciones."""
    to = (to or "").strip()
    if not to:
        return MailResult(False, "Sin destinatario.")
    if not is_configured():
        return MailResult(False, "SMTP no configurado: comparta el enlace manualmente.")
    try:
        _deliver(_build(to, subject, text, html_body))
    except Exception as exc:  # noqa: BLE001 - el correo nunca rompe la operacion
        logger.warning("No se pudo enviar el correo a %s: %s", to, exc)
        return MailResult(False, f"El servidor de correo rechazó el envío: {exc.__class__.__name__}.")
    _remember(to, subject)
    return MailResult(True, f"Correo enviado a {to}.")


def send_mail_async(to: str, subject: str, text: str, html_body: str | None = None) -> bool:
    """Envio en segundo plano para avisos que no deben demorar la peticion.

    Devuelve False sin crear hilo cuando no hay SMTP, de modo que el llamador
    sabe si el aviso salio por correo o solo quedo en la bandeja.
    """
    if not is_configured() or not (to or "").strip():
        return False
    thread = threading.Thread(
        target=send_mail, args=(to, subject, text, html_body), name="iets-mailer", daemon=True
    )
    thread.start()
    return True


def _layout(title: str, paragraphs: list[str], link: str = "", link_label: str = "") -> str:
    parts = "".join(f"<p style=\"margin:0 0 12px\">{escape(p)}</p>" for p in paragraphs)
    button = ""
    if link:
        button = (
            f"<p style=\"margin:20px 0\"><a href=\"{escape(link, quote=True)}\" "
            "style=\"background:#6366F1;color:#fff;padding:10px 18px;border-radius:8px;"
            f"text-decoration:none;font-weight:600\">{escape(link_label or 'Abrir')}</a></p>"
            f"<p style=\"font-size:12px;color:#64748B\">Si el botón no funciona, copie este enlace: "
            f"{escape(link)}</p>"
        )
    return (
        "<div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;color:#0F172A;max-width:560px\">"
        f"<h2 style=\"font-size:18px;margin:0 0 16px\">{escape(title)}</h2>{parts}{button}"
        "<p style=\"font-size:12px;color:#94A3B8;margin-top:24px\">Instituto de Evaluación "
        "Tecnológica en Salud (IETS) - Sistema de Escaneo de Horizonte.</p></div>"
    )


def reviewer_invitation(
    *, to: str, reviewer_name: str, doc_title: str, link: str, days: int
) -> MailResult:
    """Invitacion al revisor externo con el enlace temporal del portal (RF16)."""
    subject = f"Invitación a revisión por pares: {doc_title}"[:180]
    lines = [
        f"Hola {reviewer_name}:",
        "El IETS le invita a revisar el documento de evaluación temprana "
        f"\"{doc_title}\".",
        "Antes de leerlo deberá declarar conflicto de interés. No necesita crear "
        f"una cuenta: el enlace es personal y vence en {days} días.",
    ]
    text = "\n\n".join(lines + [f"Enlace de revisión: {link}"])
    return send_mail(to, subject, text, _layout("Revisión por pares", lines, link, "Abrir el expediente"))


def alert_notification(*, to: str, title: str, body: str, link: str = "") -> bool:
    """Alerta temprana por correo (RF20). En segundo plano; False si no hay SMTP."""
    lines = [body or title, "Consulte el detalle en la bandeja de alertas de la plataforma."]
    text = "\n\n".join([title, *lines, link]).strip()
    return send_mail_async(to, f"[Alerta IETS] {title}"[:180], text, _layout(title, lines, link, "Ver alertas"))


def sent_log() -> list[dict]:
    return list(_SENT)
