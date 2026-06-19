import os
import sys
from pathlib import Path

def obtener_icono_archivo(nombre_archivo):
    """Devuelve un emoji según el tipo de archivo"""
    extension = os.path.splitext(nombre_archivo)[1].lower()
    
    # Iconos para diferentes tipos de archivos
    if extension in ['.mp3', '.wav', '.ogg', '.flac']:
        return '🎵'
    elif extension in ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico']:
        return '🖼️'
    elif extension in ['.db', '.sqlite', '.sqlite3']:
        return '🗄️'
    elif extension in ['.js', '.ts', '.jsx', '.tsx']:
        return '⚛️'
    elif extension in ['.py']:
        return '🐍'
    elif extension in ['.json', '.config']:
        return '📋'
    elif extension in ['.html', '.htm']:
        return '🌐'
    elif extension in ['.css', '.scss', '.sass']:
        return '🎨'
    elif extension in ['.md', '.txt']:
        return '📝'
    elif extension in ['.pdf']:
        return '📕'
    elif extension in ['.doc', '.docx']:
        return '📘'
    elif extension in ['.xls', '.xlsx']:
        return '📗'
    elif extension in ['.zip', '.rar', '.7z']:
        return '📦'
    elif extension in ['.exe', '.msi']:
        return '⚙️'
    elif extension in ['.sh', '.bat', '.cmd']:
        return '💻'
    elif extension in ['.yml', '.yaml']:
        return '⚙️'
    else:
        return '📄'

def generar_arbol_bonito(ruta_inicio, archivo_salida="estructura_bonita.txt", ignorar=None):
    """
    Genera un árbol de directorios y archivos BONITO con emojis y buena indentación
    
    Args:
        ruta_inicio: Ruta donde comenzar a escanear
        archivo_salida: Nombre del archivo de salida
        ignorar: Lista de carpetas a ignorar
    """
    if ignorar is None:
        ignorar = ['.next', 'node_modules', '__pycache__', '.git', 'dist', 'build', 
                   '.vscode', '.idea', 'coverage', '.env', 'venv', 'env', '.venv']
    
    def deberia_ignorar(ruta):
        """Verifica si la ruta debería ser ignorada"""
        nombre = os.path.basename(ruta)
        return nombre in ignorar or nombre.startswith('.')
    
    def recorrer_directorio(ruta, prefijo="", es_ultimo=True, nivel=0):
        """Recorre recursivamente el directorio y construye el árbol bonito"""
        lineas = []
        nombre_actual = os.path.basename(ruta)
        
        # Para la raíz, no agregar prefijo de conexión
        if nivel == 0:
            lineas.append(f"📁 {nombre_actual}/")
            nuevo_prefijo = "│   "
        else:
            conector = "└── " if es_ultimo else "├── "
            lineas.append(f"{prefijo}{conector}📁 {nombre_actual}/")
            
            # Actualizar prefijo para los hijos
            if es_ultimo:
                nuevo_prefijo = prefijo + "    "
            else:
                nuevo_prefijo = prefijo + "│   "
        
        # Listar contenido del directorio
        try:
            elementos = sorted(os.listdir(ruta))
        except PermissionError:
            return lineas
        
        # Filtrar elementos ignorados
        elementos = [e for e in elementos if not deberia_ignorar(os.path.join(ruta, e))]
        
        # Separar directorios y archivos (directorios primero)
        directorios = []
        archivos = []
        
        for elemento in elementos:
            ruta_elemento = os.path.join(ruta, elemento)
            if os.path.isdir(ruta_elemento):
                directorios.append(elemento)
            else:
                archivos.append(elemento)
        
        # Directorios primero, luego archivos
        elementos_ordenados = directorios + archivos
        
        # Recorrer cada elemento
        for i, elemento in enumerate(elementos_ordenados):
            ruta_elemento = os.path.join(ruta, elemento)
            es_ultimo_elemento = (i == len(elementos_ordenados) - 1)
            
            if os.path.isdir(ruta_elemento):
                # Recursivamente recorrer subdirectorio
                lineas.extend(recorrer_directorio(
                    ruta_elemento, 
                    nuevo_prefijo, 
                    es_ultimo_elemento,
                    nivel + 1
                ))
            else:
                # Agregar archivo con su icono
                icono = obtener_icono_archivo(elemento)
                conector = "└── " if es_ultimo_elemento else "├── "
                lineas.append(f"{nuevo_prefijo}{conector}{icono} {elemento}")
        
        return lineas
    
    # Obtener la ruta absoluta
    ruta_absoluta = os.path.abspath(ruta_inicio)
    
    print(f"🎨 Generando árbol bonito de: {ruta_absoluta}")
    print(f"🚫 Ignorando carpetas: {', '.join(ignorar)}")
    print("")
    
    # Generar el árbol
    lineas_arbol = recorrer_directorio(ruta_absoluta)
    
    # Guardar en archivo
    ruta_salida = os.path.join(ruta_absoluta, archivo_salida)
    
    with open(ruta_salida, 'w', encoding='utf-8') as f:
        f.write(f"📁 Estructura de directorios: {ruta_absoluta}\n")
        f.write(f"{'='*70}\n\n")
        for linea in lineas_arbol:
            f.write(linea + "\n")
        f.write(f"\n{'='*70}\n")
        f.write(f"✨ Generado por Árbol Bonito ✨\n")
    
    print(f"✅ Árbol bonito guardado en: {ruta_salida}")
    
    # También mostrar en consola
    print("\n" + "="*70)
    for linea in lineas_arbol:
        print(linea)
    print("="*70)
    print(f"\n🎉 ¡Listo! Revisa el archivo: {ruta_salida}")

def main():
    # Obtener la carpeta donde se ejecuta el script
    carpeta_actual = os.path.dirname(os.path.abspath(__file__))
    
    # Si no se encuentra (ejecutado desde la misma carpeta)
    if not carpeta_actual:
        carpeta_actual = os.getcwd()
    
    # Permitir pasar una ruta como argumento
    if len(sys.argv) > 1:
        ruta_inicio = sys.argv[1]
    else:
        ruta_inicio = carpeta_actual
    
    # Verificar que la ruta existe
    if not os.path.exists(ruta_inicio):
        print(f"❌ Error: La ruta '{ruta_inicio}' no existe")
        return
    
    # También puedes personalizar las carpetas a ignorar aquí
    carpetas_ignorar = [
        '.next', 'node_modules', '__pycache__', '.git', 
        'dist', 'build', '.vscode', '.idea', 'coverage',
        '.env', 'venv', 'env', '.venv', '.cache'
    ]
    
    # Generar el árbol bonito
    generar_arbol_bonito(ruta_inicio, "estructura_bonita.txt", carpetas_ignorar)

if __name__ == "__main__":
    print("""
    ╔══════════════════════════════════════════╗
    ║     🌳 GENERADOR DE ÁRBOL BONITO 🌳       ║
    ║    Estructura de carpetas con emojis     ║
    ╚══════════════════════════════════════════╝
    """)
    main()