"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CONFIG } from "@/lib/config";
import { getRecentCycles, type CycleInfo } from "@/lib/cycles";
import { getVouchersByCycleAction, type VoucherRecord } from "@/app/actions/vouchers";
import { 
  Building2, 
  Calendar, 
  ChevronRight, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  FileText,
  RefreshCcw,
  Loader2,
  ArrowLeft
} from "lucide-react";

interface CajaResumen {
  tipo: string;
  totalVales: number;
  montoTotal: number;
  pendientes: number;
  firmados: number;
  montoPendiente: number;
  montoFirmado: number;
}

interface SucursalData {
  nombre: string;
  cajas: CajaResumen[];
}

function CajasContent() {
  const router = useRouter();
  
  const [cycles] = useState<CycleInfo[]>(getRecentCycles());
  const [selectedCycle, setSelectedCycle] = useState<string>(cycles[0]?.id || "");
  const [sucursalesData, setSucursalesData] = useState<SucursalData[]>([]);
  const [valesDetalle, setValesDetalle] = useState<VoucherRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [sucursalSelected, setSucursalSelected] = useState<string | null>(null);
  const [cajaSelected, setCajaSelected] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && selectedCycle) {
      loadData();
    }
  }, [selectedCycle, mounted]);

  const loadData = async () => {
    setLoading(true);
    try {
      const vales = await getVouchersByCycleAction(selectedCycle);
      setValesDetalle(vales);

      const data: SucursalData[] = CONFIG.SUCURSALES.map(suc => {
        const valesSucursal = vales.filter(v => v.sucursal === suc);

        const cajas: CajaResumen[] = CONFIG.TIPOS_CAJA.map(tipo => {
          const sheetUpper = tipo.toUpperCase();
          const valesCaja = valesSucursal.filter(v => {
            const vSheet = v.sheet.toUpperCase();
            if (sheetUpper === "CAJA CHICA") return vSheet.includes("CHICA") || vSheet === "HOJA 1" || vSheet.includes("GENERAL");
            if (sheetUpper === "CLIENTES") return vSheet.includes("CLIENTES");
            if (sheetUpper === "INSTALACIONES") return vSheet.includes("INSTALACIONES");
            if (sheetUpper === "OTROS GASTOS") return vSheet.includes("OTROS");
            return false;
          });

          const total = valesCaja.reduce((acc, v) => acc + (parseFloat(v.monto.replace(/[^\d.]/g, '')) || 0), 0);
          const pendientes = valesCaja.filter(v => !v.firmado);
          const firmados = valesCaja.filter(v => v.firmado);
          const montoPendiente = pendientes.reduce((acc, v) => acc + (parseFloat(v.monto.replace(/[^\d.]/g, '')) || 0), 0);
          const montoFirmado = firmados.reduce((acc, v) => acc + (parseFloat(v.monto.replace(/[^\d.]/g, '')) || 0), 0);

          return {
            tipo,
            totalVales: valesCaja.length,
            montoTotal: total,
            pendientes: pendientes.length,
            firmados: firmados.length,
            montoPendiente,
            montoFirmado
          };
        });

        return { nombre: suc, cajas };
      });

      setSucursalesData(data);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const getTotalGeneral = () => {
    let total = 0;
    let pendientes = 0;
    let firmados = 0;
    let monto = 0;
    sucursalesData.forEach(s => {
      s.cajas.forEach(c => {
        total += c.totalVales;
        pendientes += c.pendientes;
        firmados += c.firmados;
        monto += c.montoTotal;
      });
    });
    return { total, pendientes, firmados, monto };
  };

  const getValesDeCaja = (sucursal: string, tipo: string) => {
    return valesDetalle.filter(v => {
      if (v.sucursal !== sucursal) return false;
      const vSheet = v.sheet.toUpperCase();
      const sheetUpper = tipo.toUpperCase();
      if (sheetUpper === "CAJA CHICA") return vSheet.includes("CHICA") || vSheet === "HOJA 1" || vSheet.includes("GENERAL");
      if (sheetUpper === "CLIENTES") return vSheet.includes("CLIENTES");
      if (sheetUpper === "INSTALACIONES") return vSheet.includes("INSTALACIONES");
      if (sheetUpper === "OTROS GASTOS") return vSheet.includes("OTROS");
      return false;
    });
  };

  const verDetalle = (sucursal: string, tipo: string) => {
    setSucursalSelected(sucursal);
    setCajaSelected(tipo);
  };

  const volverAlResumen = () => {
    setSucursalSelected(null);
    setCajaSelected(null);
  };

  if (!mounted) return null;

  const totalGeneral = getTotalGeneral();

  // Vista de detalle: vales individuales de una caja específica
  if (sucursalSelected && cajaSelected) {
    const valesFiltrados = getValesDeCaja(sucursalSelected, cajaSelected);
    const cicloActual = cycles.find(c => c.id === selectedCycle);

    return (
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={volverAlResumen}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-headline text-primary">
                {sucursalSelected} — {cajaSelected}
              </h1>
              <p className="text-sm text-muted-foreground">
                {cicloActual?.label || selectedCycle} · {valesFiltrados.length} vale(s)
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push('/admin')}>
            Ir al Dashboard
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-bold">N° Vale</TableHead>
                    <TableHead className="font-bold">Fecha</TableHead>
                    <TableHead className="font-bold">Entregado a</TableHead>
                    <TableHead className="font-bold">Rubro</TableHead>
                    <TableHead className="font-bold text-right">Monto</TableHead>
                    <TableHead className="font-bold text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valesFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                        No hay vales registrados en esta caja para el ciclo seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    valesFiltrados.map(vale => (
                      <TableRow key={vale.id} className="hover:bg-muted/10">
                        <TableCell className="font-black text-primary">{vale.numVale}</TableCell>
                        <TableCell className="text-xs font-mono">{vale.fecha}</TableCell>
                        <TableCell className="uppercase text-xs font-medium">
                          {vale.entregado}
                          <div className="text-[9px] text-muted-foreground font-bold">{vale.rubro}</div>
                        </TableCell>
                        <TableCell className="text-xs">{vale.concepto || vale.rubro}</TableCell>
                        <TableCell className="font-black text-indigo-700 text-right">$ {vale.monto}</TableCell>
                        <TableCell className="text-center">
                          {vale.firmado ? (
                            <Badge className="bg-emerald-600 font-bold text-[9px]">FIRMADO</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300 font-bold">PENDIENTE</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vista de resumen general
  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline text-primary flex items-center gap-3">
            <Building2 className="w-8 h-8" /> 
            Resumen de Cajas
          </h1>
          <p className="text-muted-foreground">
            Control operativo por sucursal y tipo de caja — Datos reales del ciclo contable
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Select value={selectedCycle} onValueChange={setSelectedCycle}>
            <SelectTrigger className="w-[240px] h-12 border-2 border-primary/20">
              <Calendar className="w-4 h-4 mr-2 text-primary" />
              <SelectValue placeholder="Ciclo" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => router.push('/admin')}>
            Dashboard
          </Button>
        </div>
      </header>

      {/* Tarjetas de resumen global */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase">Total Vales</p>
                <p className="text-3xl font-black font-headline">{totalGeneral.total}</p>
              </div>
              <FileText className="w-8 h-8 text-primary/10" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-600 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase">Firmados</p>
                <p className="text-3xl font-black font-headline text-emerald-700">{totalGeneral.firmados}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-600/10" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-amber-600 uppercase">Pendientes</p>
                <p className="text-3xl font-black font-headline text-amber-700">{totalGeneral.pendientes}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-600/10" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-600 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase">Gasto Total</p>
                <p className="text-3xl font-black font-headline text-indigo-700">$ {totalGeneral.monto.toFixed(2)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-indigo-600/10" />
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Cargando datos reales...</span>
        </div>
      ) : (
        <div className="space-y-12">
          {sucursalesData.map(sucursal => (
            <section key={sucursal.nombre} className="space-y-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold font-headline">
                  <Building2 className="w-5 h-5 inline mr-2 text-primary" />
                  {sucursal.nombre}
                </h2>
                <div className="h-px flex-1 bg-border"></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {sucursal.cajas.map(caja => {
                  const tieneMovimiento = caja.totalVales > 0;
                  const proporcionPendientes = caja.totalVales > 0 ? (caja.pendientes / caja.totalVales) * 100 : 0;
                  
                  return (
                    <Card 
                      key={`${sucursal.nombre}-${caja.tipo}`} 
                      className={`hover:shadow-md transition-all border-2 cursor-pointer ${
                        tieneMovimiento 
                          ? proporcionPendientes > 50 
                            ? 'border-amber-400/50' 
                            : 'border-emerald-400/30'
                          : 'border-gray-200/50'
                      }`}
                      onClick={() => verDetalle(sucursal.nombre, caja.tipo)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge variant={tieneMovimiento ? "default" : "outline"} className="text-[10px] uppercase font-bold">
                            {caja.tipo}
                          </Badge>
                          {!tieneMovimiento && (
                            <span className="text-[9px] text-muted-foreground italic">Sin actividad</span>
                          )}
                        </div>
                        <CardTitle className="text-3xl font-headline mt-2">
                          $ {caja.montoTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </CardTitle>
                        <CardDescription>Monto total en vales emitidos</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-muted/30 p-2 rounded">
                            <p className="text-[9px] text-muted-foreground font-bold uppercase">Vales</p>
                            <p className="font-black text-lg">{caja.totalVales}</p>
                          </div>
                          <div className="bg-muted/30 p-2 rounded">
                            <p className="text-[9px] text-muted-foreground font-bold uppercase">Pendientes</p>
                            <p className={`font-black text-lg ${caja.pendientes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {caja.pendientes}
                            </p>
                          </div>
                        </div>
                        
                        {tieneMovimiento && (
                          <>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-emerald-600 font-medium">Firmados: ${caja.montoFirmado.toFixed(2)}</span>
                              <span className="text-amber-600 font-medium">Pend: ${caja.montoPendiente.toFixed(2)}</span>
                            </div>
                            
                            {/* Barra de progreso de firmas */}
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all"
                                style={{ width: `${caja.totalVales > 0 ? (caja.firmados / caja.totalVales) * 100 : 0}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-muted-foreground text-right">
                              {caja.firmados}/{caja.totalVales} firmados
                            </p>
                          </>
                        )}
                        
                        <div className="pt-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-between text-xs"
                            onClick={(e) => { e.stopPropagation(); verDetalle(sucursal.nombre, caja.tipo); }}
                          >
                            <span>Ver vales</span>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest pt-4 border-t">
        <span>Flynet Digital v4.7 · Datos del ciclo {cycles.find(c => c.id === selectedCycle)?.label || selectedCycle}</span>
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> 
            Datos reales
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function CajasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Cargando resumen de cajas...</div>}>
      <CajasContent />
    </Suspense>
  );
}