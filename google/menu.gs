// ==================== MENÚ ====================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 Vales Digitales')
    .addItem('🔗 Copiar URL de la API', 'mostrarUrlApi')
    .addItem('🧪 Probar API', 'probarApi')
    .addSeparator()
    .addItem('📋 Ver período detectado', 'mostrarPeriodo')
    .addSeparator()
    .addItem('🔄 Sincronizar esta fila', 'sincronizarEstadoDesdeApp')
    .addItem('🔄 Sincronizar pendientes', 'sincronizarPendientes')
    .addItem('🔄 Sincronizar TODAS', 'sincronizarCicloCompleto')
    .addSeparator()
    .addItem('🖼️ Sincronizar vouchers', 'sincronizarVouchers')
    .addItem('🔍 Diagnosticar', 'diagnosticarSincronizacion')
    .addToUi();
}

function mostrarPeriodo() {
  var periodo = extraerPeriodo();
  var tipoCaja = detectarTipoCaja(SpreadsheetApp.getActiveSheet().getName());
  var esClientes = (tipoCaja === 'CLIENTES');
  SpreadsheetApp.getUi().alert('📋 Información del archivo', 
    '📅 Período: ' + periodo + 
    '\n📂 Tipo de caja: ' + tipoCaja + 
    '\n🏢 Sucursal: ' + CONFIG.SUCURSAL +
    '\n📊 Modo: ' + (esClientes ? 'COMPACTO (E-F)' : 'COMPLETO (H-I-J-K-L)'), 
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function mostrarUrlApi() {
  var url = ScriptApp.getService().getUrl();
  if (!url || url.indexOf('script.google.com') === -1) {
    SpreadsheetApp.getUi().alert('❌ API no implementada', 'Implementar > Nueva implementación > Aplicación web.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  var html = '<div style="padding:20px;"><b>URL de la API:</b><br><textarea rows="3" style="width:100%;">' + url + '</textarea></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setHeight(150).setWidth(500), '🔗 API');
}

function probarApi() {
  var url = ScriptApp.getService().getUrl();
  if (!url || url.indexOf('script.google.com') === -1) {
    SpreadsheetApp.getUi().alert('❌ API no implementada', 'Implementar > Nueva implementación > Aplicación web.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  try {
    var response = UrlFetchApp.fetch(url);
    var data = JSON.parse(response.getContentText());
    SpreadsheetApp.getUi().alert('✅ API funcionando', 
      'Status: ' + data.status + 
      '\nPeríodo: ' + (data.periodo || 'N/D') + 
      '\nSucursal: ' + (data.sucursal || 'N/D'), 
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Error', error.toString(), SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ==================== DIAGNÓSTICO ====================
function diagnosticarSincronizacion() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var tipoCaja = detectarTipoCaja(sheet.getName());
  var esClientes = (tipoCaja === 'CLIENTES');
  var ultimaFila = sheet.getLastRow();
  var resultados = [];
  var exitos = 0;
  var fallos = 0;
  var filasProbadas = 0;
  var maxFilas = 5;
  
  for (var fila = 2; fila <= ultimaFila && filasProbadas < maxFilas; fila++) {
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
    }
    
    filasProbadas++;
    
    try {
      var params = [
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
      var url = CONFIG.APP_API_URL + '?vale?' + params.join('&');
      
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var codigo = response.getResponseCode();
      
      if (codigo === 200) {
        try {
          var data = JSON.parse(response.getContentText());
          if (data.error) {
            resultados.push('Fila ' + fila + ': ❌ ' + data.error);
            fallos++;
          } else {
            resultados.push('Fila ' + fila + ': ✅ Firmado=' + (data.firmado ? 'SÍ' : 'NO') + ' | Comprobante=' + (data.comprobante ? 'SÍ' : 'NO'));
            exitos++;
          }
        } catch (e) {
          resultados.push('Fila ' + fila + ': ❌ No es JSON');
          fallos++;
        }
      } else {
        resultados.push('Fila ' + fila + ': ❌ HTTP ' + codigo);
        fallos++;
      }
    } catch (err) {
      resultados.push('Fila ' + fila + ': ❌ ' + err.toString().substring(0, 80));
      fallos++;
    }
  }
  
  var informe = '🔍 DIAGNÓSTICO\n\n📂 Caja: ' + tipoCaja + '\n📅 Período: ' + extraerPeriodo() + '\n🔗 API: ' + CONFIG.APP_API_URL + '\n\n✅ Éxitos: ' + exitos + '\n❌ Fallos: ' + fallos + '\n\n📋 Resultados:\n';
  for (var i = 0; i < resultados.length; i++) {
    informe += (i + 1) + '. ' + resultados[i] + '\n';
  }
  
  if (resultados.length === 0) {
    informe += '⚠️ No se encontraron vales para diagnosticar.';
  }
  
  SpreadsheetApp.getUi().alert('🔍 Diagnóstico', informe, SpreadsheetApp.getUi().ButtonSet.OK);
}