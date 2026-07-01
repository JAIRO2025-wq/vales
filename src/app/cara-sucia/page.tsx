"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CONFIG } from "@/lib/config";
import { getRecentCyclesMensual, type CycleInfo } from "@/lib/cycles-mensual";
import { getVouchersByCycleAction, formatVoucherForApi, saveVoucherAction, deleteSignatureAction, deleteComprobanteAction, deleteVoucherAction, type FormattedVoucher } from "@/app/actions/vouchers";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  LayoutDashboard, 
  Search, 
  TrendingUp, 
  FileText, 
  CheckCircle,
  Building2,
  Calendar,
  RefreshCcw,
  Eye,
  Download,
  FileCheck,
  Receipt,
  Loader2,
  Archive,
  Trash2,
  Eraser,
  ImageOff,
  Signature,
  Upload,
  AlertTriangle
} from "lucide-react";

const BRANCH = "CARA SUCIA";

export default function CaraSuciaDashboard() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [vales, setVales] = useState<FormattedVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBatchExporting, setIsBatchExporting] = useState<string | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signingVoucher, setSigningVoucher] = useState<FormattedVoucher | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [filterCaja, setFilterCaja] = useState("TODAS");
  const [filterSearch, setFilterSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    // Ciclos MENSUALES para CARA SUCIA
    const recentCycles = getRecentCyclesMensual();
    setCycles(recentCycles);
    setSelectedCycle(recentCycles[0]?.id || "");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      const c = searchParams.get("caja");
      if (c) setFilterCaja(c.toUpperCase());
    }
  }, [searchParams, mounted]);

  const loadData = async () => {
    setLoading(true);
    try {
      const rawData = await getVouchersByCycleAction(selectedCycle);
      // Filtrar solo vales de CARA SUCIA
      const filteredRaw = rawData.filter(v => (v.sucursal || '').toUpperCase() === BRANCH);
      const origin = typeof window !== 'undefined' ? window.location.origin : "";
      const formatted = await Promise.all(filteredRaw.map(v => formatVoucherForApi(v, origin)));
      setVales(formatted);
    } catch (err) {
      console.error("Error cargando vales:", err);
      toast({ variant: "destructive", title: "Error de carga", description: "No se pudieron obtener los vales." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && selectedCycle) loadData();
  }, [selectedCycle, mounted]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterCaja, filterSearch, selectedCycle]);

  const handleViewVale = (vale: FormattedVoucher) => {
    const params = new URLSearchParams();
    params.set("fila", vale.raw.fila || "");
    params.set("sheet", vale.raw.sheet || "");
    params.set("id", vale.id);
    params.set("numVale", vale.raw.numVale || "");
    params.set("entregado", vale.raw.entregado || "");
    params.set("monto", vale.raw.monto || "");
    params.set("sucursal", vale.raw.sucursal || "");
    params.set("fecha", vale.raw.fecha || "");
    params.set("rubro", vale.raw.rubro || "");
    if (vale.raw.concepto) params.set("concepto", vale.raw.concepto);
    window.open(`/vale?${params.toString()}`, '_blank');
  };

  const buildImageUrl = (filePath: string | undefined, fecha: string): string | null => {
    if (!filePath) return null;
    if (filePath.startsWith('data:')) return filePath;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    if (filePath.startsWith('imagenes/') || filePath.startsWith('pdfs/')) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return `${origin}/api/imagenes?fecha=${encodeURIComponent(fecha)}&file=${encodeURIComponent(filePath)}`;
    }
    return filePath;
  };

  const getPayload = (voucher: any) => {
    const sheetUpper = (voucher.sheet || "").toUpperCase();
    const isCajaChica = sheetUpper.includes("CHICA") || sheetUpper === "HOJA 1" || sheetUpper.includes("GENERAL");
    const isClientes = sheetUpper.includes("CLIENTES");
    const isInstalaciones = sheetUpper.includes("INSTALACIONES");
    const isOtros = sheetUpper.includes("OTROS");
    const displayMonto = voucher.monto ? voucher.monto.replace(/[^\d.]/g, "") : "0.00";
    return {
      id: voucher.id,
      numero: voucher.numVale || "---",
      fecha: voucher.fecha,
      cajaChica: isCajaChica,
      clientes: isClientes,
      instalaciones: isInstalaciones,
      otrosGastos: isOtros,
      entregadoA: voucher.entregado,
      laSumaDe: `${displayMonto} Dólares exactos`,
      concepto: voucher.concepto || voucher.rubro,
      montoTotal: displayMonto,
      reintegro: "0.00",
      solicitante: voucher.entregado,
      autoriza: voucher.autorizadoPor || voucher.sucursal,
      firmaSolicitante: buildImageUrl(voucher.firmaUrlRaw ?? voucher.firmaUrl, voucher.fecha),
      comprobante: buildImageUrl(voucher.comprobanteUrlRaw ?? voucher.comprobanteUrl, voucher.fecha),
      fechaImagen: voucher.fecha
    };
  };

  const exportSinglePDF = async (voucherRaw: any) => {
    try {
      const payload = getPayload(voucherRaw);
      const baseApi = CONFIG.PDF_API_URL.replace(/\/$/, "");
      const response = await fetch(`${baseApi}/generate-vale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Error API");
      const data = await response.json();
      if (data.pdf_url) window.open(data.pdf_url, '_blank');
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo conectar con el motor de PDF." });
    }
  };

  const exportBatch = async (type: string) => {
    const targets = vales.filter(v => {
      const sheet = (v.raw.sheet || '').toUpperCase();
      if (type === "CHICA") return sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL");
      if (type === "CLIENTES") return sheet.includes("CLIENTES");
      if (type === "INSTALACIONES") return sheet.includes("INSTALACIONES");
      if (type === "OTROS") return sheet.includes("OTROS");
      return false;
    });

    if (targets.length === 0) {
      toast({ title: "Sin datos", description: `No hay vales de ${type} en CARA SUCIA para este ciclo.` });
      return;
    }

    setIsBatchExporting(type);
    toast({ title: "Preparando paquete", description: `Generando ZIP con ${targets.length} vales...` });
    try {
      const payloads = targets.map(v => getPayload(v.raw));
      const baseApi = CONFIG.PDF_API_URL.replace(/\/$/, "");
      const response = await fetch(`${baseApi}/generate-vale-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloads)
      });
      if (!response.ok) throw new Error("Error en el motor de PDF");
      const data = await response.json();
      if (data.zip_url) {
        window.location.href = data.zip_url;
        toast({ title: "Paquete listo", description: "Iniciando descarga del archivo ZIP." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el paquete ZIP masivo." });
    } finally {
      setIsBatchExporting(null);
    }
  };

  const handleAttachSignature = (vale: FormattedVoucher) => {
    setSigningVoucher(vale);
    setSelectedFile(null);
    setShowSignatureDialog(true);
  };

  const handleUploadSignature = async () => {
    if (!selectedFile || !signingVoucher) return;
    setIsUploadingSignature(true);
    try {
      const pythonBaseUrl = CONFIG.PDF_API_URL.replace(/\/$/, "");
      const formData = new FormData();
      const fileName = `admin_${signingVoucher.id}_firma_${Date.now()}.png`;
      formData.append('file', selectedFile, fileName);
      const uploadRes = await fetch(
        `${pythonBaseUrl}/upload-firma/${encodeURIComponent(signingVoucher.id)}`,
        { method: 'POST', body: formData }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => 'Sin detalle');
        throw new Error(`Error al subir firma (${uploadRes.status}): ${errText}`);
      }
      const uploadData = await uploadRes.json();
      const firmaPath = uploadData.image_url;
      const result = await saveVoucherAction({
        id: signingVoucher.raw.id,
        fila: signingVoucher.raw.fila,
        sheet: signingVoucher.raw.sheet,
        fecha: signingVoucher.raw.fecha,
        entregado: signingVoucher.raw.entregado,
        rubro: signingVoucher.raw.rubro,
        concepto: signingVoucher.raw.concepto,
        numVale: signingVoucher.raw.numVale,
        monto: signingVoucher.raw.monto,
        sucursal: signingVoucher.raw.sucursal,
        firmado: true,
        firmaUrl: firmaPath,
        timestamp: new Date().toISOString(),
        autorizadoPor: "ADMIN",
      });
      if (!result.success) throw new Error(result.error || "Error al guardar");
      setShowSignatureDialog(false);
      toast({ title: "Firma adjuntada", description: "La imagen de firma se agregó correctamente." });
      loadData();
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "No se pudo adjuntar la firma." });
    } finally {
      setIsUploadingSignature(false);
    }
  };

  if (!mounted) return null;

  const getMontoNum = (monto: string | undefined): number => {
    return parseFloat((monto || '0').replace(/[^\d.]/g, '')) || 0;
  };

  const stats = {
    total: vales.length,
    firmados: vales.filter(v => v.firmado).length,
    conTicket: vales.filter(v => v.comprobante).length,
    montoTotal: vales.reduce((acc, curr) => acc + getMontoNum(curr.raw.monto), 0)
  };

  const filteredVales = vales.filter(v => {
    const sheet = (v.raw.sheet || '').toUpperCase();
    let matchesCaja = filterCaja === "TODAS";
    if (filterCaja === "CAJA CHICA") matchesCaja = sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL");
    if (filterCaja === "CLIENTES") matchesCaja = sheet.includes("CLIENTES");
    if (filterCaja === "INSTALACIONES") matchesCaja = sheet.includes("INSTALACIONES");
    if (filterCaja === "OTROS GASTOS") matchesCaja = sheet.includes("OTROS");

    const searchTerm = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchTerm || (
      (v.raw.entregado || '').toLowerCase().includes(searchTerm) ||
      (v.raw.rubro || '').toLowerCase().includes(searchTerm) ||
      (v.raw.concepto || '').toLowerCase().includes(searchTerm) ||
      (v.raw.numVale || '').includes(searchTerm) ||
      (v.raw.fecha || '').includes(searchTerm) ||
      (v.raw.monto || '').includes(searchTerm) ||
      sheet.includes(searchTerm) ||
      v.id.toLowerCase().includes(searchTerm)
    );
    return matchesCaja && matchesSearch;
  });

  const sortedVales = [...filteredVales].sort((a, b) => {
    const numA = parseInt(a.raw.numVale) || 0;
    const numB = parseInt(b.raw.numVale) || 0;
    return numA - numB;
  });

  const totalPages = Math.ceil(sortedVales.length / ITEMS_PER_PAGE);
  const paginatedVales = sortedVales.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="p-2 md:p-4 space-y-3 max-w-7xl mx-auto pb-20">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-xl font-bold font-headline text-amber-800 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> 
            CARA SUCIA — Panel de Auditoría
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Ciclo mensual · Gestión de desembolsos
            <span className="ml-2 text-amber-600 font-bold">🟡 Sub App</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={loadData} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="w-[220px] h-9 border-2 border-amber-300 text-xs">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              <SelectValue placeholder="Ciclo Mensual" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card className="border-l-4 border-l-amber-600 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-muted-foreground uppercase">Total Ciclo</p>
                <p className="text-xl font-black font-headline">{stats.total}</p>
              </div>
              <FileText className="w-5 h-5 text-amber-600/20" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-600 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-emerald-600 uppercase">Firmados</p>
                <p className="text-xl font-black font-headline text-emerald-700">{stats.firmados}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-emerald-600/10" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-amber-600 uppercase">Tickets</p>
                <p className="text-xl font-black font-headline text-amber-700">{stats.conTicket}</p>
              </div>
              <Receipt className="w-5 h-5 text-amber-600/10" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-600 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-indigo-600 uppercase">Gasto Total</p>
                <p className="text-xl font-black font-headline text-indigo-700">$ {stats.montoTotal.toFixed(2)}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-indigo-600/10" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BATCH EXPORT */}
      <Card className="bg-amber-50/30 border-dashed border-2 border-amber-200">
        <CardHeader className="py-1.5 px-3">
          <CardTitle className="text-[11px] font-bold flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Acciones de Lote (Descarga ZIP)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 pb-2 px-3">
          {["CHICA", "CLIENTES", "INSTALACIONES", "OTROS"].map(type => (
            <Button 
              key={type}
              variant="outline" 
              size="sm" 
              className="bg-white h-7 text-[10px]"
              disabled={!!isBatchExporting}
              onClick={() => exportBatch(type)}
            >
              {isBatchExporting === type ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Archive className="w-3 h-3 mr-1.5" />}
              ZIP {{CHICA:"Caja Chica", CLIENTES:"Clientes", INSTALACIONES:"Instalaciones", OTROS:"Otros Gastos"}[type]}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* SIGNATURE DIALOG */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Signature className="w-5 h-5 text-green-600" />
              Adjuntar firma
            </DialogTitle>
            <DialogDescription>
              {signingVoucher && (
                <>Seleccioná una imagen de firma para <strong>{signingVoucher.raw.entregado}</strong> · Vale #{signingVoucher.raw.numVale}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('cs-signature-file-input')?.click()}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-32 h-16 mx-auto bg-muted rounded flex items-center justify-center overflow-hidden">
                    <img src={URL.createObjectURL(selectedFile)} alt="Vista previa" className="max-w-full max-h-full object-contain" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Hacé clic para seleccionar una imagen</p>
                  <p className="text-[10px] text-muted-foreground">PNG, JPG o WEBP · Firma del responsable</p>
                </div>
              )}
              <input id="cs-signature-file-input" type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSignatureDialog(false)} disabled={isUploadingSignature}>Cancelar</Button>
            <Button onClick={handleUploadSignature} disabled={!selectedFile || isUploadingSignature}>
              {isUploadingSignature ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Subiendo...</> : <><Upload className="w-4 h-4 mr-1.5" /> Adjuntar firma</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TABLE */}
      <Card className="shadow-xl">
        <CardHeader className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2 border-b py-2 px-3">
          <CardTitle className="font-headline text-base text-amber-800">Registro de Actividad — CARA SUCIA</CardTitle>
          <div className="flex flex-wrap gap-1.5 w-full xl:w-auto">
            <div className="relative min-w-[160px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar vale, fecha, monto, persona..." className="pl-8 h-8 border-2 text-xs"
                value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
            </div>
            <Select value={filterCaja} onValueChange={setFilterCaja}>
              <SelectTrigger className="h-8 w-[160px] border-2 text-xs">
                <Receipt className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Tipo Caja" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todos los Tipos</SelectItem>
                <SelectItem value="CAJA CHICA">Caja Chica</SelectItem>
                <SelectItem value="CLIENTES">Caja Clientes</SelectItem>
                <SelectItem value="INSTALACIONES">Caja Instalaciones</SelectItem>
                <SelectItem value="OTROS GASTOS">Otros Gastos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-amber-50/50">
                <TableRow>
                  <TableHead className="font-bold">Fecha</TableHead>
                  <TableHead className="font-bold">N° Vale</TableHead>
                  <TableHead className="font-bold">Personal</TableHead>
                  <TableHead className="font-bold">Tipo de Caja</TableHead>
                  <TableHead className="font-bold text-right">Monto</TableHead>
                  <TableHead className="font-bold text-center">Estado</TableHead>
                  <TableHead className="font-bold">Firma</TableHead>
                  <TableHead className="text-right font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Cargando vales de CARA SUCIA...</TableCell>
                  </TableRow>
                ) : paginatedVales.length > 0 ? (
                  paginatedVales.map((vale) => (
                    <TableRow key={vale.id} className="hover:bg-amber-50/30 cursor-pointer" onClick={() => handleViewVale(vale)}>
                      <TableCell className="text-[10px] font-mono">{vale.raw.fecha}</TableCell>
                      <TableCell className="font-black text-amber-800">
                        <div className="flex items-center gap-2">
                          {vale.raw.numVale}
                          {vale.archivado && <FileCheck className="w-3 h-3 text-emerald-600" />}
                        </div>
                      </TableCell>
                      <TableCell className="uppercase text-xs font-medium">
                        {vale.raw.entregado}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] uppercase font-bold">{vale.raw.sheet}</Badge>
                      </TableCell>
                      <TableCell className="font-black text-indigo-700 text-right">{vale.raw.monto}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {vale.firmado ? (
                            <Badge className="bg-emerald-600 font-bold text-[9px]">FIRMADO</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] opacity-40">PENDIENTE</Badge>
                          )}
                          {vale.comprobante && <span title="Ticket adjunto"><Receipt className="w-3.5 h-3.5 text-amber-600" /></span>}
                          {vale.archivado && <span title="PDF archivado"><FileCheck className="w-3.5 h-3.5 text-indigo-600" /></span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-[9px] text-muted-foreground">
                        {vale.raw.firmaMeta ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              {vale.raw.firmaMeta.esMovil ? '📱' : '🖥️'}
                              <span className="font-bold text-foreground">
                                {new Date(vale.raw.firmaMeta.fechaHora).toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit' })}
                                {' '}
                                {new Date(vale.raw.firmaMeta.fechaHora).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="text-[8px] capitalize truncate max-w-[120px]">
                              {vale.raw.firmaMeta.plataforma}{vale.raw.firmaMeta.tipoConexion && ` · ${vale.raw.firmaMeta.tipoConexion.toUpperCase()}`}
                            </div>
                          </div>
                        ) : vale.firmado ? (
                          <span className="text-[9px] italic">Sin metadata</span>
                        ) : <span className="text-[9px] text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleViewVale(vale)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportSinglePDF(vale.raw)}>
                            <Download className="w-4 h-4" />
                          </Button>
                          {!vale.firmado && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-50"
                              title="Adjuntar firma (admin)" onClick={(e) => { e.stopPropagation(); handleAttachSignature(vale); }}>
                              <Signature className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {vale.firmado && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar firma" onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm('¿Eliminar la firma de este vale?')) return;
                                const result = await deleteSignatureAction(vale.id, vale.raw.fecha);
                                if (result.success) { toast({ title: 'Firma eliminada' }); loadData(); }
                                else { toast({ variant: 'destructive', title: 'Error', description: result.error }); }
                              }}>
                              <Eraser className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {vale.comprobante && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                              title="Eliminar comprobante" onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm('¿Eliminar el comprobante/ticket de este vale?')) return;
                                const result = await deleteComprobanteAction(vale.id, vale.raw.fecha);
                                if (result.success) { toast({ title: 'Comprobante eliminado' }); loadData(); }
                                else { toast({ variant: 'destructive', title: 'Error', description: result.error }); }
                              }}>
                              <ImageOff className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                            title="Eliminar vale" onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm('¿Eliminar este vale permanentemente?')) return;
                              const result = await deleteVoucherAction(vale.id, vale.raw.fecha);
                              if (result.success) { toast({ title: 'Vale eliminado' }); loadData(); }
                              else { toast({ variant: 'destructive', title: 'Error', description: result.error }); }
                            }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No hay vales registrados en CARA SUCIA para este ciclo.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="flex items-center text-xs font-bold text-muted-foreground px-3">
            Pág {currentPage} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
