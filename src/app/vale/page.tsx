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
  ClipboardCopy,
  UserCheck,
  Users
} from "lucide-react";
import { checkVoucherStatusAction, savePdfAction, saveVoucherAction, notifyArchiveAction, type VoucherRecord, type VoucherStatusResult } from "@/app/actions/vouchers";
import { getFirmaAutorizadaAction } from "@/app/actions/firmas-autorizadas";
import { useToast } from "@/hooks/use-toast";
import { CONFIG } from "@/lib/config";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  
  // Autorizador
  const [tipoAutorizador, setTipoAutorizador] = useState<'CAJERA' | 'JEFE' | null>(
    voucherData.id ? null : 'CAJERA'
  );
  const [firmaAutorizadorUrl, setFirmaAutorizadorUrl] = useState<string | null>(null);
  const [isSavingAutorizador, setIsSavingAutorizador] = useState(false);
  const [autorizadorGuardado, setAutorizadorGuardado] = useState(false);
  const [tokenJefe, setTokenJefe] = useState<string | null>(null);

  useEffect(() => {
    const initVoucher = async () => {
      if (!voucherData.id) return;
      try {
        // Consultamos si ya existe en disco (búsqueda multicine)
        const existingStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        
        // SIEMPRE guardamos/actualizamos con los datos FRESCOS de la URL.
        // Esto permite que cuando Excel cambia el monto, concepto, entregado, etc.,
        // el vale se actualice en el sistema con los nuevos valores.
        // saveVoucherAction preserva firma/comprobante si ya existían.
        const voucherToSave: any = {
          ...voucherData,
          firmado: existingStatus?.firmado || false,
          firmaUrl: existingStatus?.firmaUrlRaw,
          comprobanteUrl: existingStatus?.comprobanteUrlRaw,
          motivoOmitido: existingStatus?.motivoOmitido,
          autorizadoPor: existingStatus?.autorizadoPor,
          timestamp: existingStatus?.timestamp || new Date().toISOString()
        };
        await saveVoucherAction(voucherToSave);

        // Volvemos a consultar (con origen real) para tener el estado actualizado
        const finalStatus = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
        if (finalStatus) {
          setVoucherStatus(finalStatus);
          // Si el vale ya tiene autorizador, cargarlo
          if (finalStatus.tipoAutorizador) {
            setTipoAutorizador(finalStatus.tipoAutorizador as 'CAJERA' | 'JEFE');
            setFirmaAutorizadorUrl(finalStatus.firmaAutorizadorUrl || null);
            setAutorizadorGuardado(true);
            setTokenJefe(finalStatus.tokenJefe || null);
          }
        }

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
      concepto: voucherData.concepto || voucherData.rubro,
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

  const handleSaveAutorizador = async () => {
    if (!tipoAutorizador || !voucherData.id) return;
    setIsSavingAutorizador(true);
    try {
      // Obtener firma del autorizador desde firmas-autorizadas
      const firma = await getFirmaAutorizadaAction(voucherData.sucursal, tipoAutorizador);
      let firmaUrl = firma?.firmaUrl || null;
      const autorizadorNombre = firma?.nombre || null;
      
      // Resolver URL: si es relativa, anteponer servidor Python
      if (firmaUrl && !firmaUrl.startsWith('http://') && !firmaUrl.startsWith('https://') && !firmaUrl.startsWith('data:')) {
        const pythonBase = (CONFIG.PDF_API_URL || '').endsWith('/')
          ? CONFIG.PDF_API_URL.slice(0, -1)
          : CONFIG.PDF_API_URL;
        firmaUrl = firmaUrl.startsWith('/') ? `${pythonBase}${firmaUrl}` : `${pythonBase}/${firmaUrl}`;
      }
      
      // Generar token para JEFE si aplica
      const token = tipoAutorizador === 'JEFE'
        ? `jefe-${voucherData.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        : null;
      setTokenJefe(token);
      
      // Guardar en el voucher
      const voucherToSave: any = {
        ...voucherData,
        firmado: false,
        tipoAutorizador,
        firmaAutorizadorUrl: firmaUrl,
        autorizadoPorJefe: tipoAutorizador === 'CAJERA',
        autorizadoPor: autorizadorNombre,
        tokenJefe: token,
        timestamp: new Date().toISOString(),
      };
      await saveVoucherAction(voucherToSave);

      setFirmaAutorizadorUrl(firmaUrl);
      setAutorizadorGuardado(true);
      
      // Refrescar estado
      const status = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
      if (status) setVoucherStatus(status);
    } catch (err) {
      console.error("Error guardando autorizador:", err);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el autorizador.' });
    } finally {
      setIsSavingAutorizador(false);
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

  /** Construye el estado legible para la columna H del Excel */
  const getEstadoTexto = (): string => {
    if (voucherStatus?.motivoOmitido) return `⚠️ Omitido: ${voucherStatus.motivoOmitido}`;
    if (voucherStatus?.firmado) return '✅ Firmado';
    return '⏳ Pendiente';
  };

  /** Construye el texto del comprobante para la columna J */
  const getComprobanteTexto = (): string => {
    if (voucherStatus?.comprobanteUrl) return '✅ Comprobante OK';
    return '🔴 Pendiente';
  };

  /** 
   * Genera la fórmula HYPERLINK de Excel (formato español) para la columna I.
   * Ej: =HIPERVINCULO("https://..."; "🔗 Ver vale firmado #3")
   */
  const getLinkFormula = (): string => {
    const url = `${baseUrl}/vale?${queryParams}`;
    const texto = voucherStatus?.firmado
      ? `🔗 Ver vale firmado #${voucherData.numVale}`
      : `🔗 Abrir vale #${voucherData.numVale}`;
    return `=HIPERVINCULO("${url}"; "${texto}")`;
  };

  /** 
   * Copia los 4 datos al portapapeles en formato TSV (tab-separated)
   * para pegarlos directamente en Excel en 4 columnas: H, I, J, K.
   */
  const handleCopyExcelData = async () => {
    const estado = getEstadoTexto();
    const link = getLinkFormula();
    const comprobante = getComprobanteTexto();
    const id = voucherData.id;

    // Tab-separated: al pegarlo en Excel, cada valor va en una columna distinta
    const tsv = `${estado}\t${link}\t${comprobante}\t${id}`;

    try {
      await navigator.clipboard.writeText(tsv);
      toast({
        title: "📋 Datos copiados",
        description: "Listo para pegar en Excel (4 columnas: H, I, J, K).",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo copiar al portapapeles.",
      });
    }
  };

    return (
    <div className="min-h-screen bg-zinc-100 print:bg-white print:p-0">
      {/* Paso 1: Selección de autorizador (solo si el vale no está firmado y no tiene autorizador previo) */}
      {!autorizadorGuardado && !isChecking && !isSigned && !voucherStatus?.tipoAutorizador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
          <Card className="w-full max-w-md shadow-2xl border-none animate-in zoom-in duration-300">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-lg font-headline flex items-center justify-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                ¿Quién autoriza el egreso?
              </CardTitle>
              <CardDescription className="text-xs">
                Selecciona quién está autorizando este vale
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTipoAutorizador('CAJERA')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    tipoAutorizador === 'CAJERA'
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-zinc-200 hover:border-primary/30'
                  }`}
                >
                  <UserCheck className="w-8 h-8 mx-auto mb-2 text-green-600" />
                  <span className="text-sm font-bold block">Cajera</span>
                  <span className="text-[10px] text-muted-foreground">Por defecto</span>
                </button>
                <button
                  onClick={() => setTipoAutorizador('JEFE')}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    tipoAutorizador === 'JEFE'
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-zinc-200 hover:border-purple-300'
                  }`}
                >
                  <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                  <span className="text-sm font-bold block">Jefe de Agencia</span>
                  <span className="text-[10px] text-muted-foreground">Requiere validación extra</span>
                </button>
              </div>
              {tipoAutorizador === 'JEFE' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-800">
                  <strong>Importante:</strong> Al seleccionar Jefe, se generará un QR adicional que el jefe deberá escanear para autorizar. Solo después de eso podrás firmar y subir comprobante.
                </div>
              )}
              <Button
                onClick={handleSaveAutorizador}
                disabled={!tipoAutorizador || isSavingAutorizador}
                className="w-full h-12 text-sm font-bold"
              >
                {isSavingAutorizador ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {tipoAutorizador === 'JEFE' ? 'Confirmar Jefe y Generar QR' : 'Confirmar Cajera'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* QR de autorización del Jefe (visible cuando se seleccionó JEFE y aún no autoriza) */}
      {autorizadorGuardado && tipoAutorizador === 'JEFE' && !voucherStatus?.autorizadoPorJefe && !voucherStatus?.firmado && (
        <div className="fixed bottom-4 right-4 z-40 print:hidden">
          <Card className="shadow-2xl border-purple-300 border-2 animate-in slide-in-from-right duration-500">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-xs font-bold text-purple-800">Pendiente: Autorización de Jefe</p>
                  <p className="text-[10px] text-muted-foreground">Envía este QR al jefe para que autorice</p>
                </div>
              </div>
              <div className="bg-white rounded border shadow-sm flex justify-center p-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${baseUrl}/autorizar-vale?token=${encodeURIComponent(tokenJefe || '')}`)}`}
                  alt="QR Autorización Jefe"
                  className="w-[120px] h-[120px]"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-[10px]"
                onClick={() => {
                  const url = `${baseUrl}/autorizar-vale?token=${encodeURIComponent(tokenJefe || '')}`;
                  navigator.clipboard.writeText(url);
                  toast({ title: 'Link copiado', description: 'Envía este link al jefe para autorizar.' });
                }}
              >
                <ClipboardCopy className="w-3 h-3 mr-1" /> Copiar link de autorización
              </Button>
              <p className="text-[8px] text-muted-foreground text-center">
                El vale se actualizará automáticamente cuando el jefe autorice
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bloqueo: si JEFE seleccionado pero no autorizado, bloquear firma/comprobante */}
      {autorizadorGuardado && tipoAutorizador === 'JEFE' && !voucherStatus?.autorizadoPorJefe && !voucherStatus?.firmado && (
        <div className="fixed inset-0 z-30 pointer-events-none print:hidden">
          <div className="absolute inset-0 bg-black/5" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-2 shadow-lg">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Esperando autorización del Jefe de Agencia...
              </p>
            </div>
          </div>
        </div>
      )}

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

          {/* Separador antes del botón Excel */}
          <div className="border-t border-zinc-100 pt-1 mt-1"></div>

          {/* Botón copiar datos para Excel (respaldo manual) */}
          <Button
            onClick={handleCopyExcelData}
            variant="outline"
            className="w-full h-7 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold shadow-sm"
            style={{ fontSize: "7.5px" }}
            title="Copia los 4 datos (Estado, Link, Comprobante, ID) para pegar en Excel"
          >
            <ClipboardCopy className="w-3 h-3 mr-1 text-amber-600" />
            📋 Excel 4 cols
          </Button>

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
                concepto={voucherData.concepto || voucherData.rubro}
                numVale={voucherData.numVale}
                monto={voucherData.monto}
                sucursal={voucherData.sucursal}
                sheet={voucherData.sheet}
                signatureUrl={voucherStatus?.firmaUrl}
                comprobanteUrl={voucherStatus?.comprobanteUrl}
                motivoOmitido={voucherStatus?.motivoOmitido}
                autorizadoPor={voucherStatus?.autorizadoPor}
                tipoAutorizador={tipoAutorizador}
                firmaAutorizadorUrl={firmaAutorizadorUrl || voucherStatus?.firmaAutorizadorUrl}
                autorizadoPorJefe={voucherStatus?.autorizadoPorJefe}
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
              concepto={voucherData.concepto || voucherData.rubro}
              numVale={voucherData.numVale}
              monto={voucherData.monto}
              sucursal={voucherData.sucursal}
              sheet={voucherData.sheet}
              signatureUrl={voucherStatus?.firmaUrl}
              comprobanteUrl={voucherStatus?.comprobanteUrl}
              motivoOmitido={voucherStatus?.motivoOmitido}
              autorizadoPor={voucherStatus?.autorizadoPor}
              tipoAutorizador={tipoAutorizador}
              firmaAutorizadorUrl={firmaAutorizadorUrl || voucherStatus?.firmaAutorizadorUrl}
              autorizadoPorJefe={voucherStatus?.autorizadoPorJefe}
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
