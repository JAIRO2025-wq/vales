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
  Signature,
  Copy
} from "lucide-react";
import { checkVoucherStatusAction, savePdfAction, saveVoucherAction, type VoucherRecord } from "@/app/actions/vouchers";
import { useToast } from "@/hooks/use-toast";
import { CONFIG } from "@/lib/config";

function ValeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const [voucherStatus, setVoucherStatus] = useState<VoucherRecord | null>(null);
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
        const status = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        if (status) {
          setVoucherStatus(status);
        } else {
          await saveVoucherAction({
            ...voucherData,
            firmado: false,
            timestamp: new Date().toISOString()
          } as any);
          const newStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
          if (newStatus) setVoucherStatus(newStatus);
        }
      } catch (e) {
        console.error("Error inicializando vale:", e);
      } finally {
        setIsChecking(false);
      }
    };
    
    initVoucher();
    
    const interval = setInterval(async () => {
      if (!voucherData.id) return;
      const status = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
      if (status) setVoucherStatus(status);
    }, 4000); 
    
    return () => clearInterval(interval);
  }, [voucherData.id, voucherData.fecha]);

  const preparePayload = () => {
    const sheetUpper = (voucherData.sheet || "").toUpperCase();
    const isCajaChica = sheetUpper.includes("CHICA") || sheetUpper === "HOJA 1" || sheetUpper.includes("GENERAL");
    const isClientes = sheetUpper.includes("CLIENTES");
    const isInstalaciones = sheetUpper.includes("INSTALACIONES");
    const isOtros = sheetUpper.includes("OTROS");
    const displayMonto = voucherData.monto ? voucherData.monto.replace(/[^\d.]/g, "") : "0.00";

    return {
      id: voucherStatus?.id || voucherData.id,
      numero: voucherData.numVale || "---",
      fecha: voucherData.fecha,
      cajaChica: isCajaChica,
      clientes: isClientes,
      instalaciones: isInstalaciones,
      otrosGastos: isOtros,
      entregadoA: voucherData.entregado,
      laSumaDe: `${displayMonto} Dólares exactos`,
      concepto: voucherStatus?.concepto || voucherData.concepto || voucherData.rubro,
      montoTotal: displayMonto,
      reintegro: "0.00",
      solicitante: voucherData.entregado,
      autoriza: voucherStatus?.autorizadoPor || voucherData.sucursal,
      firmaSolicitante: voucherStatus?.firmaUrl || null,
      comprobante: voucherStatus?.comprobanteUrl || null
    };
  };

  const handleDownloadPDF = async () => {
    setIsSavingPdf(true);
    try {
      const payload = preparePayload();
      // Normalizar URL de la API para evitar doble //
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
      const payload = preparePayload();
      // Normalizar URL de la API para evitar doble //
      const baseApi = CONFIG.PDF_API_URL.endsWith('/') ? CONFIG.PDF_API_URL.slice(0, -1) : CONFIG.PDF_API_URL;
      
      const response = await fetch(`${baseApi}/generate-vale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Error al generar PDF");
      const data = await response.json();
      if (!data.pdf_url) throw new Error("URL de PDF no recibida");

      const pdfResponse = await fetch(data.pdf_url);
      const pdfBlob = await pdfResponse.blob();
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        await savePdfAction(voucherData.id, voucherData.fecha, voucherData.numVale, base64data);
        await fetch(CONFIG.API_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fila: voucherData.fila,
            sheet: voucherData.sheet,
            id: voucherData.id,
            pdfUrl: `${window.location.origin}/vale?${new URLSearchParams(voucherData as any).toString()}`,
            metodo: "updatePdf"
          }),
        });
        toast({ title: "Completado", description: "Documento archivado con éxito." });
        setVoucherStatus(prev => prev ? { ...prev, hasPdf: true } : null);
      };
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
    <div className="min-h-screen bg-zinc-100 p-4 md:p-10 flex flex-col items-center gap-6 print:bg-white print:p-0">
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

      <div className="flex flex-wrap gap-3 justify-center print:hidden bg-white p-3 rounded-2xl shadow-xl border border-zinc-200 sticky top-4 z-40">
        <Button onClick={handleDownloadPDF} disabled={isSavingPdf} variant="outline" className="h-11 px-5 border-zinc-300 font-bold text-sm shadow-sm">
          {isSavingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2 text-indigo-600" />}
          PDF Profesional
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="h-11 px-5 border-zinc-300 font-bold text-sm">
          <Printer className="w-4 h-4 mr-2 text-emerald-600" />
          Imprimir
        </Button>
        {isSigned && !voucherStatus?.hasPdf && (
           <Button onClick={handleArchiveVoucher} disabled={isSyncing} className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg">
           {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
           Finalizar y Archivar
         </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-[850px] print:hidden">
        <Card className="border-2 border-dashed border-zinc-300 bg-white/50 cursor-pointer hover:bg-white transition-colors" onClick={handleCopySignLink}>
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="flex items-center gap-2 text-zinc-600 font-bold uppercase text-xs">
              <Signature className="w-4 h-4" /> 1. Firma del Recibido
            </div>
            {isSigned ? (
              <div className="py-8 flex flex-col items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-12 h-12" />
                <span className="font-black text-sm uppercase">Firma Registrada</span>
              </div>
            ) : (
              <>
                <div className="bg-white p-2 rounded-lg border shadow-inner">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(signUrl)}`} alt="QR Firma" className="w-32 h-32" />
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">Haz clic para copiar link de firma o escanea QR.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed border-zinc-300 bg-white/50 cursor-pointer hover:bg-white transition-colors" onClick={handleCopyAttachLink}>
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="flex items-center gap-2 text-zinc-600 font-bold uppercase text-xs">
              <Camera className="w-4 h-4" /> 2. Adjuntar Ticket
            </div>
            {hasReceipt ? (
              <div className="py-8 flex flex-col items-center gap-2 text-amber-600">
                <CheckCircle2 className="w-12 h-12" />
                <span className="font-black text-sm uppercase">Ticket Cargado</span>
              </div>
            ) : (
              <>
                <div className="bg-white p-2 rounded-lg border shadow-inner">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(attachUrl)}`} alt="QR Adjuntar" className="w-32 h-32" />
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">Haz clic para copiar link de ticket o escanea QR.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="bg-white p-1 rounded-xl shadow-2xl print:shadow-none transition-all" id="vale-imprimible">
        <VoucherCard 
          id={voucherStatus?.id || voucherData.id}
          fecha={voucherData.fecha}
          entregado={voucherData.entregado}
          rubro={voucherData.rubro}
          concepto={voucherStatus?.concepto || voucherData.concepto}
          numVale={voucherData.numVale}
          monto={voucherData.monto}
          sucursal={voucherData.sucursal}
          sheet={voucherData.sheet}
          signatureUrl={voucherStatus?.firmaUrl}
          comprobanteUrl={voucherStatus?.comprobanteUrl}
          motivoOmitido={voucherStatus?.motivoOmitido}
          autorizadoPor={voucherStatus?.autorizadoPor}
        />
      </div>
      <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest pb-10 print:hidden flex items-center gap-2">
        <QrCode className="w-3 h-3" /> Control de Flujo Digital v5.0 • Flynet
      </p>
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
