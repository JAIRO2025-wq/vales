// ==================== ACTUALIZAR FILA CLIENTES ====================
function actualizarFilaClientesDesdeApi(sheet, fila, vale, numVale) {
  if (vale.firmado && vale.comprobante) {
    sheet.getRange(fila, 6)
      .setFormula('=HYPERLINK("' + (vale.pdfUrl || '') + '"; "🔗 Vale firmado #' + numVale + '")')
      .setFontColor('green');
  } else if (vale.firmado) {
    sheet.getRange(fila, 6)
      .setFormula('=HYPERLINK("' + (vale.pdfUrl || '') + '"; "🔗 Firmado (sin ticket)")')
      .setFontColor('blue');
  }
}