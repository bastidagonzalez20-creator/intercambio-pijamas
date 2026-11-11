# -*- coding: utf-8 -*-
"""
===============================================================================
🎄 SCRIPT DE ENVÍO DE WHATSAPP DE ESCRITORIO - INTERCAMBIO DE PIJAMAS ($300 MXN)
===============================================================================
Este script lee la base de datos `bd_intercambio.json`, verifica (o realiza) el
sorteo para que a nadie le toque a sí mismo, y envía a cada participante por tu
WhatsApp Personal de Escritorio la información de:
  - A quién le tocó regalarle
  - Su talla de pijama pachoncita
  - Su color y/o estampado favorito
  - Su Token personal para consultar en la web y agendar en su calendario
  - El link al video de la invitación

CÓMO USARLO:
  1. Asegúrate de tener abierto tu WhatsApp de Escritorio en Windows (o WhatsApp Web).
  2. Abre una terminal en esta carpeta y ejecuta:
       python enviar_whatsapp.py
===============================================================================
"""

import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bd_intercambio.json")


def limpiar_telefono(contacto: str) -> str:
    """Convierte un número telefónico a formato internacional de México (52 + 10 dígitos)."""
    digitos = re.sub(r"\D", "", contacto or "")
    if len(digitos) == 10:
        return f"52{digitos}"
    if len(digitos) == 12 and digitos.startswith("52"):
        return digitos
    if len(digitos) == 13 and digitos.startswith("521"):
        return "52" + digitos[3:]
    return digitos


def realizar_sorteo_ciclico(participantes: list) -> None:
    """
    Algoritmo de ciclo hamiltoniano aleatorio:
    Garantiza matemáticamente que:
      1. Nadie se toque a sí mismo.
      2. Todos den y reciban exactamente una pijama pachoncita.
    """
    indices = list(range(len(participantes)))
    random.shuffle(indices)

    for k in range(len(indices)):
        dador = participantes[indices[k]]
        receptor = participantes[indices[(k + 1) % len(indices)]]
        dador["asignado_id"] = receptor.get("id")
        dador["asignado_nombre"] = receptor.get("nombre")
        dador["asignado_talla"] = receptor.get("talla")
        dador["asignado_color_estampado"] = receptor.get("color_estampado")


def construir_mensaje(participante: dict, evento: dict) -> str:
    """Construye el mensaje personalizado de WhatsApp para cada participante."""
    nombre = participante.get("nombre", "Participante")
    token = participante.get("token", "PIJAMA-0000")
    asignado = participante.get("asignado_nombre", "Por asignar")
    talla = participante.get("asignado_talla", "Por confirmar")
    estampado = participante.get("asignado_color_estampado", "Sorpresa navideña")
    presupuesto = evento.get("presupuesto_mxn", 300)
    video_url = evento.get("video_invitacion_url", "")
    sitio_url = evento.get("sitio_web_url", "")
    fecha_evento = evento.get("fecha_evento_texto", "Diciembre 2026")

    mensaje = (
        f"🎄 *¡Hola {nombre}!* 🧸✨\n\n"
        f"Ya todos contestaron el registro de nuestro *Intercambio Navideño de Pijamas Pachoncitas* "
        f"(Presupuesto: *${presupuesto} MXN*).\n\n"
        f"🤫 *AQUÍ ESTÁ TU PERSONA ASIGNADA (¡Es secreto!):*\n"
        f"🎁 *Te toca regalarle a:* *{asignado}*\n"
        f"📏 *Talla de su pijama:* {talla}\n"
        f"🎨 *Color / Estampado favorito:* {estampado}\n\n"
        f"🔑 *Tu Token personal:* `{token}`\n"
        f"📅 *Fecha del intercambio:* {fecha_evento}\n\n"
        f"🎥 *Mira el video de la invitación aquí:*\n{video_url}\n\n"
        f"📲 *Agrega el recordatorio a tu calendario o consulta tus datos en la página con tu Nombre y Token:*\n{sitio_url}"
    )
    return mensaje


def enviar_por_whatsapp_desktop(telefono: str, mensaje: str, auto_enter: bool = True) -> None:
    """
    Abre la conversación directamente en la app de WhatsApp Desktop instalada en Windows
    usando el protocolo nativo `whatsapp://send?phone=...&text=...` y opcionalmente
    presiona ENTER automáticamente para enviar el mensaje.
    """
    texto_codificado = urllib.parse.quote(mensaje)
    uri_whatsapp = f"whatsapp://send?phone={telefono}&text={texto_codificado}"

    # Abrir protocolo nativo de WhatsApp Desktop en Windows
    os.startfile(uri_whatsapp)

    if auto_enter:
        # Esperar a que WhatsApp Desktop enfoque el chat y coloque el texto
        time.sleep(4.5)
        # Usar WScript.Shell nativo de Windows para presionar ENTER en WhatsApp Desktop
        ps_cmd = (
            "$wshell = New-Object -ComObject wscript.shell; "
            "$wshell.SendKeys('~')"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=False)
        time.sleep(1.5)


def main():
    print("=" * 72)
    print("🎄 ENVÍO AUTOMÁTICO DE WHATSAPP - INTERCAMBIO DE PIJAMAS PACHONCITAS 🧸")
    print("=" * 72)

    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró el archivo de base de datos en:\n   {DB_PATH}")
        sys.exit(1)

    with open(DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    evento = db.get("evento", {})
    participantes = db.get("participantes", [])

    if len(participantes) < 2:
        print(f"⚠️ Actualmente hay {len(participantes)} participante(s) en `bd_intercambio.json`.")
        print("   Asegúrate de que al menos 2 personas (idealmente las 12-13) se hayan registrado")
        print("   o descarga el archivo actualizado `bd_intercambio.json` desde el Panel Organizador de la web.")
        sys.exit(0)

    # Verificar si ya se realizó el sorteo
    if not evento.get("sorteo_realizado") or any(not p.get("asignado_nombre") for p in participantes):
        print(f"🎲 El sorteo aún no estaba marcado como realizado. Generando sorteo para {len(participantes)} personas...")
        realizar_sorteo_ciclico(participantes)
        evento["sorteo_realizado"] = True
        evento["fecha_sorteo"] = datetime.now().isoformat()
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
        print("✅ ¡Sorteo guardado exitosamente en `bd_intercambio.json`!\n")

    print(f"📋 Total de participantes listos para envío: {len(participantes)}")
    print("-" * 72)
    for idx, p in enumerate(participantes, start=1):
        print(f"  {idx:02d}. {p.get('nombre')} ({p.get('contacto')}) | Token: {p.get('token')} -> Regala a: {p.get('asignado_nombre')}")
    print("-" * 72)

    print("\nModos de envío desde tu WhatsApp de Escritorio:")
    print("  [1] Automático (abre cada chat en WhatsApp Desktop y presiona ENTER solo)")
    print("  [2] Asistido (abre cada chat con el mensaje escrito y espera a que tú des ENTER)")
    modo = input("\nElige una opción (1 o 2) [Por defecto 1]: ").strip() or "1"
    auto_enter = modo == "1"

    print("\n⚠️ IMPORTANTE: Ten abierta tu app de WhatsApp en tu PC. Comenzando en 4 segundos...")
    time.sleep(4)

    enviados = 0
    for idx, p in enumerate(participantes, start=1):
        contacto = p.get("contacto", "")
        telefono = limpiar_telefono(contacto)

        if len(telefono) < 10:
            print(f"⏭️ [{idx}/{len(participantes)}] {p.get('nombre')}: El contacto '{contacto}' es correo o no tiene 10 dígitos. Saltando WhatsApp...")
            continue

        mensaje = construir_mensaje(p, evento)
        print(f"📲 [{idx}/{len(participantes)}] Enviando a {p.get('nombre')} (+{telefono})...")
        enviar_por_whatsapp_desktop(telefono, mensaje, auto_enter=auto_enter)
        enviados += 1

        if not auto_enter:
            input("   👉 Presiona ENTER en esta consola cuando hayas enviado el mensaje en WhatsApp para pasar al siguiente...")

    print("\n" + "=" * 72)
    print(f"🎉 ¡Listo! Se procesaron {enviados} mensajes en tu WhatsApp de Escritorio.")
    print("=" * 72)


if __name__ == "__main__":
    main()
