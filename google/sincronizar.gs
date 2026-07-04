// ==================== ACTUALIZAR FILA OTRAS CAJAS ====================
function actualizarFilaDesdeApi(sheet, fila, vale, numVale) {
  if (!vale) {
    Logger.log('   ❌ actualizarFilaDesdeApi: vale es undefined o null en fila ' + fila);
    return;
  }
  
  Logger.log('   🔄 actualizarFilaDesdeApi: fila=' + fila + ', firmado=' + vale.firmado + ', pdfUrl=' + (vale.pdfUrl ? 'SÍ' : 'NO') + ', comprobante=' + (vale.comprobante ? 'SÍ' : 'NO'));
  
  if (vale.firmado) {
    sheet.getRange(fila, COL.ESTADO).setValue('✅ Firmado');
    Logger.log('   ✅ Columna H actualizada: Firmado');
    
    if (vale.pdfUrl) {
      sheet.getRange(fila, COL.ENLACE_VALE)
        .setFormula('=HYPERLINK("' + vale.pdfUrl + '"; "🔗 Ver vale firmado #' + numVale + '")');
      Logger.log('   ✅ Columna I actualizada');
    } else {
      Logger.log('   ⚠️ No hay pdfUrl, columna I sin cambios');
    }
  } else if (vale.motivoOmitido) {
    sheet.getRange(fila, COL.ESTADO).setValue('⚠️ Omitido: ' + vale.motivoOmitido);
    Logger.log('   ⚠️ Columna H actualizada: Omitido');
  } else {
    sheet.getRange(fila, COL.ESTADO).setValue('⏳ Pendiente');
    Logger.log('   ⏳ Columna H actualizada: Pendiente');
  }
  
  if (vale.comprobante) {
    sheet.getRange(fila, COL.COMPROBANTE)
      .setValue('✅ Comprobante OK')
      .setFontColor('green');
    Logger.log('   ✅ Columna J actualizada: Comprobante OK');
  } else {
    // Si no tiene comprobante, dejarlo como pendiente (pero solo si no estaba ya en OK)
    var comprobanteActual = String(sheet.getRange(fila, COL.COMPROBANTE).getValue() || '');
    if (comprobanteActual.indexOf('✅') === -1) {
      sheet.getRange(fila, COL.COMPROBANTE)
        .setValue('🔴 Pendiente')
        .setFontColor('red');
      Logger.log('   🔴 Columna J: Pendiente (sin comprobante)');
    }
  }
}

// ==================== ACTUALIZAR FILA CLIENTES ====================
function actualizarFilaClientesDesdeApi(sheet, fila, vale, numVale) {
  if (!vale) {
    Logger.log('   ❌ actualizarFilaClientesDesdeApi: vale es undefined o null en fila ' + fila);
    return;
  }
  
  Logger.log('   🔄 actualizarFilaClientesDesdeApi: fila=' + fila + ', firmado=' + vale.firmado + ', comprobante=' + (vale.comprobante ? 'SÍ' : 'NO'));
  
  if (vale.firmado && vale.comprobante) {
    sheet.getRange(fila, 6)
      .setFormula('=HYPERLINK("' + (vale.pdfUrl || '') + '"; "🔗 Vale firmado #' + numVale + '")')
      .setFontColor('green');
    Logger.log('   ✅ Columna F actualizada: Verde (firmado con comprobante)');
  } else if (vale.firmado) {
    sheet.getRange(fila, 6)
      .setFormula('=HYPERLINK("' + (vale.pdfUrl || '') + '"; "🔗 Firmado (sin ticket)")')
      .setFontColor('blue');
    Logger.log('   ✅ Columna F actualizada: Azul (firmado sin comprobante)');
  } else {
    Logger.log('   ⏳ No firmado, columna F sin cambios');
  }
}

// ==================== FUNCIÓN BASE PARA LLAMADAS BATCH ====================
//
// Hace UNA SOLA llamada a /api/estado/batch con todos los IDs pendientes,
// en lugar de hacer una llamada por fila. Reduce el consumo de UrlFetch
// de N llamadas a 1 sola llamada.
//
function consultarBatch(ids) {
  if (!ids || ids.length === 0) return {};
  
  Logger.log('📦 Consulta batch: ' + ids.length + ' IDs en 1 llamada');
  
  var urlBatch = CONFIG.APP_API_URL.replace(/\/?$/, '') + '/batch';
  var payload = {
    ids: ids
  };
  
  try {
    var response = UrlFetchApp.fetch(urlBatch, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      if (data && data.resultados) {
        Logger.log('📦 Batch completado: ' + Object.keys(data.resultados).length + ' resultados');
        return data.resultados;
      }
    } else {
      Logger.log('❌ Batch HTTP ' + response.getResponseCode());
    }
  } catch (err) {
    Logger.log('❌ Error en consulta batch: ' + err.toString());
  }
  
  return {};
}

// ==================== SINCRONIZAR PENDIENTES (BATCH - 1 SOLA LLAMADA) ====================
function sincronizarPendientes() {
  Logger.log('🚀 INICIO sincronizarPendientes (BATCH)');
  
  var hojas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var totalActualizados = 0;
  var totalPendientes = 0;
  var totalErrores = 0;
  
  Logger.log('📊 Total hojas: ' + hojas.length);
  
  // ===== PASO 1: RECOLECTAR TODOS LOS IDs PENDIENTES (lectura única de hoja) =====
  var solicitudes = []; // { sheet, fila, id, numVale, esClientes }
  
  for (var h = 0; h < hojas.length; h++) {
    var sheet = hojas[h];
    var tipoCaja = detectarTipoCaja(sheet.getName());
    var esClientes = (tipoCaja === 'CLIENTES');
    
    Logger.log('📂 Hoja: ' + sheet.getName() + ' | Tipo: ' + tipoCaja);
    
    if (tipoCaja === 'DESCONOCIDO') {
      Logger.log('   ⏭️ Saltando hoja DESCONOCIDO');
      continue;
    }
    
    var ultimaFila = sheet.getLastRow();
    if (ultimaFila <= 1) {
      Logger.log('   ⏭️ Hoja vacía');
      continue;
    }
    
    for (var fila = 2; fila <= ultimaFila; fila++) {
      var formulaEnlace = '';
      var numVale = '';
      
      if (esClientes) {
        try {
          formulaEnlace = sheet.getRange(fila, 6).getFormula();
          var colorEnlace = sheet.getRange(fila, 6).getFontColor();
          numVale = sheet.getRange(fila, 2).getValue();
        } catch (e) { continue; }
        if (!formulaEnlace) continue;
        if (colorEnlace === '#00ff00' || colorEnlace === 'green') continue;
      } else {
        try {
          formulaEnlace = sheet.getRange(fila, COL.ENLACE_VALE).getFormula();
          numVale = sheet.getRange(fila, COL.NUM_VALE).getValue();
        } catch (e) { continue; }
        if (!formulaEnlace) continue;
        
        // Saltar si ya está completamente procesado
        try {
          var estadoActual = String(sheet.getRange(fila, COL.ESTADO).getValue() || '');
          var comprobanteActual = String(sheet.getRange(fila, COL.COMPROBANTE).getValue() || '');
          if ((estadoActual.indexOf('✅ Firmado') > -1 && comprobanteActual.indexOf('✅') > -1) || 
              estadoActual.indexOf('⚠️ Omitido') > -1) continue;
        } catch (e) {}
      }
      
      var urlEnlace = extraerUrlDeFormula(formulaEnlace);
      if (!urlEnlace) continue;
      
      var paramsDeUrl = extraerParamsDeUrl(urlEnlace);
      if (!paramsDeUrl || !paramsDeUrl.id) continue;
      
      solicitudes.push({
        sheet: sheet,
        fila: fila,
        id: paramsDeUrl.id,
        numVale: numVale,
        esClientes: esClientes
      });
    }
  }
  
  Logger.log('📋 Total filas pendientes: ' + solicitudes.length);
  
  if (solicitudes.length === 0) {
    Logger.log('🏁 No hay pendientes');
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Sin pendientes', 'Sincronización', 3);
    return;
  }
  
  // ===== PASO 2: UNA SOLA LLAMADA BATCH =====
  var todosLosIds = [];
  for (var i = 0; i < solicitudes.length; i++) {
    todosLosIds.push(solicitudes[i].id);
  }
  
  var resultados = consultarBatch(todosLosIds);
  
  // ===== PASO 3: PROCESAR RESULTADOS Y ACTUALIZAR HOJAS =====
  for (var i = 0; i < solicitudes.length; i++) {
    var sol = solicitudes[i];
    var estado = resultados[sol.id];
    
    if (!estado || estado.error) {
      Logger.log('   ⏭️ Fila ' + sol.fila + ': sin datos');
      totalPendientes++;
      continue;
    }
    
    if (estado.firmado) {
      Logger.log('   🎯 ¡FIRMADO! Fila ' + sol.fila + ' | ID: ' + sol.id.substring(0, 30) + '...');
      if (sol.esClientes) {
        actualizarFilaClientesDesdeApi(sol.sheet, sol.fila, estado, sol.numVale);
      } else {
        actualizarFilaDesdeApi(sol.sheet, sol.fila, estado, sol.numVale);
      }
      totalActualizados++;
    } else {
      if (!sol.esClientes) {
        try {
          var estAct = String(sol.sheet.getRange(sol.fila, COL.ESTADO).getValue() || '');
          if (estAct.indexOf('⏳') === -1 && estAct.indexOf('✅') === -1) {
            sol.sheet.getRange(sol.fila, COL.ESTADO).setValue('⏳ Pendiente');
          }
        } catch (e) {}
      }
      totalPendientes++;
    }
  }
  
  Logger.log('🏁 FINAL: ' + totalActualizados + ' act, ' + totalPendientes + ' pend, ' + totalErrores + ' err');
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ ' + totalActualizados + ' act | ⏳ ' + totalPendientes + ' pend | ❌ ' + totalErrores + ' err',
    'Sincronización Batch',
    5
  );
}

// ==================== SINCRONIZAR TODAS LAS FILAS (BATCH - 1 SOLA LLAMADA) ====================
// Versión batch: recolecta todos los IDs y los consulta en 1 sola llamada.
function sincronizarCicloCompleto() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var tipoCaja = detectarTipoCaja(sheet.getName());
  var esClientes = (tipoCaja === 'CLIENTES');
  var ultimaFila = esClientes ? sheet.getLastRow() : ultimaFilaConId();
  var actualizados = 0;
  var ignorados = 0;
  var pendientes = 0;
  var errores = 0;
  var solicitudes = []; // { id, fila, numVale }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('🔄 Sincronizando todos los vales...', '⏳', 60);
  
  // ===== PASO 1: RECOLECTAR IDs =====
  for (var fila = 2; fila <= ultimaFila; fila++) {
    var id, numVale;
    
    if (esClientes) {
      var fechaCelda = sheet.getRange(fila, 1).getValue();
      numVale = sheet.getRange(fila, 2).getValue();
      if (!fechaCelda || !numVale) continue;
      id = CONFIG.SUCURSAL + '-CLIENTES-F' + fila;
    } else {
      id = sheet.getRange(fila, COL.ID).getValue();
      if (!id) continue;
      numVale = sheet.getRange(fila, COL.NUM_VALE).getValue();
      
      var estadoActual = sheet.getRange(fila, COL.ESTADO).getValue();
      if (estadoActual.indexOf('✅ Firmado') > -1 || estadoActual.indexOf('⚠️ Omitido') > -1) {
        ignorados++;
        continue;
      }
    }
    
    solicitudes.push({ id: id, fila: fila, numVale: numVale });
  }
  
  if (solicitudes.length === 0) {
    SpreadsheetApp.getUi().alert('✅ Sin pendientes', 'No hay vales pendientes de sincronizar.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // ===== PASO 2: UNA SOLA LLAMADA BATCH =====
  var todosLosIds = [];
  for (var i = 0; i < solicitudes.length; i++) {
    todosLosIds.push(solicitudes[i].id);
  }
  
  var resultados = consultarBatch(todosLosIds);
  
  // ===== PASO 3: PROCESAR RESULTADOS =====
  for (var i = 0; i < solicitudes.length; i++) {
    var sol = solicitudes[i];
    var estado = resultados[sol.id];
    
    if (!estado || estado.error) {
      errores++;
      continue;
    }
    
    if (estado.firmado) {
      if (esClientes) {
        actualizarFilaClientesDesdeApi(sheet, sol.fila, estado, sol.numVale);
      } else {
        actualizarFilaDesdeApi(sheet, sol.fila, estado, sol.numVale);
      }
      actualizados++;
    } else {
      pendientes++;
    }
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Listo', '', 3);
  
  SpreadsheetApp.getUi().alert('✅ Sincronización completa', 
    '🔄 Actualizadas: ' + actualizados + 
    '\n⏳ Pendientes: ' + pendientes +
    '\n⏭️ Ignoradas: ' + ignorados +
    '\n❌ Errores: ' + errores +
    '\n📊 Vales procesados: ' + solicitudes.length, 
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ==================== SINCRONIZAR UNA SOLA FILA ====================
function sincronizarEstadoDesdeApp() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var fila = sheet.getActiveCell().getRow();
  var tipoCaja = detectarTipoCaja(sheet.getName());
  var esClientes = (tipoCaja === 'CLIENTES');
  
  var id, numVale;
  
  if (esClientes) {
    id = CONFIG.SUCURSAL + '-CLIENTES-F' + fila;
    numVale = sheet.getRange(fila, 2).getValue();
  } else {
    id = sheet.getRange(fila, COL.ID).getValue();
    numVale = sheet.getRange(fila, COL.NUM_VALE).getValue();
  }
  
  if (!id) {
    SpreadsheetApp.getUi().alert('⚠️ Sin ID', 'Esta fila no tiene ID.\nMarcá el checkbox primero.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  try {
    var params = [
      'vale?',
      'fila=' + fila,
      'sheet=' + encodeURIComponent(sheet.getName()),
      'id=' + encodeURIComponent(id),
      'numVale=' + encodeURIComponent(numVale),
      'entregado=' + encodeURIComponent(esClientes ? 'Cliente' : (sheet.getRange(fila, COL.ENTREGADO).getValue() || '')),
      'monto=' + encodeURIComponent(esClientes ? (sheet.getRange(fila, 4).getValue() || '') : (sheet.getRange(fila, COL.MONTO).getValue() || '')),
      'sucursal=' + encodeURIComponent(CONFIG.SUCURSAL),
      'fecha=' + encodeURIComponent(formatearFechaParaApi(sheet.getRange(fila, COL.FECHA).getValue())),
      'rubro=' + encodeURIComponent(esClientes ? 'Varios' : (sheet.getRange(fila, COL.RUBRO).getValue() || ''))
    ];
    var url = CONFIG.APP_API_URL + '?' + params.join('&');
    
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      var errorMsg = 'La app no responde.\nHTTP ' + response.getResponseCode();
      try {
        var body = JSON.parse(response.getContentText());
        if (body.error) errorMsg += '\n\nError de la app: ' + body.error;
      } catch (e) {}
      SpreadsheetApp.getUi().alert('❌ Error', errorMsg, SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    var estado = JSON.parse(response.getContentText());
    
    if (!estado || estado.error) {
      SpreadsheetApp.getUi().alert('❌ Error', (estado && estado.error) || 'Respuesta inválida', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    if (esClientes) {
      actualizarFilaClientesDesdeApi(sheet, fila, estado, numVale);
    } else {
      actualizarFilaDesdeApi(sheet, fila, estado, numVale);
    }
    
    SpreadsheetApp.getUi().alert('✅ Sincronizado', 
      '👤 Firmante: ' + (estado.firmante || 'N/D') +
      '\n📝 Firmado: ' + (estado.firmado ? 'SÍ ✅' : 'NO ❌') + 
      '\n🧾 Comprobante: ' + (estado.comprobante ? 'SÍ ✅' : 'NO ❌') +
      '\n📄 PDF: ' + (estado.pdfUrl ? 'Disponible' : 'No disponible') +
      '\n📅 Fecha firma: ' + (estado.fechaFirma || 'N/D'), 
      SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Error de conexión', error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}   