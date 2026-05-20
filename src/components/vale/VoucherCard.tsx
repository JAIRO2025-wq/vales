"use client";

import React from "react";

interface VoucherCardProps {
  id: string;
  fecha: string;
  entregado: string;
  rubro: string;
  concepto?: string;
  numVale: string;
  monto: string;
  sucursal: string;
  sheet: string;
  signatureUrl?: string;
  comprobanteUrl?: string;
  motivoOmitido?: string;
  autorizadoPor?: string;
}

export const VoucherCard: React.FC<VoucherCardProps> = ({
  id,
  fecha,
  entregado,
  rubro,
  concepto,
  numVale,
  monto,
  sucursal,
  sheet,
  signatureUrl,
  comprobanteUrl,
  motivoOmitido,
  autorizadoPor,
}) => {
  const sheetUpper = (sheet || "").toUpperCase();
  // Corregido: Otros Gastos ya no se agrupa con Caja Chica
  const isCajaChica = sheetUpper.includes("CHICA") || sheetUpper === "HOJA 1" || sheetUpper.includes("GENERAL");
  const isClientes = sheetUpper.includes("CLIENTES");
  const isInstalaciones = sheetUpper.includes("INSTALACIONES");
  const isOtros = sheetUpper.includes("OTROS");

  const displayMonto = monto ? monto.replace(/[^\d.]/g, "") : "0.00";
  const finalConcepto = concepto || rubro;

  return (
    <div className="voucher-outer-wrapper" id="vale-imprimible">
      <style jsx>{`
        .voucher-outer-wrapper {
          width: 850px;
          margin: 0 auto;
          background: #fff;
          padding: 10px;
        }

        .voucher-box {
          position: relative;
          width: 100%;
          background: #ffffff;
          border: 2px solid #1e3a8a;
          border-radius: 12px;
          padding: 30px 40px;
          font-family: 'Inter', -apple-system, sans-serif;
          color: #111827;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-15deg);
          font-size: 140px;
          font-weight: 900;
          color: rgba(30, 64, 175, 0.04);
          z-index: 0;
          pointer-events: none;
          letter-spacing: 5px;
        }

        .content-layer {
          position: relative;
          z-index: 1;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 3px solid #1e3a8a;
          padding-bottom: 15px;
        }

        .logo-area .main-logo {
          font-size: 36px;
          font-weight: 800;
          color: #1e3a8a;
          line-height: 1;
        }

        .logo-area .main-logo span {
          color: #3b82f6;
        }

        .logo-area .sub-logo {
          font-size: 10px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 4px;
        }

        .title-badge {
          background: #1e3a8a;
          color: #ffffff;
          padding: 8px 25px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .voucher-id-area {
          text-align: right;
          color: #1e3a8a;
        }

        .voucher-id-area .label {
          font-size: 14px;
          font-weight: 600;
        }

        .voucher-id-area .number {
          font-size: 24px;
          font-weight: 800;
          border-bottom: 2px solid #cbd5e1;
          padding: 0 10px;
        }

        .meta-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 15px;
        }

        .date-box {
          font-size: 14px;
          font-weight: 600;
        }

        .date-box span {
          border-bottom: 1px solid #94a3b8;
          padding: 0 15px;
          margin-left: 5px;
          color: #1e293b;
        }

        .check-container {
          background: #f8fafc;
          border-radius: 8px;
          padding: 12px 15px;
          display: flex;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 20px;
          border: 1px solid #e2e8f0;
        }

        .check-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }

        .box {
          width: 18px;
          height: 18px;
          border: 2px solid #94a3b8;
          border-radius: 4px;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .box.active {
          background: #1e3a8a;
          border-color: #1e3a8a;
        }

        .box.active::after {
          content: "✓";
          color: #fff;
          font-size: 14px;
          font-weight: 900;
        }

        .data-field {
          margin-bottom: 15px;
        }

        .data-field .field-label {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .data-field .field-value {
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          min-height: 24px;
        }

        .monto-row {
          display: flex;
          gap: 20px;
          align-items: flex-end;
          margin-bottom: 15px;
        }

        .monto-box-styled {
          background: #eff6ff;
          border: 2px solid #3b82f6;
          border-radius: 10px;
          padding: 10px 20px;
          min-width: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .monto-box-styled .cur {
          font-size: 20px;
          font-weight: 800;
          color: #3b82f6;
        }

        .monto-box-styled .val {
          font-size: 24px;
          font-weight: 900;
          color: #1e3a8a;
        }

        .signatures-area {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          margin-top: 40px;
          text-align: center;
        }

        .sig-box {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .sig-box .hand {
          height: 70px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          margin-bottom: 5px;
          width: 100%;
        }

        .sig-box .line {
          border-top: 2px solid #1e293b;
          margin-bottom: 5px;
          width: 100%;
        }

        .sig-box .label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }

        .sig-box .name {
          font-size: 13px;
          font-weight: 600;
          color: #1e3a8a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }

        .omission-msg {
          color: #dc2626;
          font-size: 11px;
          font-weight: 700;
          font-style: italic;
        }

        .footer-small {
          margin-top: 25px;
          padding-top: 10px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 600;
          color: #94a3b8;
        }

        .attachment-section {
          margin-top: 30px;
          border-top: 2px dashed #e2e8f0;
          padding-top: 20px;
          text-align: center;
        }

        .attachment-label {
          display: inline-block;
          background: #f8fafc;
          padding: 4px 15px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          margin-bottom: 15px;
          border: 1px solid #e2e8f0;
        }

        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }
          body {
            background: #ffffff !important;
            visibility: hidden;
          }
          #vale-imprimible {
            visibility: visible !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          #vale-imprimible * {
            visibility: visible !important;
          }
          .voucher-box {
            box-shadow: none !important;
            border: 2.5px solid #1e3a8a !important;
          }
          .voucher-outer-wrapper {
            padding: 0 !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="voucher-box">
        <div className="watermark">FLYNET</div>

        <div className="content-layer">
          <div className="header">
            <div className="logo-area">
              <div className="main-logo">fly<span>net</span></div>
              <div className="sub-logo">S.A. de C.V.</div>
            </div>
            <div className="title-badge">Vale de Caja</div>
            <div className="voucher-id-area">
              <span className="label">N° </span>
              <span className="number">{numVale || "---"}</span>
            </div>
          </div>

          <div className="meta-row">
            <div className="date-box">
              Fecha: <span>{fecha}</span>
            </div>
          </div>

          <div className="check-container">
            <div className="check-item">
              <div className={`box ${isCajaChica ? "active" : ""}`}></div>
              <span>Caja chica</span>
            </div>
            <div className="check-item">
              <div className={`box ${isClientes ? "active" : ""}`}></div>
              <span>Clientes</span>
            </div>
            <div className="check-item">
              <div className={`box ${isInstalaciones ? "active" : ""}`}></div>
              <span>Instalaciones</span>
            </div>
            <div className="check-item">
              <div className={`box ${isOtros ? "active" : ""}`}></div>
              <span>Otros Gastos</span>
            </div>
          </div>

          <div className="data-field">
            <div className="field-label">Entregado a:</div>
            <div className="field-value">{entregado}</div>
          </div>

          <div className="monto-row">
            <div className="data-field" style={{ flex: 1 }}>
              <div className="field-label">La suma de:</div>
              <div className="field-value">{displayMonto} Dólares exactos</div>
            </div>
            <div className="monto-box-styled">
              <span className="cur">$</span>
              <span className="val">{displayMonto}</span>
            </div>
          </div>

          <div className="data-field">
            <div className="field-label">En concepto de:</div>
            <div className="field-value" style={{ minHeight: "45px" }}>{finalConcepto}</div>
          </div>

          <div className="signatures-area">
            <div className="sig-box">
              <div className="hand">
                {signatureUrl && <img src={signatureUrl} alt="Firma" style={{ maxHeight: "60px", maxWidth: "250px", mixBlendMode: "multiply" }} />}
                {motivoOmitido && <div className="omission-msg">AUTORIZADO SIN FIRMA: {motivoOmitido}</div>}
              </div>
              <div className="line"></div>
              <div className="label">Firma Recibido</div>
              <div className="name" title={entregado}>{entregado}</div>
            </div>

            <div className="sig-box">
              <div className="hand" style={{ alignItems: "center", color: "#1e3a8a", fontWeight: "bold", fontSize: "11px", textTransform: "uppercase" }}>
                {autorizadoPor ? "Autorización Verificada" : "Pendiente de Autorización"}
              </div>
              <div className="line"></div>
              <div className="label">Autoriza (Caja / Gerencia)</div>
              <div className="name" title={autorizadoPor || sucursal}>{autorizadoPor || sucursal}</div>
            </div>
          </div>

          <div className="footer-small">
            <span>FLYNET S.A. DE C.V. — CONTROL INTERNO</span>
            <span style={{ opacity: 0.6 }}>ID: {id}</span>
          </div>
        </div>
      </div>

      {comprobanteUrl && (
        <div className="attachment-section">
          <div className="attachment-label">Comprobante de Gasto Adjunto</div>
          <div>
            <img 
              src={comprobanteUrl} 
              alt="Ticket" 
              style={{ maxWidth: "100%", maxHeight: "600px", borderRadius: "8px", border: "1px solid #e2e8f0" }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};
