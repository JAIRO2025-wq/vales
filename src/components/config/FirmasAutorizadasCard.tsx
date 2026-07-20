"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFirmasAutorizadasAction, type FirmaAutorizada } from "@/app/actions/firmas-autorizadas";
import { getLunesActual } from "@/lib/week-utils";
import { CONFIG } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Building2,
  QrCode,
  CheckCircle,
  Loader2,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";

/** Busca en CONFIG.PINES el nombre de la persona con el rol dado para una sucursal */
function getNombreFromPines(sucursal: string, role: 'CAJERA' | 'JEFE'): string | null {
  const sucursalUpper = sucursal.toUpperCase();
  for (const [name, data] of Object.entries(CONFIG.PINES)) {
    const branchUpper = (data.branch || '').toUpperCase();
    if (data.role === role && branchUpper === sucursalUpper) {
      return name;
    }
  }
  return null;
}

/** Obtiene el nombre de la cajera/jefe, priorizando PIN sobre firma guardada */
function getDisplayName(sucursal: string, role: 'CAJERA' | 'JEFE', firma?: FirmaAutorizada): string {
  const nombrePin = getNombreFromPines(sucursal, role);
  if (nombrePin) return nombrePin;
  if (firma?.nombre) return firma.nombre;
  return role === 'CAJERA' ? 'Cajera' : 'Jefe';
}

export function FirmasAutorizadasCard() {
  const { toast } = useToast();
  const [firmasAutorizadas, setFirmasAutorizadas] = useState<Record<string, FirmaAutorizada[]>>({});
  const [isExpanded, setIsExpanded] = useState(true);
  const [loadingFirmas, setLoadingFirmas] = useState(false);
  const lunesActual = getLunesActual();
  const lastLoadedLunes = useRef<string | null>(null);

  const loadFirmas = async (force = false) => {
    // Cache por lunes: si ya cargamos esta semana, no recargar a menos que sea forzado
    if (!force && lastLoadedLunes.current === lunesActual && Object.keys(firmasAutorizadas).length > 0) {
      return;
    }
    setLoadingFirmas(true);
    try {
      const result: Record<string, FirmaAutorizada[]> = {};
      for (const s of CONFIG.SUCURSALES) {
        const firmas = await getFirmasAutorizadasAction(s);
        if (firmas.length > 0) result[s] = firmas;
      }
      setFirmasAutorizadas(result);
      lastLoadedLunes.current = lunesActual;
    } catch (err) {
      console.error("Error cargando firmas:", err);
    } finally {
      setLoadingFirmas(false);
    }
  };

  // Auto-cargar al montar el componente
  useEffect(() => {
    loadFirmas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refrescar automáticamente al cambiar de semana (cada lunes)
  useEffect(() => {
    if (lastLoadedLunes.current && lastLoadedLunes.current !== lunesActual) {
      loadFirmas(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunesActual]);

  const lunes = lunesActual;
  const pythonBaseUrl = (CONFIG.PDF_API_URL || '').endsWith('/')
    ? CONFIG.PDF_API_URL.slice(0, -1)
    : CONFIG.PDF_API_URL;

  /** Resuelve URL de firma: si es relativa, le antepone el servidor Python */
  const resolveFirmaUrl = (url?: string): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    if (url.startsWith('/') && pythonBaseUrl) return `${pythonBaseUrl}${url}`;
    if (pythonBaseUrl) return `${pythonBaseUrl}/${url}`;
    return url;
  };

  return (
    <Card className="border-2">
      <CardHeader
        className="pb-0 cursor-pointer select-none"
        onClick={() => {
          const next = !isExpanded;
          setIsExpanded(next);
          if (next && Object.keys(firmasAutorizadas).length === 0) loadFirmas();
        }}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="font-headline flex items-center gap-2 text-xl">
            <ShieldCheck className="w-5 h-5" />
            Firmas Autorizadas
          </CardTitle>
          <div className="flex items-center gap-2">
            {loadingFirmas && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
        <CardDescription className="text-xs mt-1">
          Firmas semanales de cajeras y jefes por sucursal. Se renuevan cada lunes.
        </CardDescription>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-3 space-y-3 animate-in slide-in-from-top-2 duration-300">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() => loadFirmas(true)}
          >
            <RefreshCcw className="w-3 h-3 mr-1.5" />
            Refrescar
          </Button>
          {Object.keys(firmasAutorizadas).length === 0 && loadingFirmas && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Cargando firmas autorizadas...
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONFIG.SUCURSALES.map((suc) => {
              const firmas = firmasAutorizadas[suc] || [];
              const cajera = firmas.find(f => f.tipo === 'CAJERA');
              const jefe = firmas.find(f => f.tipo === 'JEFE');
              const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
              const qrCajera = `${baseUrl}/autorizar?sucursal=${encodeURIComponent(suc)}&tipo=CAJERA`;
              const qrJefe = `${baseUrl}/autorizar?sucursal=${encodeURIComponent(suc)}&tipo=JEFE`;

              return (
                <div key={suc} className="bg-primary/[0.02] rounded-xl border border-primary/10 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-headline truncate max-w-[120px]" title={suc}>
                      <Building2 className="w-3 h-3 inline mr-1 text-primary/60" />
                      {suc}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      Semana {lunes}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Cajera */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Cajera</span>
                      <span className="text-[10px] font-semibold text-primary truncate flex items-center gap-1" title={getDisplayName(suc, 'CAJERA', cajera)}>
                        <User className="w-2.5 h-2.5 flex-shrink-0" />
                        {getDisplayName(suc, 'CAJERA', cajera)}
                      </span>
                      {cajera?.firmaUrl ? (
                        <div className="bg-white rounded-lg border p-2 flex items-center justify-center h-20">
                          <img
                            src={resolveFirmaUrl(cajera.firmaUrl)}
                            alt={`Firma Cajera - ${suc}`}
                            className="max-h-16 max-w-full object-contain mix-blend-multiply"
                          />
                        </div>
                      ) : (
                        <div className="bg-red-50 rounded-lg border border-red-200 p-2 flex items-center justify-center h-20">
                          <span className="text-[10px] font-bold text-red-500">PENDIENTE</span>
                        </div>
                      )}
                      <div className="text-[9px]">
                        {cajera ? (
                          <span className="text-green-700 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-2.5 h-2.5" /> OK
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold">Sin firma</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="w-full h-8 text-[10px] gap-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(qrCajera);
                          toast({ title: 'Link copiado', description: `URL Cajera - ${suc}` });
                          window.open(qrCajera, '_blank');
                        }}
                      >
                        <QrCode className="w-4 h-4" /> QR Cajera
                      </Button>
                    </div>
                    {/* Jefe */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Jefe</span>
                      <span className="text-[10px] font-semibold text-purple-600 truncate flex items-center gap-1" title={getDisplayName(suc, 'JEFE', jefe)}>
                        <User className="w-2.5 h-2.5 flex-shrink-0" />
                        {getDisplayName(suc, 'JEFE', jefe)}
                      </span>
                      {jefe?.firmaUrl ? (
                        <div className="bg-white rounded-lg border p-2 flex items-center justify-center h-20">
                          <img
                            src={resolveFirmaUrl(jefe.firmaUrl)}
                            alt={`Firma Jefe - ${suc}`}
                            className="max-h-16 max-w-full object-contain mix-blend-multiply"
                          />
                        </div>
                      ) : (
                        <div className="bg-red-50 rounded-lg border border-red-200 p-2 flex items-center justify-center h-20">
                          <span className="text-[10px] font-bold text-red-500">PENDIENTE</span>
                        </div>
                      )}
                      <div className="text-[9px]">
                        {jefe ? (
                          <span className="text-green-700 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-2.5 h-2.5" /> OK
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold">Sin firma</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="w-full h-8 text-[10px] gap-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(qrJefe);
                          toast({ title: 'Link copiado', description: `URL Jefe - ${suc}` });
                          window.open(qrJefe, '_blank');
                        }}
                      >
                        <QrCode className="w-4 h-4" /> QR Jefe
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
