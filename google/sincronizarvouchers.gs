// ==================== SINCRONIZAR VOUCHERS DE CLIENTES (BATCH) ====================
//
// Recolecta todos los IDs de vouchers pendientes y hace UNA SOLA llamada
// al endpoint batch /api/estado/batch que ya incluye voucherSubido.
//
function sincronizarVouchers() {
  Logger.log('🖼️ INICIO sincronizarVouchers (BATCH)');
  
  var hojas = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var totalActualizados = 0;
  var totalPendientes = 0;
  var totalErrores = 0;
  
  // ===== PASO 1: RECOLECTAR TODOS LOS IDs PENDIENTES =====
  var solicitudes = []; // { sheet, fila, id }
  
  for (var h = 0; h < hojas.length; h++) {
    var sheet = hojas[h];
    var tipoCaja = detectarTipoCaja(sheet.getName());
    
    if (tipoCaja !== 'CLIENTES') {
      Logger.log('   ⏭️ Saltando hoja: ' + sheet.getName() + ' (no es CLIENTES)');
      continue;
    }
    
    Logger.log('📂 Hoja: ' + sheet.getName());
    
    var ultimaFila = sheet.getLastRow();
    if (ultimaFila <= 1) {
      Logger.log('   ⏭️ Hoja vacía');
      continue;
    }
    
    for (var fila = 2; fila <= ultimaFila; fila++) {
      try {
        var fechaVale = sheet.getRange(fila, 1).getValue();
        var numVale = sheet.getRange(fila, 2).getValue();
        if (!fechaVale || !numVale) continue;
        
        // Verificar si ya tiene voucher subido (columna O = 15)
        var estadoVoucher = String(sheet.getRange(fila, 15).getValue() || '');
        if (estadoVoucher.indexOf('😎') > -1) continue;
        
        // Verificar si la lista desplegable (columna M = 13) dice "Link"
        var listaM = String(sheet.getRange(fila, 13).getValue() || '');
        if (listaM !== 'Link') continue;
        
        var fechaObj = parsearFecha(fechaVale);
        if (!fechaObj) continue;
        
        var año = fechaObj.getFullYear();
        var mes = ('0' + (fechaObj.getMonth() + 1)).slice(-2);
        var dia = fechaObj.getDate();
        var semanaDelMes = Math.ceil(dia / 7);
        var id = CONFIG.SUCURSAL + '-' + año + '-' + mes + '-W' + semanaDelMes + '-CLIENTES-F' + fila;
        
        solicitudes.push({ sheet: sheet, fila: fila, id: id });
      } catch (err) {
        Logger.log('   ⚠️ Error leyendo fila ' + fila + ': ' + err.toString());
      }
    }
  }
  
  Logger.log('📋 Total vouchers pendientes: ' + solicitudes.length);
  
  if (solicitudes.length === 0) {
    Logger.log('🏁 Sin vouchers pendientes');
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Sin vouchers pendientes', 'Vouchers', 3);
    return;
  }
  
  // ===== PASO 2: UNA SOLA LLAMADA BATCH =====
  var todosLosIds = [];
  for (var i = 0; i < solicitudes.length; i++) {
    todosLosIds.push(solicitudes[i].id);
  }
  
  // Reutilizamos la función consultarBatch de sincronizar.gs
  var resultados = consultarBatch(todosLosIds);
  
  // ===== PASO 3: PROCESAR RESULTADOS =====
  for (var i = 0; i < solicitudes.length; i++) {
    var sol = solicitudes[i];
    var estado = resultados[sol.id];
    
    if (!estado || estado.error) {
      Logger.log('   ⏭️ Fila ' + sol.fila + ': sin datos');
      totalErrores++;
      continue;
    }
    
    if (estado.voucherSubido) {
      // Poner 😎 en columna O (15)
      sol.sheet.getRange(sol.fila, 15).setValue('😎');
      Logger.log('   😎 Voucher subido en fila ' + sol.fila);
      
      if (estado.voucherUrl) {
        // Actualizar enlace en N (14)
        sol.sheet.getRange(sol.fila, 14)
          .setFormula('=HYPERLINK("' + estado.voucherUrl + '"; "📎 Ver voucher")')
          .setFontColor('green');
        Logger.log('   ✅ Enlace actualizado en N');
      }
      
      totalActualizados++;
    } else {
      // Poner ✖️ en columna O (15) si no está ya
      var estadoActualO = String(sol.sheet.getRange(sol.fila, 15).getValue() || '');
      if (estadoActualO.indexOf('✖️') === -1) {
        sol.sheet.getRange(sol.fila, 15).setValue('✖️');
        Logger.log('   ✖️ Sin voucher en fila ' + sol.fila);
      }
      totalPendientes++;
    }
  }
  
  Logger.log('🏁 FINAL VOUCHERS: ' + totalActualizados + ' act, ' + totalPendientes + ' pend, ' + totalErrores + ' err');
  
  if (totalActualizados > 0 || totalPendientes > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      '😎 ' + totalActualizados + ' | ✖️ ' + totalPendientes + ' | ❌ ' + totalErrores + ' err',
      'Sincronización Vouchers (Batch)',
      5
    );
  }
}