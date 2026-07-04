// ==================== DETECTAR TIPO DE CAJA ====================
function detectarTipoCaja(sheetName) {
  if (!sheetName) {
    try {
      sheetName = SpreadsheetApp.getActiveSheet().getName();
    } catch (e) {
      return 'DESCONOCIDO';
    }
  }
  
  var nombre = sheetName.toUpperCase().trim();
  if (nombre.indexOf('CLIENTES') > -1) return 'CLIENTES';
  if (nombre.indexOf('OTROS GASTOS') > -1) return 'OTROS GASTOS';
  if (nombre.indexOf('CAJA CHICA') > -1) return 'CAJA CHICA';
  if (nombre.indexOf('INSTALACIONES') > -1) return 'INSTALACIONES';
  return sheetName;
}

// ==================== EXTRAER PERÍODO ====================
function extraerPeriodo() {
  var archivo = SpreadsheetApp.getActiveSpreadsheet().getName();
  var meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  
  for (var i = 0; i < meses.length; i++) {
    var mes = meses[i];
    if (archivo.toUpperCase().indexOf(mes) > -1) {
      var regex = new RegExp(mes + '\\s*(\\d{4})', 'i');
      var match = archivo.match(regex);
      if (match) return mes + ' ' + match[1];
      var regexAnio = /(\d{4})/;
      var matchAnio = archivo.match(regexAnio);
      if (matchAnio) return mes + ' ' + matchAnio[1];
      return mes;
    }
  }
  return archivo.replace('CIERRE MENSUAL ', '').replace('SM', '').trim();
}

// ==================== PARSEAR FECHA ====================
function parsearFecha(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return valor;
  }
  if (typeof valor === 'string' && valor.trim() !== '') {
    var partes = valor.trim().split(/[\/\-\.]/);
    if (partes.length === 3) {
      var dia = parseInt(partes[0], 10);
      var mes = parseInt(partes[1], 10) - 1;
      var anio = parseInt(partes[2], 10);
      var fecha = new Date(anio, mes, dia);
      if (fecha.getDate() === dia && fecha.getMonth() === mes && fecha.getFullYear() === anio) {
        return fecha;
      }
    }
  }
  return null;
}

// ==================== FORMATEAR FECHA PARA API ====================
function formatearFechaParaApi(valor) {
  var fecha = parsearFecha(valor);
  if (!fecha) return '';
  return fecha.getFullYear() + '-' + ('0' + (fecha.getMonth() + 1)).slice(-2) + '-' + ('0' + fecha.getDate()).slice(-2);
}

// ==================== ÚLTIMA FILA CON ID ====================
function ultimaFilaConId() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var maxFilas = sheet.getLastRow();
  
  for (var fila = maxFilas; fila >= 2; fila--) {
    var id = sheet.getRange(fila, COL.ID).getValue();
    if (id) return fila;
  }
  
  return 2;
}

// ==================== EXTRAER CICLO ====================
function extraerCiclo() {
  var periodo = extraerPeriodo();
  var meses = {
    'ENERO': '01', 'FEBRERO': '02', 'MARZO': '03', 'ABRIL': '04',
    'MAYO': '05', 'JUNIO': '06', 'JULIO': '07', 'AGOSTO': '08',
    'SEPTIEMBRE': '09', 'OCTUBRE': '10', 'NOVIEMBRE': '11', 'DICIEMBRE': '12'
  };
  var partes = periodo.split(' ');
  var mes = partes[0].toUpperCase();
  var año = partes[1] || new Date().getFullYear().toString();
  return año + '-' + (meses[mes] || '01');
}

// ==================== CARPETAS EN DRIVE ====================
function obtenerCarpetaPDF(periodo, sucursal, tipoCaja) {
  var archivoActual = SpreadsheetApp.getActiveSpreadsheet();
  var padres = archivoActual.getParents();
  var rootFolder = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  
  var carpeta = obtenerOCrearSubcarpeta(rootFolder, 'Vales');
  carpeta = obtenerOCrearSubcarpeta(carpeta, periodo || 'Sin periodo');
  carpeta = obtenerOCrearSubcarpeta(carpeta, sucursal || 'Sin sucursal');
  carpeta = obtenerOCrearSubcarpeta(carpeta, tipoCaja || 'General');
  return carpeta;
}

function obtenerOCrearSubcarpeta(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  else return parentFolder.createFolder(folderName);
}

function extraerUrlDeFormula(formula) {
  if (!formula) return null;
  
  try {
    var match = formula.match(/HYPERLINK\("([^"]+)"/);
    if (match && match[1]) return match[1];
    match = formula.match(/HIPERVINCULO\("([^"]+)"/);
    if (match && match[1]) return match[1];
  } catch (e) {}
  
  return null;
}
// ==================== EXTRAER PARÁMETROS DE URL ====================
function extraerParamsDeUrl(url) {
  if (!url) return null;
  
  try {
    var params = {};
    var queryString = url.split('?')[1];
    if (!queryString) return null;
    
    var pares = queryString.split('&');
    for (var i = 0; i < pares.length; i++) {
      var partes = pares[i].split('=');
      if (partes.length === 2) {
        params[decodeURIComponent(partes[0])] = decodeURIComponent(partes[1]);
      }
    }
    
    return params;
  } catch (e) {
    return null;
  }
}