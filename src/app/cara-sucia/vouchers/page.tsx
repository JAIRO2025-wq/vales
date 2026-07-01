"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ===== CICLO MENSUAL INLINE (sin imports externos) =====
interface CycleInfo {
  id: string;
  label: string;
  year: number;
  month: number;
}
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function getLocalDateSV() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const sv = offset === 360 ? now : new Date(now.getTime() + (-6*3600000 - -offset*60000));
  return { year: sv.getFullYear(), month: sv.getMonth(), day: sv.getDate() };
}
function getUltimosCiclosMensuales(count = 6): CycleInfo[] {
  const { year, month } = getLocalDateSV();
  const ciclos: CycleInfo[] = [];
  let m = month, y = year;
  for (let i = 0; i < count; i++) {
    const lastDay = new Date(y, m + 1, 0).getDate();
    ciclos.push({
      id: `${y}-${(m+1).toString().padStart(2,'0')}`,
      label: `${MONTHS[m]} 1 - ${MONTHS[m]} ${lastDay} ${y}`,
      year: y,
      month: m + 1,
    });
    if (m === 0) { m = 11; y--; } else { m--; }
  }
  return ciclos;
}
// ===== FIN CICLO MENSUAL =====

import {
  Receipt,
  Loader2,
  Trash2,
  Eye,
  Calendar,
  RefreshCcw,
  Download,
  Building2,
} from "lucide-react";

const BRANCH = "CARA SUCIA";

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

export default function CaraSuciaVouchersPage() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<VoucherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const ciclos = getUltimosCiclosMensuales();
    setCycles(ciclos);
    setSelectedCycle(ciclos[0]?.id || "");
  }, []);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('sucursal', BRANCH);
      if (selectedCycle) params.set('ciclo', selectedCycle);
      const url = `/api/vouchers?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar");
      const data: VoucherGroup[] = await res.json();
      setGroups(data);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los vouchers bancarios de CARA SUCIA." });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedCycle]);

  useEffect(() => {
    if (mounted && selectedCycle) loadVouchers();
  }, [mounted, selectedCycle, loadVouchers]);

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
        loadVouchers();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar." });
    }
  };

  const normalizeVoucherUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== window.location.origin) {
        return `/api/imagenes${parsed.search}`;
      }
      return url;
    } catch {
      return url;
    }
  };

  const handleDownloadSingle = async (voucher: VoucherEntry) => {
    const downloadUrl = normalizeVoucherUrl(voucher.voucherUrl);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const contentType = res.headers.get("Content-Type") || blob.type || "";
      const ext = contentType.includes("png") ? "png"
        : contentType.includes("webp") ? "webp"
        : contentType.includes("gif") ? "gif"
        : "jpg";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `voucher_${voucher.id}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Descarga iniciada" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo descargar el voucher." });
    }
  };

  if (!mounted) return null;

  const allVouchers = groups.flatMap(g => g.vouchers);

  return (
    <div className="p-2 md:p-4 space-y-3 max-w-5xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-xl font-bold font-headline text-amber-800 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            CARA SUCIA — Vouchers Bancarios
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Comprobantes de pago subidos · Ciclo mensual
            <span className="ml-2 text-amber-600 font-bold">🟡 Sub App</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={loadVouchers} disabled={loading}>
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <span className="ml-2 text-muted-foreground">Cargando vouchers...</span>
        </div>
      ) : allVouchers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-bold">No hay vouchers bancarios</p>
          <p className="text-sm">No se encontraron comprobantes de pago para CARA SUCIA en este ciclo.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map(group => (
            <div key={`${group.sucursal}-${group.year}-${group.month}`}>
              <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {group.month}/{group.year} · {group.vouchers.length} voucher(s)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.vouchers.map(v => (
                  <div key={v.id} className="border rounded-xl p-3 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs font-bold text-amber-800 truncate">{v.id}</p>
                        <p className="text-[9px] text-muted-foreground">
                          Subido: {new Date(v.subidoEl).toLocaleString('es-SV')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1"
                        onClick={() => handleDownloadSingle(v)}>
                        <Download className="w-3 h-3 mr-1" /> Descargar
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1"
                        onClick={() => {
                          const url = normalizeVoucherUrl(v.voucherUrl);
                          window.open(url, '_blank');
                        }}>
                        <Eye className="w-3 h-3 mr-1" /> Ver
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-[10px] text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(v.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
