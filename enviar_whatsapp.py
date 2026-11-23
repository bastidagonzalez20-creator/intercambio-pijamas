# -*- coding: utf-8 -*-
"""
===============================================================================
🎄 SCRIPT DE ENVÍO DE WHATSAPP DE ESCRITORIO - INTERCAMBIO DE PIJAMAS ($300 MXN)
===============================================================================
Este script carga automáticamente la configuración y llaves desde el archivo
`.env` (y también acepta banderas por línea de comandos), descarga los
participantes desde la Base de Datos en la Nube (`CLOUD_DB_URL`), guarda una
copia local en `bd_intercambio.json`, realiza el sorteo si aún no se ha hecho
y envía los mensajes personalizados desde tu WhatsApp Personal de Escritorio.

EJEMPLOS DE USO:
  1. Usando todo lo configurado en `.env`:
       python enviar_whatsapp.py

  2. Pasando banderas opcionales por consola:
       python enviar_whatsapp.py --min 13 --max 20 --modo 1
===============================================================================
"""

import argparse
import base64
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
DB_PATH = os.path.join(BASE_DIR, "bd_intercambio.json")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def cargar_dotenv(ruta_env: str) -> dict:
    """Lee el archivo .env sin requerir librerías externas."""
    variables = {}
    if not os.path.exists(ruta_env):
        return variables
    with open(ruta_env, "r", encoding="utf-8") as f:
        for linea in f:
            limpia = linea.strip()
            if not limpia or limpia.startswith("#") or "=" not in limpia:
                continue
            clave, valor = limpia.split("=", 1)
            clave = clave.strip()
            valor = valor.strip().strip('"').strip("'")
            variables[clave] = valor
    return variables


ENV_VARS = cargar_dotenv(ENV_PATH)


def obtener_argumentos():
    """Combina las variables del archivo .env con banderas de consola opcionales."""
    parser = argparse.ArgumentParser(
        description="Envía los resultados del Intercambio de Pijamas por WhatsApp Desktop."
    )
    default_url = ENV_VARS.get("CLOUD_DB_URL", "")
    default_key = ENV_VARS.get("CLOUD_DB_OBJECT_NAME", "")

    parser.add_argument(
        "--db-url",
        default=default_url,
        help="URL base de la Base de Datos en la nube (leído de CLOUD_DB_URL en .env)",
    )
    parser.add_argument(
        "--db-name",
        default=default_key,
        help="AppKey en la BD en la nube (leído de CLOUD_DB_OBJECT_NAME en .env)",
    )
    parser.add_argument(
        "--pin",
        default=ENV_VARS.get("ADMIN_PIN", ""),
        help="NIP de administrador (leído de ADMIN_PIN en .env)",
    )
    parser.add_argument(
        "--min",
        type=int,
        default=int(ENV_VARS.get("MIN_PARTICIPANTES", "13")),
        help="Mínimo de participantes esperados",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=int(ENV_VARS.get("MAX_PARTICIPANTES", "20")),
        help="Máximo de participantes permitidos",
    )
    parser.add_argument(
        "--codigo-pais",
        default=ENV_VARS.get("CODIGO_PAIS_WA", "52"),
        help="Código de país para WhatsApp (ej. 52 para México)",
    )
    parser.add_argument(
        "--espera",
        type=float,
        default=float(ENV_VARS.get("TIEMPO_ESPERA_WA_SEG", "4.5")),
        help="Segundos de espera al abrir cada chat en WhatsApp Desktop",
    )
    parser.add_argument(
        "--modo",
        choices=["1", "2"],
        default=None,
        help="Modo de envío: 1=Automático (Enter solo), 2=Asistido (esperar confirmación)",
    )
    parser.add_argument(
        "--forzar-sorteo",
        action="store_true",
        help="Fuerza a rehacer el sorteo aunque ya estuviera realizado",
    )
    return parser.parse_args()


def codificar_participante_b64(p: dict, assigned_idx: int) -> str:
    """Codifica un participante en Base64url compacto (<= 190 chars)."""
    max_gusto = 55
    while max_gusto >= 10:
        arr = [
            (p.get("nombre") or "")[:28],
            (p.get("talla") or "M")[:14],
            (p.get("color_estampado") or "")[:max_gusto],
            "e" if p.get("tipo_contacto") == "email" else "w",
            (p.get("contacto") or "")[:30],
            p.get("token") or "PIJAMA-0000",
            assigned_idx if isinstance(assigned_idx, int) else -1,
        ]
        raw = json.dumps(arr, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
        if len(b64) <= 190:
            return b64
        max_gusto -= 10
    return "W10"


def decodificar_participante_b64(b64_str: str, idx: int) -> dict:
    """Decodifica un participante desde Base64url."""
    limpio = (b64_str or "").strip().strip('"')
    if not limpio:
        return None
    pad = "=" * ((4 - len(limpio) % 4) % 4)
    raw = base64.urlsafe_b64decode(limpio + pad).decode("utf-8")
    arr = json.loads(raw)
    if not isinstance(arr, list) or len(arr) < 6:
        return None
    return {
        "id": f"P{idx + 1}",
        "nombre": arr[0] or "",
        "talla": arr[1] or "M",
        "color_estampado": arr[2] or "",
        "tipo_contacto": "email" if arr[3] == "e" else "whatsapp",
        "contacto": arr[4] or "",
        "token": arr[5] or "",
        "_assigned_idx": arr[6] if len(arr) > 6 and isinstance(arr[6], int) else -1,
        "asignado_id": None,
        "asignado_nombre": None,
        "asignado_talla": None,
        "asignado_color_estampado": None,
    }


def descargar_bd_nube(cloud_url: str, app_key: str) -> dict:
    """Descarga la base de datos compartida desde KeyVal Cloud y actualiza bd_intercambio.json local."""
    db_local = {"evento": {}, "participantes": []}
    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, "r", encoding="utf-8") as f:
                db_local = json.load(f)
        except Exception:
            pass

    base = cloud_url.rstrip("/")
    try:
        req_meta = urllib.request.Request(
            f"{base}/GetValue/{app_key}/meta",
            headers={"User-Agent": USER_AGENT},
            method="GET",
        )
        with urllib.request.urlopen(req_meta, timeout=10) as res:
            meta_raw = res.read().decode("utf-8").strip().strip('"')
            partes = meta_raw.split("_")
            sorteo_flag = partes[0] == "1"
            total_count = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else 0

            db_local.setdefault("evento", {})["sorteo_realizado"] = sorteo_flag
            lista = []
            for i in range(1, total_count + 1):
                req_p = urllib.request.Request(
                    f"{base}/GetValue/{app_key}/p_{i}",
                    headers={"User-Agent": USER_AGENT},
                    method="GET",
                )
                with urllib.request.urlopen(req_p, timeout=10) as rp:
                    b64_val = rp.read().decode("utf-8")
                    p_obj = decodificar_participante_b64(b64_val, i - 1)
                    if p_obj:
                        lista.append(p_obj)

            for p in lista:
                a_idx = p.pop("_assigned_idx", -1)
                if 0 <= a_idx < len(lista):
                    target = lista[a_idx]
                    p["asignado_id"] = target["id"]
                    p["asignado_nombre"] = target["nombre"]
                    p["asignado_talla"] = target["talla"]
                    p["asignado_color_estampado"] = target["color_estampado"]

            db_local["participantes"] = lista
            with open(DB_PATH, "w", encoding="utf-8") as f:
                json.dump(db_local, f, ensure_ascii=False, indent=2)
            print(f"☁️  Base de datos sincronizada desde la nube ({len(lista)} registrados).")
            return db_local
    except Exception as e:
        print(f"⚠️  No se pudo conectar a la nube ({e}). Leyendo archivo local `bd_intercambio.json`...")

    return db_local


def subir_bd_nube(db: dict, cloud_url: str, app_key: str) -> None:
    """Guarda los participantes y el estado del sorteo tanto en local como en KeyVal Cloud."""
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    base = cloud_url.rstrip("/")
    participantes = db.get("participantes", [])

    try:
        for idx, p in enumerate(participantes):
            assigned_idx = -1
            if p.get("asignado_nombre"):
                for j, other in enumerate(participantes):
                    if (other.get("nombre") or "").strip().lower() == (p.get("asignado_nombre") or "").strip().lower():
                        assigned_idx = j
                        break

            b64 = codificar_participante_b64(p, assigned_idx)
            req_p = urllib.request.Request(
                f"{base}/UpdateValue/{app_key}/p_{idx + 1}/{b64}",
                data=b"",
                headers={"User-Agent": USER_AGENT},
                method="POST",
            )
            with urllib.request.urlopen(req_p, timeout=10) as _:
                pass

        sorteo_bit = "1" if db.get("evento", {}).get("sorteo_realizado") else "0"
        meta_val = f"{sorteo_bit}_{len(participantes)}"
        req_meta = urllib.request.Request(
            f"{base}/UpdateValue/{app_key}/meta/{meta_val}",
            data=b"",
            headers={"User-Agent": USER_AGENT},
            method="POST",
        )
        with urllib.request.urlopen(req_meta, timeout=10) as _:
            print("☁️  Resultados del sorteo sincronizados en la nube para consulta web.")
    except Exception as e:
        print(f"⚠️  Se guardó en local, pero no se pudo subir a la nube: {e}")


def limpiar_telefono(contacto: str, codigo_pais: str = "52") -> str:
    """Convierte un número telefónico a formato internacional (ej. 52 + 10 dígitos)."""
    digitos = re.sub(r"\D", "", contacto or "")
    if len(digitos) == 10:
        return f"{codigo_pais}{digitos}"
    if len(digitos) == 12 and digitos.startswith(codigo_pais):
        return digitos
    if len(digitos) == 13 and digitos.startswith(f"{codigo_pais}1"):
        return codigo_pais + digitos[3:]
    return digitos


def realizar_sorteo_ciclico(participantes: list) -> None:
    """Algoritmo de ciclo hamiltoniano aleatorio: nadie se toca a sí mismo."""
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
    """Construye el mensaje personalizado de WhatsApp con Enlace Mágico (sin spoilers en tu chat)."""
    nombre = participante.get("nombre", "Participante")
    token = participante.get("token", "PIJAMA-0000")
    sitio_url = evento.get(
        "sitio_web_url",
        ENV_VARS.get("SITIO_WEB_URL", "https://bastidagonzalez20-creator.github.io/intercambio-pijamas/"),
    )
    sitio_base = sitio_url.split("?")[0].rstrip("/") + "/"
    magic_url = f"{sitio_base}?nombre={urllib.parse.quote(nombre)}&token={urllib.parse.quote(token)}"

    mensaje = (
        f"¡Hola {nombre}! Los duendes ya hicieron su magia y tenemos los resultados del Intercambio de Pijamas 🧸💤\n"
        f"🔑 Tu Token es: {token} 🎁 Toca tu enlace secreto para descubrir en la página a quién te tocó regalarle: {magic_url}\n"
        f"🥂 ¡NOS VEMOS EN LA CENA NAVIDEÑA! 🎅"
    )
    return mensaje


def enviar_por_whatsapp_desktop(telefono: str, mensaje: str, auto_enter: bool = True, espera: float = 4.5) -> None:
    """Abre la conversación en WhatsApp Desktop en Windows y opcionalmente presiona ENTER."""
    texto_codificado = urllib.parse.quote(mensaje)
    uri_whatsapp = f"whatsapp://send?phone={telefono}&text={texto_codificado}"

    os.startfile(uri_whatsapp)

    if auto_enter:
        time.sleep(espera)
        ps_cmd = (
            "$wshell = New-Object -ComObject wscript.shell; "
            "$wshell.SendKeys('~')"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=False)
        time.sleep(1.5)


def main():
    args = obtener_argumentos()

    print("=" * 72)
    print("🎄 ENVÍO AUTOMÁTICO DE WHATSAPP - INTERCAMBIO DE PIJAMAS PACHONCITAS 🧸")
    print("=" * 72)
    print(f"🔗 BD Nube : {args.db_url}/GetValue/{args.db_name}/meta")
    print(f"👥 Rango   : Mínimo {args.min} | Máximo {args.max} participantes")
    print("-" * 72)

    db = descargar_bd_nube(args.db_url, args.db_name)
    evento = db.get("evento", {})
    evento["min_participantes"] = args.min
    evento["max_participantes"] = args.max
    evento.pop("admin_pin", None)
    participantes = db.get("participantes", [])

    if len(participantes) < 2:
        print(f"⚠️ Actualmente hay {len(participantes)} participante(s) registrados en la nube.")
        print("   Asegúrate de que al menos 2 personas se hayan registrado en el sitio web.")
        sys.exit(0)

    if len(participantes) < args.min:
        resp = input(
            f"⚠️ Hay {len(participantes)} registrados y el mínimo en .env es {args.min}. ¿Deseas continuar de todos modos? (s/n): "
        ).strip().lower()
        if resp != "s":
            sys.exit(0)

    if args.forzar_sorteo or not evento.get("sorteo_realizado") or any(not p.get("asignado_nombre") for p in participantes):
        print(f"🎲 Generando sorteo para {len(participantes)} personas...")
        realizar_sorteo_ciclico(participantes)
        evento["sorteo_realizado"] = True
        evento["fecha_sorteo"] = datetime.now().isoformat()
        subir_bd_nube(db, args.db_url, args.db_name)
        print("✅ ¡Sorteo guardado exitosamente en `bd_intercambio.json` y en la nube!\n")

    print(f"📋 Total de participantes listos para envío: {len(participantes)}")
    print("-" * 72)
    for idx, p in enumerate(participantes, start=1):
        print(f"  {idx:02d}. {p.get('nombre')} ({p.get('contacto')}) | Token: {p.get('token')} -> Enlace secreto listo 🤫 (Sin spoilers)")
    print("-" * 72)

    if args.modo:
        modo = args.modo
    else:
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
        telefono = limpiar_telefono(contacto, args.codigo_pais)

        if len(telefono) < 10:
            print(f"⏭️ [{idx}/{len(participantes)}] {p.get('nombre')}: El contacto '{contacto}' es correo o no tiene 10 dígitos. Saltando WhatsApp...")
            continue

        mensaje = construir_mensaje(p, evento)
        print(f"📲 [{idx}/{len(participantes)}] Enviando a {p.get('nombre')} (+{telefono})...")
        enviar_por_whatsapp_desktop(telefono, mensaje, auto_enter=auto_enter, espera=args.espera)
        enviados += 1

        if not auto_enter:
            input("   👉 Presiona ENTER en esta consola cuando hayas enviado el mensaje en WhatsApp para pasar al siguiente...")

    print("\n" + "=" * 72)
    print(f"🎉 ¡Listo! Se procesaron {enviados} mensajes en tu WhatsApp de Escritorio.")
    print("=" * 72)


if __name__ == "__main__":
    main()
