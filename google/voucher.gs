// ==================== DETECTAR CAMBIO EN LISTA DESPLEGABLE (COLUMNA M) ====================
function onEdit(e) {
  if (!e || !e.source) return;
  
  var sheet = e.source.getActiveSheet();
  var tipoCaja = detectarTipoCaja(sheet.getName());
  
  // Solo funciona en CLIENTES
  if (tipoCaja !== 'CLIENTES') return;
  
  var range = e.range;
  var fila = range.getRow();
  var col = range.getColumn();
  var valor = e.value;
  
  if (fila <= 1) return;
  
  // Columna M (13): lista desplegable manual
  if (col === 13) {
    if (valor === 'Link') {
      generarLinkVoucher(sheet, fila);
    } else if (valor === 'Sin voucher') {
      // Limpiar enlace y estado
      sheet.getRange(fila, 14).clearContent(); // Columna N
      sheet.getRange(fila, 15).clearContent(); // Columna O
    }
  }
  
  // Columna A (1): si cambia la fecha del vale, regenerar link automáticamente
  // para que el ID refleje la nueva fecha y se considere un voucher nuevo
  if (col === 1) {
    var estadoActual = sheet.getRange(fila, 13).getValue();
    if (estadoActual === 'Link') {
      generarLinkVoucher(sheet, fila);
    }
  }
}

// ==================== GENERAR ENLACE PARA SUBIR VOUCHER ====================
function generarLinkVoucher(sheet, fila) {
  try {
    // Leer datos de la fila (columnas G a J) - sin cambios
    var dp = sheet.getRange(fila, 7).getValue() || '';      // G: DP
    var fecha = sheet.getRange(fila, 8).getValue() || '';   // H: Fecha
    var cantidad = sheet.getRange(fila, 9).getValue() || ''; // I: Cantidad
    var banco = sheet.getRange(fila, 10).getValue() || '';   // J: Banco
    
    // Leer datos adicionales para el ID
    var fechaVale = sheet.getRange(fila, 1).getValue();      // A: Fecha del vale
    var numVale = sheet.getRange(fila, 2).getValue() || '';  // B: N° Vale
    
    if (!fechaVale || !numVale) {
      SpreadsheetApp.getUi().alert('⚠️ Error', 'La fila no tiene fecha o número de vale.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // Formatear fecha para el ID
    var fechaObj = parsearFecha(fechaVale);
    if (!fechaObj) {
      SpreadsheetApp.getUi().alert('⚠️ Error', 'Fecha inválida en columna A.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    var año = fechaObj.getFullYear();
    var mes = ('0' + (fechaObj.getMonth() + 1)).slice(-2);
    var dia = fechaObj.getDate();
    var semanaDelMes = Math.ceil(dia / 7);
    
    // Construir ID único para el voucher
    var id = CONFIG.SUCURSAL + '-' + año + '-' + mes + '-W' + semanaDelMes + '-CLIENTES-F' + fila;
    
    // Construir parámetros para la URL
    var params = [
      'id=' + encodeURIComponent(id),
      'fila=' + fila,
      'sheet=' + encodeURIComponent(sheet.getName()),
      'dp=' + encodeURIComponent(dp),
      'fecha=' + encodeURIComponent(fecha),
      'cantidad=' + encodeURIComponent(cantidad),
      'banco=' + encodeURIComponent(banco),
      'sucursal=' + encodeURIComponent(CONFIG.SUCURSAL)
    ];
    var urlSubirVoucher = CONFIG.APP_BASE_URL + '/subir-voucher?' + params.join('&');
    
    // Poner enlace en columna N (14)
    sheet.getRange(fila, 14)
      .setFormula('=HYPERLINK("' + urlSubirVoucher + '"; "📎 Subir voucher")')
      .setFontColor('blue');
    
    // Limpiar columna O (15)
    sheet.getRange(fila, 15).clearContent();
    
    Logger.log('✅ Link voucher generado: ' + urlSubirVoucher);
    
  } catch (error) {
    Logger.log('❌ Error generando link voucher: ' + error.toString());
    SpreadsheetApp.getUi().alert('❌ Error', 'No se pudo generar el enlace.\n' + error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ==================== API: RECIBIR CONFIRMACIÓN DE VOUCHER SUBIDO ====================
function confirmarVoucherSubido(fila, sheetName, voucherUrl) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Hoja no encontrada: ' + sheetName);
    
    // Poner emoji en columna O (15)
    sheet.getRange(fila, 15).setValue('😎');
    
    // Actualizar enlace en N (14) para apuntar a la imagen
    sheet.getRange(fila, 14)
      .setFormula('=HYPERLINK("' + voucherUrl + '"; "📎 Ver voucher")')
      .setFontColor('green');
    
    Logger.log('✅ Voucher confirmado en fila ' + fila);
    return true;
    
  } catch (error) {
    Logger.log('❌ Error confirmando voucher: ' + error.toString());
    return false;
  }
}