"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CONFIG } from "@/lib/config";
import { getRecentCycles, type CycleInfo } from "@/lib/cycles";
import { getVouchersByCycleAction, formatVoucherForApi, deleteSignatureAction, deleteComprobanteAction, deleteVoucherAction, type FormattedVoucher } from "@/app/actions/vouchers";
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
  AlertTriangle
} from "lucide-react";

function AdminContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [vales, setVales] = useState<FormattedVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBatchExporting, setIsBatchExporting] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [filterSucursal, setFilterSucursal] = useState("TODAS");
  const [filterCaja, setFilterCaja] = useState("TODAS");
  const [filterSearch, setFilterSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    // Calcular ciclos SIEMPRE en el cliente para evitar desfases de zona horaria del servidor
    const recentCycles = getRecentCycles();
    setCycles(recentCycles);
    setSelectedCycle(recentCycles[0]?.id || "");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      const s = searchParams.get("sucursal");
      const c = searchParams.get("caja");
      if (s) setFilterSucursal(s);
      if (c) setFilterCaja(c.toUpperCase());
    }
  }, [searchParams, mounted]);

  const loadData = async () => {
    setLoading(true);
    try {
      const rawData = await getVouchersByCycleAction(selectedCycle);
      const origin = typeof window !== 'undefined' ? window.location.origin : "";
      const formatted = await Promise.all(rawData.map(v => formatVoucherForApi(v, origin)));
      setVales(formatted);
    } catch (err) {
      console.error("Error cargando vales:", err);
      toast({ variant: "destructive", title: "Error de carga", description: "No se pudieron obtener los vales." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && selectedCycle) {
      loadData();
    }
  }, [selectedCycle, mounted]);

  // Resetear página al cambiar filtros o ciclo
  useEffect(() => {
    setCurrentPage(1);
  }, [filterSucursal, filterCaja, filterSearch, selectedCycle]);

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

    /**
   * Construye la URL para que el servidor Python descargue la imagen directamente.
   */
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
            // Enviamos URL al servidor Python en vez de base64 enorme
      // Usamos firmaUrlRaw/comprobanteUrlRaw (rutas originales del storage)
      // para construir URLs completas que el servidor Python pueda descargar
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
      const sheet = v.raw.sheet.toUpperCase();
      if (type === "CHICA") return sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL");
      if (type === "CLIENTES") return sheet.includes("CLIENTES");
      if (type === "INSTALACIONES") return sheet.includes("INSTALACIONES");
      if (type === "OTROS") return sheet.includes("OTROS");
      return false;
    });

    if (targets.length === 0) {
      toast({ title: "Sin datos", description: ` No hay vales de ${type} para este ciclo.` });
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
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el paquete ZIP masivo." });
    } finally {
      setIsBatchExporting(null);
    }
  };

  if (!mounted) return null;

  const stats = {
    total: vales.length,
    firmados: vales.filter(v => v.firmado).length,
    conTicket: vales.filter(v => v.comprobante).length,
    montoTotal: vales.reduce((acc, curr) => {
      const cleanMonto = parseFloat(curr.raw.monto.replace(/[^\d.]/g, '')) || 0;
      return acc + cleanMonto;
    }, 0)
  };

  const filteredVales = vales.filter(v => {
    const matchesSucursal = filterSucursal === "TODAS" || v.raw.sucursal.toUpperCase() === filterSucursal;
    
    const sheet = v.raw.sheet.toUpperCase();
    let matchesCaja = filterCaja === "TODAS";
    if (filterCaja === "CAJA CHICA") matchesCaja = sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL");
    if (filterCaja === "CLIENTES") matchesCaja = sheet.includes("CLIENTES");
    if (filterCaja === "INSTALACIONES") matchesCaja = sheet.includes("INSTALACIONES");
    if (filterCaja === "OTROS GASTOS") matchesCaja = sheet.includes("OTROS");

    const searchTerm = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchTerm || (
      v.raw.entregado.toLowerCase().includes(searchTerm) ||
      v.raw.rubro.toLowerCase().includes(searchTerm) ||
      (v.raw.concepto && v.raw.concepto.toLowerCase().includes(searchTerm)) ||
      v.raw.numVale.includes(searchTerm) ||
      v.raw.fecha.includes(searchTerm) ||
      v.raw.monto.includes(searchTerm) ||
      v.raw.sucursal.toLowerCase().includes(searchTerm) ||
      v.raw.sheet.toLowerCase().includes(searchTerm) ||
      v.id.toLowerCase().includes(searchTerm) ||
      (v.raw.autorizadoPor && v.raw.autorizadoPor.toLowerCase().includes(searchTerm)) ||
      (v.raw.motivoOmitido && v.raw.motivoOmitido.toLowerCase().includes(searchTerm)) ||
      // Buscar por metadata de firma
      (v.raw.firmaMeta && (
        v.raw.firmaMeta.plataforma.toLowerCase().includes(searchTerm) ||
        v.raw.firmaMeta.zonaHoraria.toLowerCase().includes(searchTerm) ||
        v.raw.firmaMeta.idioma.toLowerCase().includes(searchTerm) ||
        (v.raw.firmaMeta.tipoConexion && v.raw.firmaMeta.tipoConexion.toLowerCase().includes(searchTerm)) ||
        v.raw.firmaMeta.fechaHora.includes(searchTerm)
      ))
    );
    return matchesSucursal && matchesCaja && matchesSearch;
  });

  // Ordenar por número de vale (ascendente)
  const sortedVales = [...filteredVales].sort((a, b) => {
    const numA = parseInt(a.raw.numVale) || 0;
    const numB = parseInt(b.raw.numVale) || 0;
    return numA - numB;
  });

  // Paginación
  const totalPages = Math.ceil(sortedVales.length / ITEMS_PER_PAGE);
  const paginatedVales = sortedVales.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="p-2 md:p-4 space-y-3 max-w-7xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-xl font-bold font-headline text-primary flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5" /> 
            Panel de Auditoría
          </h1>
          <p className="text-[10px] text-muted-foreground">Ciclo contable y gestión de desembolsos.</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={loadData} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="w-[220px] h-9 border-2 border-primary/20 text-xs">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" />
              <SelectValue placeholder="Ciclo" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card className="border-l-4 border-l-primary shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black text-muted-foreground uppercase">Total Ciclo</p>
                <p className="text-xl font-black font-headline">{stats.total}</p>
              </div>
              <FileText className="w-5 h-5 text-primary/10" />
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

      <Card className="bg-muted/30 border-dashed border-2">
        <CardHeader className="py-1.5 px-3">
          <CardTitle className="text-[11px] font-bold flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Acciones de Lote (Descarga ZIP)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 pb-2 px-3">
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white h-7 text-[10px]"
            disabled={!!isBatchExporting}
            onClick={() => exportBatch("CHICA")}
          >
            {isBatchExporting === "CHICA" ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Archive className="w-3 h-3 mr-1.5" />}
            ZIP Caja Chica
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white h-7 text-[10px]"
            disabled={!!isBatchExporting}
            onClick={() => exportBatch("CLIENTES")}
          >
            {isBatchExporting === "CLIENTES" ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Archive className="w-3 h-3 mr-1.5" />}
            ZIP Clientes
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white h-7 text-[10px]"
            disabled={!!isBatchExporting}
            onClick={() => exportBatch("INSTALACIONES")}
          >
            {isBatchExporting === "INSTALACIONES" ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Archive className="w-3 h-3 mr-1.5" />}
            ZIP Instalaciones
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white h-7 text-[10px]"
            disabled={!!isBatchExporting}
            onClick={() => exportBatch("OTROS")}
          >
            {isBatchExporting === "OTROS" ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Archive className="w-3 h-3 mr-1.5" />}
            ZIP Otros Gastos
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-2 border-b py-2 px-3">
          <CardTitle className="font-headline text-base text-primary">Registro de Actividad</CardTitle>
          <div className="flex flex-wrap gap-1.5 w-full xl:w-auto">
            <div className="relative min-w-[160px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input 
                id="search-input-admin"
                name="search"
                placeholder="Buscar vale, fecha, monto, persona..." 
                className="pl-8 h-8 border-2 text-xs"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
            <Select value={filterSucursal} onValueChange={setFilterSucursal}>
              <SelectTrigger className="h-8 w-[140px] border-2 text-xs">
                <Building2 className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas las Sedes</SelectItem>
                {CONFIG.SUCURSALES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCaja} onValueChange={setFilterCaja}>
              <SelectTrigger className="h-8 w-[140px] border-2 text-xs">
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
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-bold">Fecha</TableHead>
                  <TableHead className="font-bold">N° Vale</TableHead>
                  <TableHead className="font-bold">Personal / Sede</TableHead>
                  <TableHead className="font-bold">Tipo de Caja</TableHead>
                  <TableHead className="font-bold text-right">Monto</TableHead>
                  <TableHead className="font-bold text-center">Estado</TableHead>
                  <TableHead className="font-bold">Firma / Dispositivo</TableHead>
                  <TableHead className="text-right font-bold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">Sincronizando registros...</TableCell>
                  </TableRow>
                ) : paginatedVales.length > 0 ? (
                  paginatedVales.map((vale) => (
                    <TableRow 
                      key={vale.id} 
                      className="hover:bg-muted/10 cursor-pointer"
                      onClick={() => handleViewVale(vale)}
                    >
                      <TableCell className="text-[10px] font-mono">{vale.raw.fecha}</TableCell>
                      <TableCell className="font-black text-primary">
                        <div className="flex items-center gap-2">
                          {vale.raw.numVale}
                          {vale.archivado && <FileCheck className="w-3 h-3 text-emerald-600" />}
                        </div>
                      </TableCell>
                      <TableCell className="uppercase text-xs font-medium">
                        {vale.raw.entregado}
                        <div className="text-[9px] text-muted-foreground font-bold">{vale.raw.sucursal}</div>
                      </TableCell>
                      <TableCell>
                         <Badge variant="outline" className="text-[9px] uppercase font-bold">
                            {vale.raw.sheet}
                         </Badge>
                      </TableCell>
                      <TableCell className="font-black text-indigo-700 text-right">{vale.raw.monto}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {vale.firmado ? (
                            <Badge className="bg-emerald-600 font-bold text-[9px]">FIRMADO</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] opacity-40">PENDIENTE</Badge>
                          )}
                          {vale.comprobante && <Receipt className="w-3.5 h-3.5 text-amber-600" title="Ticket adjunto" />}
                          {vale.archivado && <FileCheck className="w-3.5 h-3.5 text-indigo-600" title="PDF archivado" />}
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
                              {vale.raw.firmaMeta.plataforma}
                              {vale.raw.firmaMeta.tipoConexion && ` · ${vale.raw.firmaMeta.tipoConexion.toUpperCase()}`}
                            </div>
                          </div>
                        ) : vale.firmado ? (
                          <span className="text-[9px] italic">Sin metadata</span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary"
                            onClick={() => handleViewVale(vale)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                                                    <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => exportSinglePDF(vale.raw)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {vale.firmado && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar firma"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm('¿Eliminar la firma de este vale?')) return;
                                const result = await deleteSignatureAction(vale.id, vale.raw.fecha);
                                if (result.success) {
                                  toast({ title: 'Firma eliminada' });
                                  loadData();
                                } else {
                                  toast({ variant: 'destructive', title: 'Error', description: result.error });
                                }
                              }}
                            >
                              <Eraser className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {vale.comprobante && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                              title="Eliminar comprobante"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm('¿Eliminar el comprobante/ticket de este vale?')) return;
                                const result = await deleteComprobanteAction(vale.id, vale.raw.fecha);
                                if (result.success) {
                                  toast({ title: 'Comprobante eliminado' });
                                  loadData();
                                } else {
                                  toast({ variant: 'destructive', title: 'Error', description: result.error });
                                }
                              }}
                            >
                              <ImageOff className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                            title="Eliminar vale completo"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm('⚠️ ¿ELIMINAR COMPLETAMENTE este vale?\n\nSe borrará el registro y todos sus archivos (firma, comprobante, PDF).\n\nEsta acción no se puede deshacer.')) return;
                              const result = await deleteVoucherAction(vale.id, vale.raw.fecha);
                              if (result.success) {
                                toast({ title: 'Vale eliminado', description: 'Registro y archivos borrados.' });
                                loadData();
                              } else {
                                toast({ variant: 'destructive', title: 'Error', description: result.error });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">Sin registros que coincidan con los filtros.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
              <span className="text-[10px] text-muted-foreground font-bold">
                {sortedVales.length} vales · Página {currentPage} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                >
                  ««
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  «
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  // Mostrar ventana de 5 páginas centrada en la actual
                  let start = Math.max(1, currentPage - 2);
                  if (start + 4 > totalPages) start = Math.max(1, totalPages - 4);
                  const pageNum = start + i;
                  if (pageNum > totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 text-[10px] font-bold"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  »
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  »»
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <footer className="flex justify-between items-center text-[9px] text-muted-foreground font-bold uppercase tracking-widest pt-2 pb-1 border-t">
        <span>Flynet Digital v4.8</span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Sincronizado</span>
        </div>
      </footer>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Sincronizando con el servidor...</div>}>
      <AdminContent />
    </Suspense>
  );
}
