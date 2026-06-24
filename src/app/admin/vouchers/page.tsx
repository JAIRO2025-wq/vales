"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getRecentCycles, type CycleInfo } from "@/lib/cycles";
import {
  Receipt,
  Building2,
  Loader2,
  Trash2,
  Eye,
  ImageUp,
  Calendar,
  Hash,
  RefreshCcw,
  Download,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

interface VoucherEntry {
  id: string;
  voucherUrl: string;
  subidoEl: string;
}

interface VoucherGroup {
  sucursal: string;
  year: string;
  month: string;
  vouchers: VoucherEntry[];
}

interface SucursalGroup {
  sucursal: string;
  vouchers: (VoucherEntry & { year: string; month: string })[];
}

export default function VouchersAdminPage() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<VoucherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVoucher, setSelectedVoucher] = useState<(VoucherEntry & { sucursal: string; year: string; month: string }) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [expandedSucursales, setExpandedSucursales] = useState<Set<string>>(new Set());
  const [voucherPage, setVoucherPage] = useState(1);
  const VOUCHERS_PER_PAGE = 10;

  // Selector de periodo (igual que en /admin)
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const recentCycles = getRecentCycles();
    setCycles(recentCycles);
    setSelectedCycle(recentCycles[0]?.id || "");
    // DEBUG: mostrar fecha del sistema y ciclo por defecto
    const now = new Date();
    console.log('[DEBUG vouchers] Fecha del sistema:', now.toString());
    console.log('[DEBUG vouchers] Fecha ISO:', now.toISOString());
    console.log('[DEBUG vouchers] getMonth():', now.getMonth(), '(0=Ene, 5=Jun, 6=Jul)');
    console.log('[DEBUG vouchers] getDate():', now.getDate());
    console.log('[DEBUG vouchers] Ciclos disponibles:', recentCycles.map(c => c.label));
    console.log('[DEBUG vouchers] Ciclo por defecto:', recentCycles[0]?.id, recentCycles[0]?.label);
  }, []);

  // Resetear página al cambiar datos
  useEffect(() => { setVoucherPage(1); }, [groups]);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      // Pasar el ciclo seleccionado para que la API filtre directamente
      const params = new URLSearchParams();
      if (selectedCycle) params.set('ciclo', selectedCycle);
      const queryString = params.toString();
      const url = `/api/vouchers${queryString ? `?${queryString}` : ''}`;
      console.log('[DEBUG vouchers] Llamando API:', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar");
      const data: VoucherGroup[] = await res.json();
      console.log('[DEBUG vouchers] Datos recibidos:', JSON.stringify(data).slice(0, 500));
      setGroups(data);
      const sucursales = new Set(data.map((g) => g.sucursal));
      setExpandedSucursales(sucursales);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los vouchers." });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedCycle]);

  useEffect(() => { if (mounted && selectedCycle) loadVouchers(); }, [mounted, selectedCycle, loadVouchers]);

  const handleDelete = async (voucherId: string) => {
    if (!confirm("¿Eliminar el voucher?\n\nEsta acción no se puede deshacer.")) return;
    try {
      const res = await fetch("/api/vouchers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: voucherId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Voucher eliminado" });
        if (selectedVoucher?.id === voucherId) setSelectedVoucher(null);
        loadVouchers();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar." });
    }
  };

  /**
   * Normaliza una URL de voucher para que use el mismo origin que la página actual.
   * Las URLs guardadas en el índice pueden tener un origin absoluto (ej: https://vale.modulos.uk)
   * que difiere del origin actual en desarrollo (localhost). Esto causa que el fetch falle por CORS.
   */
  const normalizeVoucherUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      // Si la URL es de otro origen, reemplazar con el origin actual
      if (parsed.origin !== window.location.origin) {
        return `/api/imagenes${parsed.search}`;
      }
      return url;
    } catch {
      // Si no es una URL absoluta, devolver tal cual
      return url;
    }
  };

  const handleDownloadSingle = async (voucher: VoucherEntry) => {
    const downloadUrl = normalizeVoucherUrl(voucher.voucherUrl);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Deducir extensión del Content-Type real
      const contentType = res.headers.get("Content-Type") || blob.type || "";
      const ext = contentType.includes("png") ? "png"
        : contentType.includes("webp") ? "webp"
        : contentType.includes("gif") ? "gif"
        : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
        : "jpg";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${voucher.id}_voucher.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revocar después de un pequeño delay para asegurar que el navegador inició la descarga
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Error descargando voucher:", err);
      // Fallback: intentar con link directo (solo funciona en same-origin)
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${voucher.id}_voucher.jpg`;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownloadSucursal = async (sucursal: string) => {
    const sucVouchers = filteredVouchers.filter((v) => v.sucursal === sucursal);
    if (sucVouchers.length === 0) return;
    toast({ title: "Preparando descarga", description: `Descargando ${sucVouchers.length} vouchers de ${sucursal}...` });
    try {
      for (let i = 0; i < sucVouchers.length; i++) {
        const v = sucVouchers[i];
        const downloadUrl = normalizeVoucherUrl(v.voucherUrl);
        try {
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const contentType = res.headers.get("Content-Type") || blob.type || "";
          const ext = contentType.includes("png") ? "png"
            : contentType.includes("webp") ? "webp"
            : contentType.includes("gif") ? "gif"
            : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
            : "jpg";
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${v.id}_voucher.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          if (i < sucVouchers.length - 1) await new Promise((r) => setTimeout(r, 300));
        } catch {
          // Fallback: link directo
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = `${v.id}_voucher.jpg`;
          a.target = "_blank";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
      toast({ title: "Descarga completada", description: `${sucVouchers.length} vouchers descargados.` });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron descargar." });
    }
  };

  const parseId = (id: string) => {
    const parts = id.split("-");
    const dateIdx = parts.findIndex((p) => /^\d{4}$/.test(p));
    if (dateIdx < 0) return { sucursal: id, fecha: "", sheet: "", celda: "" };
    return {
      sucursal: parts.slice(0, dateIdx).join(" "),
      fecha: `${parts[dateIdx]}-${parts[dateIdx + 1] || "??"}`,
      sheet: parts[parts.length - 2] || "",
      celda: parts[parts.length - 1] || "",
    };
  };

  const allVouchers = groups.flatMap((g) =>
    g.vouchers.map((v) => ({ ...v, sucursal: g.sucursal, year: g.year, month: g.month }))
  );

  // Filtrar vouchers por el ciclo seleccionado (mismo formato YYYY-MM que en /admin)
  const filteredVouchers = useMemo(() => {
    if (!selectedCycle) return allVouchers;
    const [cycleYear, cycleMonth] = selectedCycle.split('-');
    return allVouchers.filter((v) => v.year === cycleYear && v.month === cycleMonth);
  }, [allVouchers, selectedCycle]);

  const sucursalGroups: SucursalGroup[] = (() => {
    const map = new Map<string, (VoucherEntry & { year: string; month: string })[]>();
    filteredVouchers.forEach((v) => {
      const arr = map.get(v.sucursal) || [];
      arr.push(v);
      map.set(v.sucursal, arr);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sucursal, vouchers]) => ({ sucursal, vouchers }));
  })();

  const totalVouchers = filteredVouchers.length;

  const toggleSucursal = (s: string) => {
    setExpandedSucursales((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  if (!mounted) return null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ===== SIDEBAR IZQUIERDO ===== */}
      <div className="w-80 border-r bg-card flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-headline font-bold text-sm text-primary flex items-center gap-1.5">
              <Receipt className="w-4 h-4" /> Vouchers
            </h2>
            <div className="flex items-center gap-1">
              <Badge className="text-[9px] h-5 px-1.5">{totalVouchers}</Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadVouchers} disabled={loading}>
                <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          {/* Selector de periodo (mismo que en /admin) */}
          <Select value={selectedCycle} onValueChange={(v) => { setSelectedCycle(v); setVoucherPage(1); }}>
            <SelectTrigger className="w-full h-7 text-[10px]">
              <Calendar className="w-3 h-3 mr-1 text-primary" />
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : sucursalGroups.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <ImageUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Sin vouchers</p>
            </div>
          ) : (
            <div className="py-1">
              {sucursalGroups.map((sg) => {
                const isExpanded = expandedSucursales.has(sg.sucursal);
                // Paginación dentro de cada sucursal
                const totalPages = Math.ceil(sg.vouchers.length / VOUCHERS_PER_PAGE);
                const paginatedVouchers = sg.vouchers.slice(0, voucherPage * VOUCHERS_PER_PAGE);
                return (
                  <div key={sg.sucursal}>
                    {/* Header de sucursal: usamos div en vez de button para evitar button dentro de button */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors text-left sticky top-0 bg-card z-10 border-b cursor-pointer"
                      onClick={() => toggleSucursal(sg.sucursal)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSucursal(sg.sucursal); } }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-bold truncate">{sg.sucursal}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{sg.vouchers.length}</Badge>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-1"
                        title={`Descargar todos los vouchers de ${sg.sucursal}`}
                        onClick={(e) => { e.stopPropagation(); handleDownloadSucursal(sg.sucursal); }}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                    {isExpanded && (
                      <div>
                        {paginatedVouchers.map((v) => {
                          const info = parseId(v.id);
                          const isSelected = selectedVoucher?.id === v.id;
                          return (
                            /* Usamos div en vez de button para evitar button dentro de button */
                            <div
                              key={v.id}
                              role="button"
                              tabIndex={0}
                              className={`w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors border-b border-muted/30 cursor-pointer ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
                              onClick={() => setSelectedVoucher({ ...v, sucursal: sg.sucursal })}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedVoucher({ ...v, sucursal: sg.sucursal }); } }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold truncate">{info.celda}</span>
                                    <Badge className="bg-amber-100 text-amber-800 text-[8px] h-4 px-1 shrink-0">{info.sheet}</Badge>
                                  </div>
                                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                                    <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" />{info.fecha}</span>
                                    <span>{new Date(v.subidoEl).toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit" })}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 ml-1 shrink-0">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Descargar"
                                    onClick={(e) => { e.stopPropagation(); handleDownloadSingle(v); }}>
                                    <Download className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" title="Eliminar"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Botón "Ver más" si hay más vouchers */}
                        {totalPages > 1 && voucherPage < totalPages && (
                          <button
                            className="w-full text-center py-2 text-[10px] text-primary font-bold hover:bg-muted/50 transition-colors border-b"
                            onClick={() => setVoucherPage((p) => p + 1)}
                          >
                            Ver más ({sg.vouchers.length - paginatedVouchers.length} restantes)
                          </button>
                        )}
                        {voucherPage > 1 && (
                          <button
                            className="w-full text-center py-2 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
                            onClick={() => setVoucherPage(1)}
                          >
                            Mostrar menos
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ===== PANEL DERECHO: VISTA PREVIA ===== */}
      <div className="flex-1 flex flex-col bg-muted/20 overflow-hidden">
        {selectedVoucher ? (
          <>
            <div className="p-3 border-b bg-card flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedVoucher(null)}>
                  <X className="w-4 h-4" />
                </Button>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{selectedVoucher.id}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {selectedVoucher.sucursal} · Subido {new Date(selectedVoucher.subidoEl).toLocaleString("es-SV", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleDownloadSingle(selectedVoucher)}>
                  <Download className="w-3 h-3 mr-1" /> Descargar
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => window.open(selectedVoucher.voucherUrl, "_blank")}>
                  <Eye className="w-3 h-3 mr-1" /> Abrir
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-[10px] text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => handleDelete(selectedVoucher.id)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                </Button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-zinc-900/50">
              <img src={selectedVoucher.voucherUrl} alt={selectedVoucher.id} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            </div>
            <div className="p-2 border-t bg-card shrink-0">
              <div className="flex flex-wrap gap-2 text-[10px]">
                {(() => { const info = parseId(selectedVoucher.id); return (<>
                  <Badge variant="outline" className="text-[9px]">{selectedVoucher.sucursal}</Badge>
                  <Badge className="bg-amber-100 text-amber-800 text-[9px]">{info.sheet}</Badge>
                  <span className="flex items-center gap-1 text-muted-foreground"><Calendar className="w-3 h-3" /> {info.fecha}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Hash className="w-3 h-3" /> {info.celda}</span>
                </>); })()}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <Receipt className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-headline text-lg text-muted-foreground">
                  {filteredVouchers.length === 0 ? "No hay vouchers subidos" : "Selecciona un voucher"}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {filteredVouchers.length === 0
                    ? "Aún no se ha subido ningún comprobante bancario."
                    : "Haz clic en un voucher de la lista para verlo aquí."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
