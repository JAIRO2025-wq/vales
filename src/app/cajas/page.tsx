"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONFIG } from "@/lib/config";
import { Building2, Calendar, ChevronRight, Wallet, History, AlertCircle } from "lucide-react";

export default function CajasPage() {
  // Generate multi-box data per branch
  const branchesData = CONFIG.SUCURSALES.map(s => ({
    nombre: s,
    cajas: CONFIG.TIPOS_CAJA.map(type => ({
      tipo: type,
      saldo: Math.floor(Math.random() * 8000) + 500,
      valesPendientes: Math.floor(Math.random() * 8),
      estado: Math.random() > 0.8 ? "Crítico" : "Normal"
    }))
  }));

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold font-headline text-primary flex items-center gap-2">
            <Building2 /> Gestión de Cajas por Sucursal
          </h1>
          <p className="text-muted-foreground">Control de saldos operativos para Caja Chica, Clientes e Instalaciones</p>
        </div>
        <Button variant="outline" onClick={() => window.location.href = '/admin'}>Volver al Dashboard</Button>
      </header>

      <div className="space-y-12">
        {branchesData.map(branch => (
          <section key={branch.nombre} className="space-y-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold font-headline">Sucursal {branch.nombre}</h2>
              <div className="h-px flex-1 bg-border"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {branch.cajas.map(caja => (
                <Card key={`${branch.nombre}-${caja.tipo}`} className={`hover:shadow-md transition-all border-2 ${caja.estado === 'Crítico' ? 'border-destructive/30' : 'border-transparent'}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge variant={caja.estado === 'Crítico' ? 'destructive' : 'secondary'} className="text-[10px] uppercase font-bold">
                        {caja.tipo}
                      </Badge>
                      {caja.estado === 'Crítico' && <AlertCircle className="w-4 h-4 text-destructive animate-pulse" />}
                    </div>
                    <CardTitle className="text-3xl font-headline mt-4">$ {caja.saldo.toLocaleString()}</CardTitle>
                    <CardDescription>Saldo disponible en caja</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Vales pendientes:</span>
                      <span className={`font-bold ${caja.valesPendientes > 5 ? 'text-destructive' : ''}`}>{caja.valesPendientes}</span>
                    </div>
                    <div className="pt-4 border-t flex flex-col gap-2">
                      <Button variant="outline" size="sm" className="w-full justify-between">
                        <span>Ver transacciones</span>
                        <History className="w-3 h-3" />
                      </Button>
                      <Button size="sm" className="w-full justify-between">
                        <span>Gestionar caja</span>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 border-t pt-8">
        <Card className="bg-primary text-primary-foreground shadow-xl">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Semanas de Cierre
            </CardTitle>
            <CardDescription className="text-primary-foreground/70">Semanas operativas pendientes de auditoría final</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-white/10 p-4 rounded-lg flex justify-between items-center border border-white/20">
                <div>
                  <p className="font-bold">Semana {10 + i} - Octubre 2026</p>
                  <p className="text-xs opacity-70">Saldos consolidados de todas las sucursales</p>
                </div>
                <Button variant="secondary" size="sm">Cerrar Semana</Button>
              </div>
            ))}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-xl">Resumen de Políticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• <strong>Caja Chica:</strong> Gastos menores de oficina y mantenimiento inmediato.</p>
              <p>• <strong>Clientes:</strong> Reembolsos y gastos asociados a atención directa.</p>
              <p>• <strong>Instalaciones:</strong> Materiales y mano de obra para cuadrillas de campo.</p>
            </div>
            <div className="pt-4 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1">Descargar Manual</Button>
              <Button size="sm" variant="outline" className="flex-1 text-destructive">Reportar Error</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}