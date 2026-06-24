"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { VoucherCard } from "@/components/vale/VoucherCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Printer, 
  ShieldCheck, 
  Loader2, 
  CheckCircle2, 
  Download, 
  QrCode, 
  Camera,
  Signature
} from "lucide-react";
import { checkVoucherStatusAction, savePdfAction, saveVoucherAction, notifyArchiveAction, type VoucherRecord, type VoucherStatusResult } from "@/app/actions/vouchers";
import { useToast } from "@/hooks/use-toast";
import { CONFIG } from "@/lib/config";

function ValeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const [voucherStatus, setVoucherStatus] = useState<VoucherStatusResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [hasDismissedModal, setHasDismissedModal] = useState(false);
  
    
  
  const voucherData = {
    fila: searchParams.get("fila") || "",
    sheet: searchParams.get("sheet") || "",
    id: searchParams.get("id") || "",
    fecha: searchParams.get("fecha") || "",
    entregado: searchParams.get("entregado") || "",
    rubro: searchParams.get("rubro") || "",
    concepto: searchParams.get("concepto") || "",
    numVale: searchParams.get("numVale") || "",
    monto: searchParams.get("monto") || "0.00",
    sucursal: searchParams.get("sucursal") || "",
  };

  useEffect(() => {
    const initVoucher = async () => {
      if (!voucherData.id) return;
      try {
                        // Consultamos si ya existe en disco (pasando el origen real)
        const existingStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        
        // Guardar los datos básicos del vale (sin machacar firma/comprobante si ya existen)
        // IMPORTANTE: NO pasar firmaUrl ni comprobanteUrl resueltas - solo los datos crudos del URL
        const newVoucher: any = {
          ...voucherData,
          firmado: false,
          timestamp: new Date().toISOString()
        };
        // Solo si EXISTE en disco, preservamos sus datos
        if (existingStatus) {
          newVoucher.firmado = existingStatus.firmado;
          newVoucher.motivoOmitido = existingStatus.motivoOmitido;
          newVoucher.hasPdf = existingStatus.hasPdf;
          newVoucher.autorizadoPor = existingStatus.autorizadoPor;
          newVoucher.timestamp = existingStatus.timestamp;
          // NO tocar firmaUrl ni comprobanteUrl - se preservan solos en saveVoucherAction
          // porque busca por ID y mantiene los valores existentes
        }
        await saveVoucherAction(newVoucher);

        // Volvemos a consultar (con origen real) para tener el estado actualizado
        const finalStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        if (finalStatus) setVoucherStatus(finalStatus);

      } catch (e) {
        console.error("Error inicializando o actualizando vale:", e);
      } finally {
        setIsChecking(false);
      }
    };
    
    initVoucher();
    
        // Polling para actualizaciones en tiempo real (por si firman desde celular)
    // Reducido de 4s a 10s para no saturar el servidor con resolveImageUrl
    const interval = setInterval(async () => {
      if (!voucherData.id) return;
      const status = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
      if (status) setVoucherStatus(status);
    }, 10000); 
    
    return () => clearInterval(interval);
  }, [voucherData.id, voucherData.fecha, voucherData.monto, voucherData.concepto]);

  /**
   * Convierte una ruta de imagen a una URL completa que el servidor Python pueda descargar.
   * Las rutas /storage/... son locales al servidor Next.js, así que las convertimos
   * a URLs de la API de imágenes para que el servidor Python las descargue por HTTP.
   */
  const prepareImageValue = (rawPath: string | undefined, fecha?: string): string | null => {
    if (!rawPath) return null;
    // Si ya es una URL absoluta, enviarla tal cual
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      return rawPath;
    }
    // Si es un base64 (legacy), enviarlo tal cual
    if (rawPath.startsWith('data:')) {
      return rawPath;
    }
    // Convertir rutas del storage local a URLs de la API de imágenes
    // para que el servidor Python pueda descargarlas por HTTP
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fechaParam = fecha || voucherData.fecha;
    // Si la ruta empieza con /storage/ o storage/, construir URL de API
    const cleanPath = rawPath.replace(/^\/?(storage\/)?/, '');
    if (cleanPath.startsWith('imagenes/') || cleanPath.startsWith('pdfs/')) {
      return `${origin}/api/imagenes?fecha=${encodeURIComponent(fechaParam)}&file=${encodeURIComponent(cleanPath)}`;
    }
    // Si empieza con /api/ ya es una URL relativa a la API
    if (rawPath.startsWith('/api/')) {
      return `${origin}${rawPath}`;
    }
    // Fallback: devolver la ruta tal cual
    return rawPath;
  };

  const preparePayload = () => buildPayload(voucherStatus);

  const buildPayload = (status: VoucherStatusResult | null) => {
    const sheetUpper = (voucherData.sheet || "").toUpperCase();
    const isCajaChica = sheetUpper.includes("CHICA") || sheetUpper === "HOJA 1" || sheetUpper.includes("GENERAL");
    const isClientes = sheetUpper.includes("CLIENTES");
    const isInstalaciones = sheetUpper.includes("INSTALACIONES");
    const isOtros = sheetUpper.includes("OTROS");
    const displayMonto = voucherData.monto ? voucherData.monto.replace(/[^\d.]/g, "") : "0.00";

    return {
      id: status?.id || voucherData.id,
      numero: voucherData.numVale || "---",
      fecha: voucherData.fecha,
      cajaChica: isCajaChica,
      clientes: isClientes,
      instalaciones: isInstalaciones,
      otrosGastos: isOtros,
      entregadoA: voucherData.entregado,
      laSumaDe: `${displayMonto} Dólares exactos`,
      concepto: status?.concepto || voucherData.concepto || voucherData.rubro,
      montoTotal: displayMonto,
      reintegro: "0.00",
      solicitante: voucherData.entregado,
      autoriza: status?.autorizadoPor || voucherData.sucursal,
      firmaSolicitante: prepareImageValue(status?.firmaUrlRaw, status?.fecha),
      comprobante: prepareImageValue(status?.comprobanteUrlRaw, status?.fecha)
    };
  };

    const handleDownloadPDF = async () => {
      setIsSavingPdf(true);
      try {
        const payload = preparePayload();
        const baseApi = CONFIG.PDF_API_URL.endsWith('/') ? CONFIG.PDF_API_URL.slice(0, -1) : CONFIG.PDF_API_URL;
      
        const response = await fetch(`${baseApi}/generate-vale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Error en el servidor de PDF");
        const data = await response.json();
        if (data.pdf_url) {
          window.open(data.pdf_url, '_blank');
          toast({ title: "PDF Generado", description: "Documento listo para descargar." });
        }
      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "No se pudo conectar con el motor de PDF." });
      } finally {
        setIsSavingPdf(false);
      }
    };

    const handleArchiveVoucher = async () => {
      setIsSyncing(true);
      try {
        // Forzar refresh del estado antes de archivar para tener datos frescos
        const freshStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        if (freshStatus) setVoucherStatus(freshStatus);
        
        // Usar los datos frescos para el payload
        const currentStatus = freshStatus || voucherStatus;
        const payload = buildPayload(currentStatus);
        const baseApi = CONFIG.PDF_API_URL.endsWith('/') ? CONFIG.PDF_API_URL.slice(0, -1) : CONFIG.PDF_API_URL;
      
        const response = await fetch(`${baseApi}/generate-vale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Error al generar PDF");
        const data = await response.json();
        if (!data.pdf_url) throw new Error("URL de PDF no recibida");

        // Pasar la URL del PDF al servidor para que lo descargue directamente
        const pdfResult = await savePdfAction(voucherData.id, voucherData.fecha, voucherData.numVale, data.pdf_url);
        if (!pdfResult.success) throw new Error(pdfResult.error || "Error al guardar el PDF");

        toast({ title: "Completado", description: "Documento archivado con éxito." });
        setVoucherStatus(prev => prev ? { ...prev, hasPdf: true } : null);

        // Notificar a Google Apps Script en segundo plano (no bloquear el flujo)
        notifyArchiveAction({
          fila: voucherData.fila,
          sheet: voucherData.sheet,
          id: voucherData.id,
          pdfUrl: `${window.location.origin}/vale?${new URLSearchParams(voucherData as any).toString()}`,
        }).catch(() => {});
      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Fallo al archivar el archivo." });
      } finally {
        setIsSyncing(false);
      }
    };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="font-headline font-bold text-primary animate-pulse">Sincronizando Vale Digital...</p>
      </div>
    );
  }

  const isSigned = voucherStatus && (voucherStatus.firmado || !!voucherStatus.motivoOmitido);
  const hasReceipt = !!voucherStatus?.comprobanteUrl;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const queryParams = new URLSearchParams(voucherData as any).toString();
  const signUrl = `${baseUrl}/firmar?${queryParams}`;
  const attachUrl = `${baseUrl}/adjuntar?${queryParams}`;

  const handleCopySignLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(signUrl);
    toast({ title: "Link de Firma", description: "Copiado al portapapeles." });
  };

  const handleCopyAttachLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(attachUrl);
    toast({ title: "Link de Comprobante", description: "Copiado al portapapeles." });
  };

    return (
    <div className="min-h-screen bg-zinc-100 print:bg-white print:p-0">
      {isSigned && !hasDismissedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <Card className="w-full max-w-sm shadow-2xl border-none animate-in zoom-in duration-300">
            <CardContent className="pt-8 pb-8 text-center space-y-5">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <div className="space-y-1">
                <h2 className="text-xl font-bold font-headline uppercase">Vale Procesado</h2>
                <p className="text-muted-foreground text-xs">Firma y datos verificados correctamente</p>
              </div>
              <Button className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-bold" onClick={() => setHasDismissedModal(true)}>
                Visualizar Documento
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Layout: 15% left sidebar + 85% right content */}
      <div className="flex flex-row min-h-screen print:block">
        
        {/* ===== PANEL IZQUIERDO (15%) - QRs y Acciones ===== */}
        <div className="w-[15%] min-w-[180px] max-w-[240px] bg-white border-r border-zinc-200 p-3 flex flex-col gap-3 print:hidden overflow-y-auto sticky top-0 h-screen">
          
          {/* Encabezado pequeño */}
          <div className="text-center pb-2 border-b border-zinc-100">
            <p className="text-[9px] font-black text-primary uppercase tracking-wider">Flynet</p>
            <p className="text-[7px] text-muted-foreground font-bold">Vale #{voucherData.numVale}</p>
          </div>

          {/* QR 1: Firma */}
          <Card className="border border-zinc-200 shadow-sm cursor-pointer hover:border-primary/40 transition-colors" onClick={handleCopySignLink}>
            <CardContent className="p-3 flex flex-col items-center text-center gap-2">
              <div className="flex items-center gap-1.5 text-zinc-600 font-bold uppercase" style={{ fontSize: "7px" }}>
                <Signature className="w-3 h-3" /> Firma
              </div>
              {isSigned ? (
                <div className="flex flex-col items-center gap-1 text-emerald-600 py-2">
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="font-black" style={{ fontSize: "8px" }}>REGISTRADA</span>
                </div>
              ) : (
                <>
                                    <div className="bg-white rounded border shadow-sm w-full flex justify-center">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(signUrl)}`} alt="QR Firma" className="w-[120px] h-[120px] max-w-full" />
                  </div>
                  <p className="text-muted-foreground" style={{ fontSize: "6.5px", lineHeight: 1.2 }}>Copiar link o escanear QR</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* QR 2: Ticket */}
          <Card className="border border-zinc-200 shadow-sm cursor-pointer hover:border-primary/40 transition-colors" onClick={handleCopyAttachLink}>
            <CardContent className="p-3 flex flex-col items-center text-center gap-2">
              <div className="flex items-center gap-1.5 text-zinc-600 font-bold uppercase" style={{ fontSize: "7px" }}>
                <Camera className="w-3 h-3" /> Ticket
              </div>
              {hasReceipt ? (
                <div className="flex flex-col items-center gap-1 text-amber-600 py-2">
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="font-black" style={{ fontSize: "8px" }}>CARGADO</span>
                </div>
              ) : (
                <>
                                    <div className="bg-white rounded border shadow-sm w-full flex justify-center">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(attachUrl)}`} alt="QR Adjuntar" className="w-[120px] h-[120px] max-w-full" />
                  </div>
                  <p className="text-muted-foreground" style={{ fontSize: "6.5px", lineHeight: 1.2 }}>Copiar link o escanear QR</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Separador */}
          <div className="border-t border-zinc-100 pt-2 mt-1"></div>

          {/* Botones de acción compactos */}
          <Button 
            onClick={handleDownloadPDF} 
            disabled={isSavingPdf} 
            variant="outline" 
            className="w-full h-8 border-zinc-300 font-bold shadow-sm"
            style={{ fontSize: "9px" }}
          >
            {isSavingPdf ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1 text-indigo-600" />}
            PDF
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => window.print()} 
            className="w-full h-8 border-zinc-300 font-bold"
            style={{ fontSize: "9px" }}
          >
            <Printer className="w-3 h-3 mr-1 text-emerald-600" />
            Imprimir
          </Button>

          {isSigned && (!voucherStatus?.hasPdf || (voucherStatus?.hasPdf && hasReceipt)) && (
            <Button 
              onClick={handleArchiveVoucher} 
              disabled={isSyncing} 
              className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
              style={{ fontSize: "9px" }}
              title={voucherStatus?.hasPdf ? "Regenerar PDF con comprobante" : "Archivar vale"}
            >
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
              {voucherStatus?.hasPdf ? "Re-archivar" : "Archivar"}
            </Button>
          )}

          {/* Estado */}
          <div className="mt-auto pt-2 border-t border-zinc-100 space-y-1.5">
            <div className="flex items-center gap-1.5" style={{ fontSize: "7px" }}>
              <QrCode className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-muted-foreground font-bold uppercase">
                {isSigned ? "Firmado" : "Pendiente"}
              </span>
            </div>
            <p className="text-[6px] text-muted-foreground">
              {voucherData.sucursal} · {voucherData.sheet}
            </p>
            {voucherStatus?.firmaMeta && (
              <div className="bg-indigo-50/50 rounded p-1.5 border border-indigo-100 space-y-0.5">
                <p className="text-[6px] font-black text-indigo-600 uppercase tracking-wider">Datos de Firma</p>
                <p className="text-[7px] text-indigo-900 font-bold">
                  {voucherStatus.firmaMeta.esMovil ? '📱' : '🖥️'} {new Date(voucherStatus.firmaMeta.fechaHora).toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: '2-digit' })} · {new Date(voucherStatus.firmaMeta.fechaHora).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[6px] text-indigo-500 capitalize truncate">
                  {voucherStatus.firmaMeta.plataforma}{voucherStatus.firmaMeta.tipoConexion ? ` · ${voucherStatus.firmaMeta.tipoConexion.toUpperCase()}` : ''}
                </p>
                <p className="text-[6px] text-indigo-400 truncate">
                  {voucherStatus.firmaMeta.zonaHoraria} · {voucherStatus.firmaMeta.idioma}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ===== PANEL DERECHO (85%) - Vale Compacto ===== */}
        <div className="flex-1 p-4 md:p-6 flex items-start justify-center print:p-0 print:block">
          <div className="print:hidden" style={{ transform: 'scale(0.82)', transformOrigin: 'top center' }}>
            <div className="bg-white rounded-xl shadow-2xl print:shadow-none transition-all overflow-hidden" id="vale-imprimible">
              <VoucherCard 
                id={voucherStatus?.id || voucherData.id}
                fecha={voucherData.fecha}
                entregado={voucherData.entregado}
                rubro={voucherData.rubro}
                concepto={voucherStatus?.concepto || voucherData.concepto}
                numVale={voucherData.numVale}
                monto={voucherStatus?.monto || voucherData.monto}
                sucursal={voucherData.sucursal}
                sheet={voucherData.sheet}
                signatureUrl={voucherStatus?.firmaUrl}
                comprobanteUrl={voucherStatus?.comprobanteUrl}
                motivoOmitido={voucherStatus?.motivoOmitido}
                autorizadoPor={voucherStatus?.autorizadoPor}
              />
            </div>
          </div>
          {/* Versión sin escala para impresión */}
          <div className="hidden print:block">
            <VoucherCard 
              id={voucherStatus?.id || voucherData.id}
              fecha={voucherData.fecha}
              entregado={voucherData.entregado}
              rubro={voucherData.rubro}
              concepto={voucherStatus?.concepto || voucherData.concepto}
              numVale={voucherData.numVale}
              monto={voucherStatus?.monto || voucherData.monto}
              sucursal={voucherData.sucursal}
              sheet={voucherData.sheet}
              signatureUrl={voucherStatus?.firmaUrl}
              comprobanteUrl={voucherStatus?.comprobanteUrl}
              motivoOmitido={voucherStatus?.motivoOmitido}
              autorizadoPor={voucherStatus?.autorizadoPor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ValePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-headline text-primary animate-pulse">Iniciando Visualizador...</div>}>
      <ValeContent />
    </Suspense>
  );
}
