// ==================== API: RECIBIR NOTIFICACIONES PUSH ====================
//
// Esta función recibe notificaciones desde el servidor Next.js cuando
// ocurren eventos en la app web (firma, comprobante, voucher, PDF).
//
// Métodos soportados:
//   updateFirma       → Actualiza estado de firma
//   updateComprobante → Actualiza estado de comprobante/ticket
//   updateVoucher     → Actualiza voucher bancario subido
//   updatePdf         → Actualiza PDF firmado + descarga a Drive (original)
//
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var metodo = data.metodo || 'updatePdf';
    
    var fila = parseInt(data.fila);
    var sheetName = data.sheet;
    var idRecibido = data.id;
    
    if (!fila || !sheetName || !idRecibido) throw new Error('Faltan parámetros: fila, sheet, id.');
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Hoja "' + sheetName + '" no encontrada.');
    
    var tipoCaja = detectarTipoCaja(sheetName);
    var esClientes = (tipoCaja === 'CLIENTES');
    var resultados = [];
    
    if (metodo === 'updateFirma') {
      // ===== NOTIFICACIÓN DE FIRMA =====
      var firmado = data.firmado === 'true' || data.firmado === true;
      var firmaUrl = data.firmaUrl || '';
      var motivo = data.motivo || '';
      var autorizadoPor = data.autorizadoPor || '';
      
      if (esClientes) {
        // En clientes solo actualizar el color del enlace si existe
        var formulaActual = sheet.getRange(fila, 6).getFormula();
        if (formulaActual) {
          if (firmado) {
            sheet.getRange(fila, 6).setFontColor('blue');
          }
        }
        resultados.push('✅ Cliente notificado');
      } else {
        if (firmado) {
          sheet.getRange(fila, COL.ESTADO).setValue('✅ Firmado');
        } else if (motivo) {
          sheet.getRange(fila, COL.ESTADO).setValue('⚠️ Omitido: ' + motivo);
        }
        resultados.push('✅ Estado H actualizado');
      }
      
    } else if (metodo === 'updateComprobante') {
      // ===== NOTIFICACIÓN DE COMPROBANTE/TICKET =====
      var comprobanteUrl = data.comprobanteUrl || '';
      var numVale = data.numVale || '';
      
      if (esClientes) {
        // En clientes, actualizar enlace si ya está firmado
        var formulaActual = sheet.getRange(fila, 6).getFormula();
        if (formulaActual && formulaActual.indexOf('🔗') > -1) {
          sheet.getRange(fila, 6).setFontColor('green');
        }
        resultados.push('✅ Cliente notificado');
      } else {
        sheet.getRange(fila, COL.COMPROBANTE)
          .setValue('✅ Comprobante OK')
          .setFontColor('green');
        resultados.push('✅ Columna J actualizada');
      }
      
    } else if (metodo === 'updateVoucher') {
      // ===== NOTIFICACIÓN DE VOUCHER BANCARIO =====
      var voucherUrl = data.voucherUrl || '';
      
      // Solo aplica a hojas CLIENTES (columnas N=14, O=15)
      if (esClientes) {
        sheet.getRange(fila, 15).setValue('😎');
        if (voucherUrl) {
          sheet.getRange(fila, 14)
            .setFormula('=HYPERLINK("' + voucherUrl + '"; "📎 Ver voucher")')
            .setFontColor('green');
        }
        resultados.push('✅ Voucher actualizado');
      } else {
        resultados.push('⏭️ Voucher solo aplica a CLIENTES');
      }
      
    } else if (metodo === 'updatePdf') {
      // ===== NOTIFICACIÓN DE PDF FIRMADO (original) =====
      var pdfUrl = data.pdfUrl || data.urlValeFirmado;
      var fechaVale = data.fecha;
      var sucursal = data.sucursal;
      var numVale = data.numVale;
      var periodo = data.periodo || extraerPeriodo();
      
      if (!pdfUrl) throw new Error('Falta el enlace del PDF (pdfUrl).');
      
      if (esClientes) {
        sheet.getRange(fila, 6)
          .setFormula('=HYPERLINK("' + pdfUrl + '"; "🔗 Vale firmado #' + numVale + '")')
          .setFontColor('green');
        resultados.push('✅ Enlace F (verde)');
      } else {
        sheet.getRange(fila, COL.ENLACE_VALE)
          .setFormula('=HYPERLINK("' + pdfUrl + '"; "🔗 Ver vale firmado #' + numVale + '")');
        resultados.push('✅ Enlace I');
        
        sheet.getRange(fila, COL.COMPROBANTE)
          .setValue('✅ Incluido en PDF')
          .setFontColor('green');
        resultados.push('✅ Comprobante J');
        
        sheet.getRange(fila, COL.ESTADO).setValue('✅ Firmado');
      }
      
      // Descargar PDF a Google Drive (solo en updatePdf)
      try {
        var response = UrlFetchApp.fetch(pdfUrl, { muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
          var blob = response.getBlob();
          var contentType = response.getHeaders()['Content-Type'] || '';
          var extension = 'pdf';
          if (contentType.indexOf('png') > -1) extension = 'png';
          else if (contentType.indexOf('jpeg') > -1 || contentType.indexOf('jpg') > -1) extension = 'jpg';
          
          blob.setName('vale_' + (numVale || fila) + '_firmado.' + extension);
          var carpetaPDF = obtenerCarpetaPDF(periodo, sucursal, tipoCaja);
          var archivo = carpetaPDF.createFile(blob);
          archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          
          if (!esClientes) {
            sheet.getRange(fila, COL.PDF_FIRMADO)
              .setFormula('=HYPERLINK("' + archivo.getUrl() + '"; "📄 Descargar de Drive")');
          }
          resultados.push('✅ Drive');
        } else {
          resultados.push('⚠️ Descarga HTTP ' + response.getResponseCode());
        }
      } catch (err) {
        resultados.push('❌ Drive: ' + err.toString());
      }
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, mensaje: 'Vale procesado', metodo: metodo, detalles: resultados }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.vale !== undefined) {
    return consultarEstadoValeApi(e);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: '✅ API de vales operativa', 
      periodo: extraerPeriodo(),
      sucursal: CONFIG.SUCURSAL
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== CONSULTAR ESTADO A LA APP ====================
function consultarEstadoValeApi(e) {
  try {
    var url = CONFIG.APP_API_URL + '?' + e.queryString;
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'App no disponible (HTTP ' + response.getResponseCode() + ')' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var estado = JSON.parse(response.getContentText());
    return ContentService
      .createTextOutput(JSON.stringify(estado))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}