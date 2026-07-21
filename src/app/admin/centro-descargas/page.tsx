"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CONFIG } from "@/lib/config";
import { getRecentCycles, type CycleInfo } from "@/lib/cycles";
import { getRecentCyclesMensual } from "@/lib/cycles-mensual";
import { getVouchersByCycleActionFormatted, type FormattedVoucher } from "@/app/actions/vouchers";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  RefreshCcw,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowDownAZ,
  FileDown,
  Eye,
  XCircle,
  Archive,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export default function CentroDescargasPage() {
  const { toast } = useToast();

  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [vales, setVales] = useState<FormattedVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [filterSucursal, setFilterSucursal] = useState("TODAS");
  const [filterCaja, setFilterCaja] = useState("TODAS");
  const [expandedSucursales, setExpandedSucursales] = useState<Set<string>>(new Set());

  // En vez de un booleano global, trackeamos qué grupo específico se está generando.
  // Así solo ese botón muestra spinner y no parece que todas las cajas se descargan.
  const [generandoGrupo, setGenerandoGrupo] = useState<string | null>(null);
  const [pdfsGenerados, setPdfsGenerados] = useState(0);
  const [pdfsTotal, setPdfsTotal] = useState(0);
  const generandoPDFs = generandoGrupo !== null;

  // Determinar si estamos viendo una sucursal con ciclo mensual (CARA SUCIA)
  const esCicloMensual = filterSucursal === "CARA SUCIA";

  useEffect(() => {
    const recentCycles = esCicloMensual ? getRecentCyclesMensual() : getRecentCycles();
    setCycles(recentCycles);
    // Mantener el ciclo seleccionado si su ID sigue existiendo en la nueva lista
    setSelectedCycle((prev) => {
      if (recentCycles.some((c) => c.id === prev)) return prev;
      return recentCycles[0]?.id || "";
    });
    setMounted(true);
  }, [esCicloMensual]);

  const loadData = async () => {
    setLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const formatted = await getVouchersByCycleActionFormatted(selectedCycle, origin);
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

  // Expandir todas las sucursales al cargar datos
  useEffect(() => {
    if (vales.length > 0 && expandedSucursales.size === 0 && mounted) {
      const sucs = new Set<string>();
      for (const v of vales) {
        sucs.add((v.raw.sucursal || "SIN SUCURSAL").toUpperCase());
      }
      if (sucs.size > 0) setExpandedSucursales(sucs);
    }
  }, [vales.length, mounted]);

  if (!mounted) return null;

  // ===== FILTRADO =====
  const filteredVales = vales.filter((v) => {
    const sucursalRaw = (v.raw.sucursal || "").toUpperCase();
    const matchesSucursal = filterSucursal === "TODAS" || sucursalRaw === filterSucursal;

    const sheet = (v.raw.sheet || "").toUpperCase();
    let matchesCaja = filterCaja === "TODAS";
    if (filterCaja === "CAJA CHICA") matchesCaja = sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL");
    if (filterCaja === "CLIENTES") matchesCaja = sheet.includes("CLIENTES");
    if (filterCaja === "INSTALACIONES") matchesCaja = sheet.includes("INSTALACIONES");
    if (filterCaja === "OTROS GASTOS") matchesCaja = sheet.includes("OTROS");

    return matchesSucursal && matchesCaja;
  });

  // ===== AGRUPACIÓN POR SUCURSAL → CAJA → VALES ORDENADOS =====
  type ValeAgrupado = FormattedVoucher & { numValeInt: number };

  const agrupar = (): Map<string, Map<string, ValeAgrupado[]>> => {
    const mapa = new Map<string, Map<string, ValeAgrupado[]>>();

    for (const v of filteredVales) {
      const suc = (v.raw.sucursal || "SIN SUCURSAL").toUpperCase();
      const sheet = (v.raw.sheet || "SIN CAJA").toUpperCase();
      const caja =
        sheet.includes("CHICA") || sheet === "HOJA 1" || sheet.includes("GENERAL")
          ? "CAJA CHICA"
          : sheet.includes("CLIENTES")
            ? "CLIENTES"
            : sheet.includes("INSTALACIONES")
              ? "INSTALACIONES"
              : sheet.includes("OTROS")
                ? "OTROS GASTOS"
                : sheet;

      if (!mapa.has(suc)) mapa.set(suc, new Map());
      const cajas = mapa.get(suc)!;
      if (!cajas.has(caja)) cajas.set(caja, []);

      cajas.get(caja)!.push({
        ...v,
        numValeInt: parseInt(v.raw.numVale) || 0,
      });
    }

    // Ordenar cada grupo por numVale
    for (const [, cajas] of mapa) {
      for (const [, vales] of cajas) {
        vales.sort((a, b) => a.numValeInt - b.numValeInt);
      }
    }

    return mapa;
  };

  const agrupado = agrupar();

  // ===== DETECCIÓN DE CORRELATIVOS FALTANTES =====
  const detectarFaltantes = (vales: ValeAgrupado[]): number[] => {
    if (vales.length < 2) return [];
    const nums = vales.map((v) => v.numValeInt).filter((n) => n > 0);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const faltantes: number[] = [];
    const set = new Set(nums);
    for (let i = min; i <= max; i++) {
      if (!set.has(i)) faltantes.push(i);
    }
    return faltantes;
  };

  // ===== CONSTRUIR PAYLOAD INTELIGENTE (usa última firma/comprobante) =====
  const buildPayload = (vale: ValeAgrupado) => {
    const sheetUpper = (vale.raw.sheet || "").toUpperCase();
    const isCajaChica = sheetUpper.includes("CHICA") || sheetUpper === "HOJA 1" || sheetUpper.includes("GENERAL");
    const isClientes = sheetUpper.includes("CLIENTES");
    const isInstalaciones = sheetUpper.includes("INSTALACIONES");
    const isOtros = sheetUpper.includes("OTROS");
    const displayMonto = vale.raw.monto ? vale.raw.monto.replace(/[^\d.]/g, "") : "0.00";

    // Resolver imágenes: usar firmaUrlRaw > firmaUrl (el raw es la ruta más reciente del servidor Python)
    const firmaRaw = (vale.raw as any).firmaUrlRaw || (vale.raw as any).firmaUrl || null;
    const compRaw = (vale.raw as any).comprobanteUrlRaw || (vale.raw as any).comprobanteUrl || null;
    const firmaAutorizadorRaw = (vale.raw as any).firmaAutorizadorUrl || null;

    const prepareUrl = (raw: string | null): string | null => {
      if (!raw) return null;
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        if (raw.includes("/storage/imagenes/")) {
          const match = raw.match(/\/storage\/imagenes\/[^?#]+/);
          if (match) return match[0];
        }
        return raw;
      }
      if (raw.startsWith("data:")) return raw;
      if (raw.startsWith("/storage/")) return raw;
      return raw;
    };

    // Auditoría
    const ahora = new Date();
    const fechaGeneracion =
      ahora.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " +
      ahora.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let fechaFirma = "";
    let dispositivoFirma = "";
    const firmaMeta = (vale.raw as any).firmaMeta;
    if (firmaMeta?.fechaHora) {
      const f = new Date(firmaMeta.fechaHora);
      fechaFirma =
        f.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" }) +
        " " +
        f.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      dispositivoFirma = firmaMeta.esMovil ? "Móvil" : "Escritorio";
      if (firmaMeta.plataforma) dispositivoFirma += " · " + firmaMeta.plataforma;
    }

    return {
      id: vale.raw.id || vale.id,
      numero: vale.raw.numVale || "---",
      fecha: vale.raw.fecha || "",
      cajaChica: isCajaChica,
      clientes: isClientes,
      instalaciones: isInstalaciones,
      otrosGastos: isOtros,
      entregadoA: vale.raw.entregado || "",
      laSumaDe: `${displayMonto} Dólares exactos`,
      concepto: vale.raw.concepto || vale.raw.rubro || "",
      montoTotal: displayMonto,
      reintegro: "0.00",
      solicitante: vale.raw.entregado || "",
      autoriza: vale.raw.autorizadoPor || vale.raw.sucursal || "",
      firmaSolicitante: prepareUrl(firmaRaw),
      comprobante: prepareUrl(compRaw),
      firmaAutorizador: prepareUrl(firmaAutorizadorRaw),
      // Auditoría
      fechaGeneracion,
      fechaFirma,
      dispositivoFirma,
      tieneComprobante: !!compRaw,
      comprobanteTimestamp: (vale.raw as any).comprobanteTimestamp || "",
      tipoAutorizador: (vale.raw as any).tipoAutorizador || null,
      sucursal: vale.raw.sucursal || "",
    };
  };

  // ===== DESCARGA MASIVA =====
  const handleDescargarGrupo = async (valesGrupo: ValeAgrupado[], label: string) => {
    if (valesGrupo.length === 0) {
      toast({ title: "Sin vales", description: "Este grupo no tiene vales para descargar." });
      return;
    }

    setGenerandoGrupo(label);
    setPdfsGenerados(0);
    setPdfsTotal(valesGrupo.length);

    const baseApi = CONFIG.PDF_API_URL.replace(/\/$/, "");
    const payloads = valesGrupo.map(buildPayload);

    toast({ title: "Generando PDFs", description: `Procesando ${payloads.length} vales de ${label}...` });

    try {
      const response = await fetch(`${baseApi}/generate-vale-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloads),
      });

      if (!response.ok) throw new Error("Error en el motor de PDF");

      const data = await response.json();
      if (data.zip_url) {
        const suc = (valesGrupo[0]?.raw.sucursal || "SIN-SUCURSAL").replace(/\s+/g, "_");
        const caja = label.replace(/\s+/g, "_");
        const primerVale = valesGrupo[0]?.numValeInt || 0;
        const ultimoVale = valesGrupo[valesGrupo.length - 1]?.numValeInt || 0;
        const filename = `vales_${suc}_${caja}_${primerVale}-${ultimoVale}_${selectedCycle}.zip`;

        const zipResponse = await fetch(data.zip_url);
        const blob = await zipResponse.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setPdfsGenerados(valesGrupo.length);
        toast({ title: "Descarga completa", description: `${filename} (${valesGrupo.length} vales)` });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el paquete de PDFs." });
    } finally {
      setGenerandoGrupo(null);
    }
  };

  const handleAbrirVale = (vale: FormattedVoucher) => {
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
    window.open(`/vale?${params.toString()}`, "_blank");
  };

  const toggleSucursal = (suc: string) => {
    setExpandedSucursales((prev) => {
      const next = new Set(prev);
      if (next.has(suc)) next.delete(suc);
      else next.add(suc);
      return next;
    });
  };

  // ===== ESTADÍSTICAS =====
  let totalVales = 0;
  let totalFaltantes = 0;
  for (const [, cajas] of agrupado) {
    for (const [, vales] of cajas) {
      totalVales += vales.length;
      totalFaltantes += detectarFaltantes(vales).length;
    }
  }

  const todasSucursales = Array.from(agrupado.keys()).sort();

  return (
    <div className="p-2 md:p-4 space-y-3 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-xl font-bold font-headline text-primary flex items-center gap-2">
            <FileDown className="w-5 h-5" />
            Centro de Descargas
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Descarga ordenada por sucursal y caja. Detecta correlativos faltantes.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={loadData} disabled={loading}>
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="w-[220px] h-9 border-2 border-primary/20 text-xs">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-primary" />
              <SelectValue placeholder="Ciclo" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex gap-2">
        <Select value={filterSucursal} onValueChange={setFilterSucursal}>
          <SelectTrigger className="h-8 w-[160px] border-2 text-xs">
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Sucursal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas las Sedes</SelectItem>
            {CONFIG.SUCURSALES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCaja} onValueChange={setFilterCaja}>
          <SelectTrigger className="h-8 w-[160px] border-2 text-xs">
            <ArrowDownAZ className="w-3.5 h-3.5 mr-1.5" />
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card className="border-l-4 border-l-primary shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <p className="text-[9px] font-black text-muted-foreground uppercase">Total Vales</p>
            <p className="text-xl font-black font-headline">{totalVales}</p>
          </CardContent>
        </Card>
        <Card
          className={`border-l-4 shadow-sm bg-white ${totalFaltantes > 0 ? "border-l-red-500" : "border-l-emerald-500"}`}
        >
          <CardContent className="py-2.5 px-3">
            <p className="text-[9px] font-black text-muted-foreground uppercase">Faltantes</p>
            <p className={`text-xl font-black font-headline ${totalFaltantes > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {totalFaltantes}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <p className="text-[9px] font-black text-muted-foreground uppercase">Sucursales</p>
            <p className="text-xl font-black font-headline">{todasSucursales.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-white">
          <CardContent className="py-2.5 px-3">
            <p className="text-[9px] font-black text-muted-foreground uppercase">Ciclo</p>
            <p className="text-sm font-black font-headline text-amber-700">{selectedCycle}</p>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {loading && (
        <Card className="shadow-xl">
          <CardContent className="h-40 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando vales del ciclo...
          </CardContent>
        </Card>
      )}

      {/* Lista agrupada */}
      {!loading && agrupado.size === 0 && (
        <Card className="shadow-xl">
          <CardContent className="h-40 flex items-center justify-center text-muted-foreground">
            Sin vales para los filtros seleccionados.
          </CardContent>
        </Card>
      )}

      {!loading &&
        todasSucursales.map((suc) => {
          const cajas = agrupado.get(suc)!;
          const expandido = expandedSucursales.has(suc);

          return (
            <Card key={suc} className="shadow-lg">
              {/* Header de sucursal (clickeable para expandir/colapsar) */}
              <div
                className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSucursal(suc)}
              >
                <div className="flex items-center gap-2">
                  {expandido ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="font-headline font-bold text-sm">{suc}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {(() => {
                      let total = 0;
                      cajas.forEach((v) => (total += v.length));
                      return total;
                    })()}{" "}
                    vales
                  </Badge>
                  <Badge variant="outline" className="text-[9px] text-muted-foreground">
                    {cajas.size} cajas
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px]"
                  disabled={generandoPDFs}
                  onClick={(e) => {
                    e.stopPropagation();
                    const todos: ValeAgrupado[] = [];
                    cajas.forEach((v) => todos.push(...v));
                    handleDescargarGrupo(todos, `${suc} (TODAS)`);
                  }}
                >
                  {generandoGrupo === `${suc} (TODAS)` ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Download className="w-3 h-3 mr-1" />
                  )}
                  Descargar todo {suc}
                </Button>
              </div>

              {expandido &&
                Array.from(cajas.entries()).map(([caja, valesCaja]) => {
                  const faltantes = detectarFaltantes(valesCaja);
                  const nums = valesCaja.map((v) => v.numValeInt).filter((n) => n > 0);
                  const rango =
                    nums.length > 0
                      ? `${Math.min(...nums)} → ${Math.max(...nums)}`
                      : "—";

                  return (
                    <div key={caja} className="border-b last:border-b-0">
                      {/* Sub-header de caja */}
                      <div className="flex items-center justify-between px-4 py-1.5 bg-muted/10">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{caja}</span>
                          <Badge variant="secondary" className="text-[9px]">
                            {valesCaja.length} vales
                          </Badge>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            correlativo: {rango}
                          </span>
                          {faltantes.length > 0 && (
                            <Badge className="bg-red-100 text-red-700 text-[9px] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {faltantes.length} faltante{faltantes.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-primary hover:text-primary/80"
                          disabled={generandoPDFs}
                          onClick={() => handleDescargarGrupo(valesCaja, `${suc} · ${caja}`)}
                        >
                          {generandoGrupo === `${suc} · ${caja}` ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Download className="w-3 h-3 mr-1" />
                          )}
                          Descargar ZIP
                        </Button>
                      </div>

                      {/* Faltantes warning */}
                      {faltantes.length > 0 && (
                        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                          <div className="flex items-start gap-2 text-[10px] text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-bold">Correlativos faltantes: </span>
                              {faltantes.map((n, i) => (
                                <span key={n}>
                                  <Badge className="bg-red-200 text-red-800 text-[9px] font-mono mr-1">{n}</Badge>
                                  {i < faltantes.length - 1 && ", "}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tabla de vales */}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-muted/20">
                            <TableRow>
                              <TableHead className="w-[50px] font-bold text-[10px]">#</TableHead>
                              <TableHead className="font-bold text-[10px]">Vale ID</TableHead>
                              <TableHead className="font-bold text-[10px]">Entregado a</TableHead>
                              <TableHead className="font-bold text-[10px] text-right">Monto</TableHead>
                              <TableHead className="font-bold text-[10px] text-center">Firma</TableHead>
                              <TableHead className="font-bold text-[10px] text-center">Ticket</TableHead>
                              <TableHead className="font-bold text-[10px] text-center">Autoriza</TableHead>
                              <TableHead className="text-right font-bold text-[10px] w-[80px]">Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {valesCaja.map((vale) => (
                              <TableRow
                                key={vale.id}
                                className="hover:bg-muted/10 cursor-pointer"
                                onClick={() => handleAbrirVale(vale)}
                              >
                                <TableCell className="font-mono font-bold text-xs">{vale.numValeInt}</TableCell>
                                <TableCell className="text-[9px] font-mono text-muted-foreground truncate max-w-[140px]">
                                  {vale.id}
                                </TableCell>
                                <TableCell className="text-xs font-medium uppercase">{vale.raw.entregado}</TableCell>
                                <TableCell className="text-xs font-bold text-indigo-700 text-right">
                                  {vale.raw.monto}
                                </TableCell>
                                <TableCell className="text-center">
                                  {vale.firmado ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-muted-foreground/30 inline" />
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {vale.comprobante ? (
                                    <CheckCircle2 className="w-4 h-4 text-amber-500 inline" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-muted-foreground/30 inline" />
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {vale.raw.autorizadoPor ? (
                                    <Badge className="bg-indigo-100 text-indigo-700 text-[8px] font-bold">
                                      {vale.raw.autorizadoPor}
                                    </Badge>
                                  ) : vale.raw.sucursal ? (
                                    <span className="text-[8px] text-muted-foreground">
                                      {(vale.raw as any).tipoAutorizador || "—"}
                                    </span>
                                  ) : (
                                    <span className="text-[8px] text-muted-foreground/50">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex justify-end gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleAbrirVale(vale)}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  );
                })}
            </Card>
          );
        })}

      {/* Footer */}
      <footer className="flex justify-between items-center text-[9px] text-muted-foreground font-bold uppercase tracking-widest pt-2 pb-1 border-t">
        <span>Flynet Digital v4.8 · Centro de Descargas</span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>{" "}
            {totalVales} documentos indexados
          </span>
        </div>
      </footer>
    </div>
  );
}
