#!/usr/bin/env python3
"""
Script de inicio para el servidor PDF Generator (FastAPI + ReportLab).

Detecta automáticamente el sistema operativo (Windows/Linux),
activa el entorno virtual (.venv) e inicia el servidor.

Uso:
    python start.py                  # Inicia en 0.0.0.0:8000
    python start.py --port 8080      # Puerto personalizado
    python start.py --host 127.0.0.1 # Host personalizado

El servidor debe estar expuesto mediante un túnel (ngrok, Cloudflare, etc.)
para que el frontend pueda alcanzarlo con la URL pública configurada en
PDF_API_URL (src/data/config.ts).
"""

import os
import sys
import subprocess
import argparse
import platform
import uvicorn

# ============================================================
# 1. DETECCIÓN Y ACTIVACIÓN DEL ENTORNO VIRTUAL
# ============================================================

def get_venv_python():
    """
    Obtiene la ruta al ejecutable de Python dentro del entorno virtual.
    Según el SO, busca en la ubicación correcta.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sistema = platform.system().lower()

    if sistema == "windows":
        python_path = os.path.join(base_dir, ".venv", "Scripts", "python.exe")
    else:  # Linux / macOS
        python_path = os.path.join(base_dir, ".venv", "bin", "python3")
        if not os.path.exists(python_path):
            python_path = os.path.join(base_dir, ".venv", "bin", "python")

    return python_path


def is_inside_venv():
    """Verifica si ya estamos ejecutándonos dentro del entorno virtual."""
    # Método 1: sys.prefix vs sys.base_prefix (venv moderno Python 3.3+)
    if hasattr(sys, "real_prefix"):
        return True
    if hasattr(sys, "base_prefix") and sys.prefix != sys.base_prefix:
        return True
    # Método 2: El ejecutable contiene ".venv" en la ruta
    if ".venv" in sys.executable.lower():
        return True
    return False


def ensure_venv():
    """
    Si no estamos dentro del entorno virtual, busca el Python del .venv
    y relanza el script con él (efectivamente "activando" el venv).
    """
    if is_inside_venv():
        return  # Ya estamos dentro del venv

    sistema = platform.system().lower()
    print("=" * 60)
    print(f"  ACTIVANDO ENTORNO VIRTUAL ({sistema.upper()})...")
    print("=" * 60)

    venv_python = get_venv_python()

    if not os.path.exists(venv_python):
        print(f"  ⚠  No se encontró: {venv_python}")
        print()
        print("  ¿Quieres crear el entorno virtual ahora?")
        print("  Opciones:")
        print("    1. Crear .venv e instalar dependencias")
        print("    2. Usar el Python del sistema directamente")
        print("    3. Salir")
        print()

        choice = input("  Selecciona (1/2/3): ").strip()

        if choice == "1":
            crear_y_configurar_venv()
            venv_python = get_venv_python()
            if not os.path.exists(venv_python):
                print(f"\n  ✗ Error: No se pudo crear el entorno virtual.")
                sys.exit(1)
        elif choice == "2":
            print("\n  Usando Python del sistema...\n")
            return  # Continuar con el Python actual
        else:
            print("\n  Saliendo...")
            sys.exit(0)

    print(f"  Python del .venv: {venv_python}")
    print(f"  Relanzando script con el entorno virtual...\n")

    # Re-ejecutar este mismo script con el Python del .venv
    args = sys.argv[1:] if len(sys.argv) > 1 else []
    subprocess.check_call([venv_python, __file__] + args)
    sys.exit(0)


def crear_y_configurar_venv():
    """Crea el entorno virtual (.venv) e instala las dependencias."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    venv_dir = os.path.join(base_dir, ".venv")
    sistema = platform.system().lower()

    print("\n  Creando entorno virtual...")
    subprocess.check_call([sys.executable, "-m", "venv", venv_dir])
    print("  ✓ Entorno virtual creado.")

    # Ruta al pip del nuevo .venv según SO
    if sistema == "windows":
        pip_path = os.path.join(venv_dir, "Scripts", "pip.exe")
        python_venv = os.path.join(venv_dir, "Scripts", "python.exe")
    else:
        pip_path = os.path.join(venv_dir, "bin", "pip")
        python_venv = os.path.join(venv_dir, "bin", "python")

    print("  Actualizando pip...")
    subprocess.check_call(
        [python_venv, "-m", "pip", "install", "--upgrade", "pip"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    print("  Instalando dependencias (fastapi, uvicorn, reportlab, Pillow)...")
    subprocess.check_call(
        [pip_path, "install", "-r", os.path.join(base_dir, "requirements.txt")]
    )
    print("  ✓ Dependencias instaladas correctamente.\n")


# ============================================================
# 2. INICIO DEL SERVIDOR
# ============================================================

def check_dependencies():
    """Verifica que las dependencias necesarias estén instaladas."""
    missing = []
    try:
        import fastapi
    except ImportError:
        missing.append("fastapi")
    try:
        import uvicorn
    except ImportError:
        missing.append("uvicorn")
    try:
        import reportlab
    except ImportError:
        missing.append("reportlab")
    try:
        import PIL
    except ImportError:
        missing.append("Pillow")

    if missing:
        print("=" * 60)
        print("  FALTAN DEPENDENCIAS. Instalando...")
        print("=" * 60)
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", *missing]
        )
        print("✓ Dependencias instaladas correctamente.\n")


def print_header(host, port, reload):
    """Muestra el encabezado informativo."""
    sistema = platform.system()
    print()
    print("=" * 60)
    print("  VALE PDF GENERATOR - FastAPI + ReportLab")
    print("=" * 60)
    print()
    print(f"  Sistema:    {sistema} ({platform.release()})")
    print(f"  Python:     {sys.version.split()[0]}")
    print(f"  .venv:      {sys.prefix}")
    print(f"  Host:       {host}")
    print(f"  Puerto:     {port}")
    print(f"  Recargar:   {'Sí' if reload else 'No'}")
    print()
    print(f"  ▶ Servidor local: http://{host if host != '0.0.0.0' else 'localhost'}:{port}")
    print(f"  ▶ Documentación:  http://{host if host != '0.0.0.0' else 'localhost'}:{port}/docs")
    print()
    print("  ⚠  Asegúrate de que el túnel (ngrok/Cloudflare) apunte a este puerto")
    print("     y que PDF_API_URL en src/data/config.ts tenga la URL pública.")
    print()
    print("  Presiona Ctrl+C para detener el servidor.")
    print("=" * 60)
    print()


def start_server(host="0.0.0.0", port=8026, reload=True):
    """Inicia el servidor FastAPI con uvicorn."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(base_dir, "generated"), exist_ok=True)

    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


# ============================================================
# 3. PUNTO DE ENTRADA
# ============================================================

if __name__ == "__main__":
    # 1. Detectar SO y activar el entorno virtual si no lo está
    ensure_venv()

    # 2. Verificar e instalar dependencias si faltan
    check_dependencies()

    # 3. Parsear argumentos e iniciar servidor
    parser = argparse.ArgumentParser(description="Inicia el servidor PDF Generator")
    parser.add_argument("--host", type=str, default="0.0.0.0",
                        help="Host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8026,
                        help="Puerto (default: 8026)")
    parser.add_argument("--no-reload", action="store_true",
                        help="Desactiva recarga automática")
    args = parser.parse_args()

    print_header(args.host, args.port, not args.no_reload)
    start_server(args.host, args.port, not args.no_reload)
