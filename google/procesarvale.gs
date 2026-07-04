// ==================== FUNCIÓN PRINCIPAL (CHECKBOX) ====================
function procesarCheckbox(e) {
  if (!e || !e.source) return;
  
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var fila = range.getRow();
  var col = range.getColumn();
  var valor = e.value;
  
  var tipoCaja = detectarTipoCaja(sheet.getName());
  var esClientes = (tipoCaja === 'CLIENTES');
  
  // ========== BOTÓN SINCRONIZAR EN J3 (SOLO PARA NO CLIENTES) ==========
  if (!esClientes && fila === 3 && col === COL.COMPROBANTE && valor === 'TRUE') {
    sincronizarPendientes();
    sheet.getRange('J3').setValue(false);
    return;
  }
  
  // ========== CHECKBOX DE VALE ==========
  var colCheckbox = esClientes ? 5 : COL.CHECKBOX;
  
  if (col !== colCheckbox || valor !== 'TRUE') return;
  if (fila <= 1) return;
  
  var celdaA = sheet.getRange(fila, COL.FECHA).getValue();
  var fecha = parsearFecha(celdaA);
  
  if (!fecha) {
    SpreadsheetApp.getUi().alert('⚠️ Fecha inválida', 'La celda A' + fila + ' no tiene una fecha válida.\nUsá formato: día/mes/año (ej. 20/01/2026)', SpreadsheetApp.getUi().ButtonSet.OK);
    sheet.getRange(fila, colCheckbox).setValue(false);
    return;
  }
  
  var periodo = extraerPeriodo();
  var dia = fecha.getDate();
  var semanaDelMes = Math.ceil(dia / 7);
  var año = fecha.getFullYear();
  var mes = ('0' + (fecha.getMonth() + 1)).slice(-2);
  
  var id = CONFIG.SUCURSAL + '-' + año + '-' + mes + '-W' + semanaDelMes + '-' + tipoCaja.replace(/\s/g, '') + '-F' + fila;
  
  if (!esClientes) {
    sheet.getRange(fila, COL.ID).setValue(id);
  }
  
  var concepto = '';
  var entregado = '';
  var rubro = '';
  var numVale = '';
  var monto = '';
  
  if (esClientes) {
    // CLIENTES: A=Fecha, B=N° Vale, C=Descripción, D=Monto
    concepto = sheet.getRange(fila, 3).getValue() || '';
    entregado = 'Cliente';
    rubro = 'Varios';
    numVale = sheet.getRange(fila, 2).getValue() || '';
    monto = sheet.getRange(fila, 4).getValue() || '';
  } else if (tipoCaja === 'OTROS GASTOS' || tipoCaja === 'CAJA CHICA') {
    // OTROS GASTOS y CAJA CHICA: A=Fecha, B=Concepto, C=Entregado a, D=Rubro, E=N° Vale, F=Monto
    concepto = sheet.getRange(fila, COL.CONCEPTO).getValue() || '';
    entregado = sheet.getRange(fila, COL.ENTREGADO).getValue() || '';
    rubro = sheet.getRange(fila, COL.RUBRO).getValue() || '';
    numVale = sheet.getRange(fila, COL.NUM_VALE).getValue() || '';
    monto = sheet.getRange(fila, COL.MONTO).getValue() || '';
  } else {
    // INSTALACIONES y otros: A=Fecha, C=Entregado a, D=Rubro, E=N° Vale, F=Monto (sin Concepto en B)
    concepto = sheet.getRange(fila, COL.RUBRO).getValue() || '';
    entregado = sheet.getRange(fila, COL.ENTREGADO).getValue() || '';
    rubro = sheet.getRange(fila, COL.RUBRO).getValue() || '';
    numVale = sheet.getRange(fila, COL.NUM_VALE).getValue() || '';
    monto = sheet.getRange(fila, COL.MONTO).getValue() || '';
  }
  
  var fechaStr = año + '-' + mes + '-' + ('0' + dia).slice(-2);
  
  var params = [
    'fila=' + fila,
    'sheet=' + encodeURIComponent(sheet.getName()),
    'tipoCaja=' + encodeURIComponent(tipoCaja),
    'id=' + encodeURIComponent(id),
    'fecha=' + fechaStr,
    'concepto=' + encodeURIComponent(concepto),
    'entregado=' + encodeURIComponent(entregado),
    'rubro=' + encodeURIComponent(rubro),
    'numVale=' + encodeURIComponent(numVale),
    'monto=' + encodeURIComponent(monto),
    'sucursal=' + encodeURIComponent(CONFIG.SUCURSAL),
    'periodo=' + encodeURIComponent(periodo)
  ];
  var urlVale = CONFIG.APP_BASE_URL + '/vale?' + params.join('&');
  
  if (esClientes) {
    sheet.getRange(fila, 6)
      .setFormula('=HYPERLINK("' + urlVale + '"; "🔗 Pendiente")')
      .setFontColor('red');
  } else {
    sheet.getRange(fila, COL.ENLACE_VALE)
      .setFormula('=HYPERLINK("' + urlVale + '"; "🔗 Abrir vale #' + numVale + '")');
    sheet.getRange(fila, COL.ESTADO).setValue('⏳ En proceso');
    sheet.getRange(fila, COL.COMPROBANTE)
      .setValue('🔴 Pendiente')
      .setFontColor('red');
  }
  
  sheet.getRange(fila, colCheckbox).setValue(false);
  
  var html = '<script>window.open("' + urlVale + '", "_blank");google.script.host.close();</script>';
  SpreadsheetApp.getUi()
    .showModalDialog(HtmlService.createHtmlOutput(html).setHeight(50).setWidth(100), '🚀 Abriendo vale...');
}