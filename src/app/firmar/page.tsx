
"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SignatureCanvas } from "@/components/firma/SignatureCanvas";
import { CONFIG, ADMIN_PIN } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { saveVoucherAction, checkVoucherStatusAction } from "@/app/actions/vouchers";
import { 
  Lock, 
  FileSignature, 
  CheckCircle2, 
  Loader2, 
  AlertTriangle, 
  XCircle, 
  MessageSquare,
  UserCheck,
  ShieldAlert,
  ShieldX
} from "lucide-react";

function FirmaContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(true);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [pin, setPin] = useState("");
  const [isPinCorrect, setIsPinCorrect] = useState(false);
  const [authorizedUser, setAuthorizedUser] = useState<{name: string, role: string} | null>(null);
  const [showSkipForm, setShowSkipForm] = useState(searchParams.get("mode") === "skip");
  const [motivo, setMotivo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const voucherData = {
    fila: searchParams.get("fila") || "",
    sheet: searchParams.get("sheet") || "",
    id: searchParams.get("id") || "",
    numVale: searchParams.get("numVale") || "",
    entregado: searchParams.get("entregado") || "",
    monto: searchParams.get("monto") || "0.00",
    rubro: searchParams.get("rubro") || "",
    concepto: searchParams.get("concepto") || "",
    sucursal: searchParams.get("sucursal") || "",
    fecha: searchParams.get("fecha") || "",
  };

  useEffect(() => {
    const verifyStatus = async () => {
      if (!voucherData.id) return;
      const status = await checkVoucherStatusAction(voucherData.id, voucherData.fecha);
      if (status && (status.firmado || !!status.motivoOmitido)) {
        setAlreadySigned(true);
      }
      setIsLoading(false);
    };
    verifyStatus();
  }, [voucherData.id, voucherData.fecha]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsPinCorrect(true);
      setAuthorizedUser({ name: "ADMINISTRADOR", role: "ADMIN" });
      return;
    }
    const employeeEntry = Object.entries(CONFIG.PINES).find(([_, data]) => data.pin === pin);
    if (employeeEntry) {
      const [name, data] = employeeEntry;
      const isGlobalRole = data.role === "ADMIN" || data.role === "JEFE";
      const isCorrectBranch = data.branch === voucherData.sucursal;
      if (!isGlobalRole && !isCorrectBranch) {
        toast({ variant: "destructive", title: "Acceso Denegado", description: `Usted está asignado a ${data.branch || 'otra sede'}.` });
        setPin("");
        return;
      }
      setIsPinCorrect(true);
      setAuthorizedUser({ name, role: data.role });
    } else {
      toast({ variant: "destructive", title: "PIN Inválido", description: "El código ingresado no existe." });
      setPin("");
    }
  };

  const handleAction = async (signatureBase64?: string, skipMotivo?: string) => {
    setIsSubmitting(true);
    try {
      await saveVoucherAction({
        ...voucherData,
        firmado: !skipMotivo,
        firmaUrl: signatureBase64,
        motivoOmitido: skipMotivo,
        timestamp: new Date().toISOString(),
        autorizadoPor: authorizedUser?.name
      });
      await fetch(CONFIG.API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fila: voucherData.fila,
          sheet: voucherData.sheet,
          id: voucherData.id,
          firma: signatureBase64 || "",
          motivo: skipMotivo || "",
          autorizadoPor: authorizedUser?.name
        }),
      });
      setIsSuccess(true);
    } catch (error) {
      console.error("Error al sincronizar:", error);
      toast({ variant: "destructive", title: "Error de red", description: "Fallo al conectar con Google Sheets." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center font-headline text-primary">Verificando estado...</div>;
  }

  if (alreadySigned) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl border-amber-200">
          <CardContent className="space-y-6">
            <ShieldX className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="text-2xl font-bold font-headline text-amber-900">Vale ya firmado</h2>
            <p className="text-muted-foreground text-sm">Este documento ya cuenta con una firma registrada y no puede ser modificado.</p>
            <Button className="w-full h-12" variant="outline" onClick={() => window.close()}>Cerrar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl">
          <CardContent className="space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold font-headline text-primary">¡Procesado!</h2>
            <p className="text-muted-foreground">La información ha sido enviada con éxito.</p>
            <Button className="w-full h-12 text-lg font-bold" variant="outline" onClick={() => window.close()}>Finalizar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center gap-6 max-w-lg mx-auto">
      <Card className="w-full shadow-2xl border-2">
        <CardHeader className="bg-primary/5 border-b p-6">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="font-headline text-xl">
                {showSkipForm ? "Autorización Especial" : `Firma Vale #${voucherData.numVale}`}
              </CardTitle>
              <CardDescription>Sede: {voucherData.sucursal} • Para: {voucherData.entregado}</CardDescription>
            </div>
            {authorizedUser && (
              <div className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold text-primary">{authorizedUser.role}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {!isPinCorrect ? (
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <label className="text-sm font-bold text-muted-foreground uppercase">PIN DE ENCARGADO</label>
                </div>
                <Input type="password" inputMode="numeric" maxLength={4} placeholder="****" className="text-center text-4xl h-20 font-bold tracking-widest border-2 focus:border-primary" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 mt-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-[10px] text-amber-800 font-medium">Solo personal autorizado de esta sede puede firmar o autorizar este desembolso.</p>
                </div>
              </div>
              <Button type="submit" className="w-full h-14 text-lg font-bold shadow-lg">Verificar PIN</Button>
            </form>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {!showSkipForm ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2"><FileSignature className="w-4 h-4" /> Firma Digital</span>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive h-8" onClick={() => setShowSkipForm(true)}>
                      <XCircle className="w-3 h-3 mr-1" /> Omitir Firma
                    </Button>
                  </div>
                  <SignatureCanvas onSave={(base64) => handleAction(base64)} isSubmitting={isSubmitting} />
                </>
              ) : (
                <div className="space-y-4 border-2 border-dashed border-destructive/30 p-4 rounded-xl bg-destructive/5">
                  <h3 className="text-destructive font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Justificación de Omisión</h3>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Motivo</label>
                    <Textarea placeholder="Ej: Autorización por WhatsApp..." className="min-h-[100px] border-destructive/20" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </div>
                  <Button variant="destructive" className="w-full h-12 font-bold" disabled={!motivo.trim() || isSubmitting} onClick={() => handleAction(undefined, motivo)}>
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Confirmar Autorización
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em]">Flynet Digital Security v5.0</p>
    </div>
  );
}

export default function FirmaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-headline">Conectando con Seguridad...</div>}>
      <FirmaContent />
    </Suspense>
  );
}
