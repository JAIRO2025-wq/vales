"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONFIG, type AppConfig, type UserRole } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { updateConfigAction } from "@/app/actions/config";
import { useRouter } from "next/navigation";
import { 
  Settings, 
  Building2, 
  Users, 
  Plus, 
  Trash2, 
  Save,
  Globe,
  Loader2,
  ShieldCheck,
  MapPin,
  Cpu
} from "lucide-react";

export default function ConfigPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [localConfig, setLocalConfig] = useState<AppConfig>({ ...CONFIG });
  const [isSaving, setIsSaving] = useState(false);
  const [newSucursal, setNewSucursal] = useState("");
  const [newEmployee, setNewEmployee] = useState({ 
    name: "", 
    pin: "", 
    role: "CAJERA" as UserRole,
    branch: "GLOBAL"
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    const result = await updateConfigAction(localConfig);
    setIsSaving(false);

    if (result.success) {
      toast({ title: "Configuración guardada", description: "Cambios aplicados con éxito." });
      router.refresh();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error });
    }
  };

  const addSucursal = () => {
    if (newSucursal && !localConfig.SUCURSALES.includes(newSucursal.toUpperCase())) {
      setLocalConfig({
        ...localConfig,
        SUCURSALES: [...localConfig.SUCURSALES, newSucursal.toUpperCase()],
      });
      setNewSucursal("");
    }
  };

  const addEmployee = () => {
    if (newEmployee.name && newEmployee.pin) {
      setLocalConfig({
        ...localConfig,
        PINES: {
          ...localConfig.PINES,
          [newEmployee.name.toUpperCase()]: { 
            pin: newEmployee.pin, 
            role: newEmployee.role,
            branch: newEmployee.branch === "GLOBAL" ? undefined : newEmployee.branch
          },
        },
      });
      setNewEmployee({ name: "", pin: "", role: "CAJERA", branch: "GLOBAL" });
    }
  };

  const removeEmployee = (key: string) => {
    const updatedPines = { ...localConfig.PINES };
    delete updatedPines[key];
    setLocalConfig({ ...localConfig, PINES: updatedPines });
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-5xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline text-primary flex items-center gap-3">
            <Settings className="w-8 h-8" /> Configuración ValeDigit
          </h1>
          <p className="text-muted-foreground">Gestión de encargados, sucursales y seguridad.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="flex gap-2 min-w-[140px]">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar Cambios
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Personal con Roles y Sucursales */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <Users className="w-5 h-5" /> Gestión de Encargados y Cajeras
            </CardTitle>
            <CardDescription>Asigne cajeras a sucursales específicas o cree perfiles globales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-muted/30 p-4 rounded-lg">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input 
                  placeholder="Ej: MARÍA LÓPEZ" 
                  value={newEmployee.name} 
                  onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={newEmployee.role} onValueChange={(val: UserRole) => setNewEmployee({...newEmployee, role: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAJERA">Cajera / Encargado</SelectItem>
                    <SelectItem value="SOLICITANTE">Solicitante</SelectItem>
                    <SelectItem value="JEFE">Gerente / Jefe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sede Asignada</Label>
                <Select value={newEmployee.branch} onValueChange={(val) => setNewEmployee({...newEmployee, branch: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">Global / Todas</SelectItem>
                    {localConfig.SUCURSALES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PIN (4 dígitos)</Label>
                <Input 
                  type="password"
                  maxLength={4}
                  placeholder="****" 
                  value={newEmployee.pin} 
                  onChange={(e) => setNewEmployee({...newEmployee, pin: e.target.value})}
                />
              </div>
              <Button onClick={addEmployee} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Añadir
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card Fija de Admin */}
              <div className="p-4 border-2 border-primary/20 rounded-xl bg-primary/5 flex justify-between items-center">
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    ADMINISTRADOR <ShieldCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Sede: GLOBAL</div>
                  <Badge variant="outline" className="text-[9px] mt-2">ADMIN</Badge>
                </div>
                <div className="text-[10px] font-mono font-bold bg-white px-2 py-1 rounded border">PIN: 2026</div>
              </div>

              {/* Lista Dinámica */}
              {Object.entries(localConfig.PINES).map(([name, data]) => (
                <div key={name} className="p-4 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="font-bold text-sm block">{name}</span>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold uppercase">
                      <MapPin className="w-3 h-3" /> {data.branch || "GLOBAL"}
                    </div>
                    <Badge variant="secondary" className="text-[9px] h-5">{data.role}</Badge>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:bg-destructive/10 h-8 w-8" 
                      onClick={() => removeEmployee(name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <span className="text-[9px] font-mono text-muted-foreground">PIN: ****</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conectividad y APIs */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <Globe className="w-5 h-5" /> Conectividad y APIs
            </CardTitle>
            <CardDescription>Configura las URLs de los servidores para sincronización y PDF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="w-4 h-4" /> Google Apps Script (Backend Google Sheets)
              </Label>
              <Input 
                value={localConfig.API_URL} 
                placeholder="https://script.google.com/macros/s/..."
                onChange={(e) => setLocalConfig({...localConfig, API_URL: e.target.value})} 
              />
              <p className="text-[10px] text-muted-foreground italic">Esta URL gestiona la persistencia de datos en tu hoja de cálculo.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" /> Motor PDF (Python FastAPI)
              </Label>
              <Input 
                value={localConfig.PDF_API_URL} 
                placeholder="http://localhost:8000"
                onChange={(e) => setLocalConfig({...localConfig, PDF_API_URL: e.target.value})} 
              />
              <p className="text-[10px] text-muted-foreground italic">En producción, pega aquí la URL pública de tu servidor de Python (ej: https://api-pdf.tudominio.com).</p>
            </div>
          </CardContent>
        </Card>

        {/* Sucursales */}
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <Building2 className="w-5 h-5" /> Sedes Operativas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Nueva sucursal..." 
                value={newSucursal} 
                onChange={(e) => setNewSucursal(e.target.value)}
              />
              <Button size="icon" onClick={addSucursal}><Plus /></Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {localConfig.SUCURSALES.map((s, i) => (
                <Badge key={s} variant="secondary" className="pl-3 pr-1 py-1 flex gap-2 items-center text-sm">
                  {s}
                  <Button variant="ghost" size="icon" className="h-4 w-4 hover:text-destructive" onClick={() => {
                     const updated = localConfig.SUCURSALES.filter((_, idx) => idx !== i);
                     setLocalConfig({ ...localConfig, SUCURSALES: updated });
                  }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Datos Empresa */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2 text-xl">
              <Globe className="w-5 h-5" /> Identidad de la Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Nombre de la Empresa</Label>
              <Input value={localConfig.EMPRESA} onChange={(e) => setLocalConfig({...localConfig, EMPRESA: e.target.value})} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
