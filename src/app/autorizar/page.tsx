"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SignatureCanvas } from "@/components/firma/SignatureCanvas";
import { CONFIG } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";
import { saveFirmaAutorizadaAction } from "@/app/actions/firmas-autorizadas";
import { getLunesActual } from "@/lib/week-utils";
import { verifyPinAction } from "@/app/actions/config";
import {
  Lock,
  FileSignature,
  CheckCircle2,
  Loader2,
  UserCheck,
  ShieldAlert,
} from "lucide-react";

function AutorizarContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const sucursal = searchParams.get("sucursal") || "";
  const tipo = (searchParams.get("tipo") || "CAJERA") as "CAJERA" | "JEFE";
  const tipoLabel = tipo === "CAJERA" ? "Cajera" : "Jefe de Agencia";

  const [pin, setPin] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isPinCorrect, setIsPinCorrect] = useState(false);
  const [authorizedUser, setAuthorizedUser] = useState<{ name: string; role: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) return;

    setIsVerifyingPin(true);
    try {
      const result = await verifyPinAction(pin, sucursal);
      if (result.success && result.user) {
        setIsPinCorrect(true);
        setAuthorizedUser(result.user);
        toast({ title: "PIN Verificado", description: `Bienvenido(a) ${result.user.name}` });
      } else {
        toast({
          variant: "destructive",
          title: "PIN Inválido",
          description: result.error || "El código ingresado no es correcto.",
        });
        setPin("");
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo conectar con el servidor." });
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const base64ToBlob = (base64: string, type: string): Blob => {
    const byteCharacters = atob(base64.split(",")[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type });
  };

  const handleSaveFirma = async (signatureBase64: string) => {
    setIsSubmitting(true);
    try {
      // Subir firma al servidor Python
      const pythonBaseUrl = CONFIG.PDF_API_URL.endsWith("/")
        ? CONFIG.PDF_API_URL.slice(0, -1)
        : CONFIG.PDF_API_URL;
      const blob = base64ToBlob(signatureBase64, "image/png");
      const formData = new FormData();
      const fileName = `firma_${sucursal.replace(/\s+/g, '_')}_${tipo}_${Date.now()}.png`;
      formData.append("file", blob, fileName);

      const uploadRes = await fetch(`${pythonBaseUrl}/upload-firma/${encodeURIComponent(`FIRMA-${sucursal}-${tipo}`)}`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Error al subir firma (HTTP ${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(uploadData.error || "El servidor rechazó la firma");
      }

      const firmaPath = uploadData.image_url;
      // Construir URL completa combinando base del servidor Python + ruta relativa
      const firmaFullUrl = uploadData.image_url?.startsWith('/')
        ? `${pythonBaseUrl}${uploadData.image_url}`
        : `${pythonBaseUrl}/${uploadData.image_url}`;
      const lunes = getLunesActual();

      const result = await saveFirmaAutorizadaAction(sucursal, tipo, authorizedUser?.name || '', firmaFullUrl, lunes);

      if (result.success) {
        setIsSuccess(true);
        toast({ title: "Firma registrada", description: `Firma de ${tipoLabel} para ${sucursal} guardada (semana del ${lunes}).` });
      } else {
        throw new Error(result.error || "Error al guardar");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl">
          <CardContent className="space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold font-headline text-primary">¡Firma Registrada!</h2>
            <p className="text-muted-foreground">
              La firma de <strong>{tipoLabel}</strong> para <strong>{sucursal}</strong> ha sido guardada.
            </p>
            <p className="text-xs text-muted-foreground">
              Se usará para todos los vales de esta sucursal durante la semana actual.
            </p>
            <Button className="w-full h-12" variant="outline" onClick={() => window.close()}>
              Cerrar
            </Button>
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
            <div className="space-y-3">
              <CardTitle className="font-headline text-xl">
                Firma de {tipoLabel}
              </CardTitle>
              <CardDescription>
                Sucursal: {sucursal} · Válido para la semana actual
              </CardDescription>
            </div>
            {authorizedUser && (
              <div className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2 shrink-0">
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
                  <label className="text-sm font-bold text-muted-foreground uppercase">
                    PIN DE {tipoLabel.toUpperCase()}
                  </label>
                </div>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="one-time-code"
                  placeholder="****"
                  className="text-center text-4xl h-20 font-bold tracking-widest border-2 focus:border-primary"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                  disabled={isVerifyingPin}
                />
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 mt-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-[10px] text-amber-800 font-medium">
                    Solo {tipoLabel.toLowerCase()} autorizado(a) de {sucursal} puede registrar esta firma.
                  </p>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold shadow-lg"
                disabled={isVerifyingPin || pin.length < 4}
              >
                {isVerifyingPin ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Verificar PIN"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                  <FileSignature className="w-4 h-4" /> Firma de {tipoLabel}
                </span>
              </div>
              <SignatureCanvas onSave={handleSaveFirma} isSubmitting={isSubmitting} />
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em]">
        Flynet Digital · Firmas Autorizadas v1.0
      </p>
    </div>
  );
}

export default function AutorizarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-headline">Conectando...</div>}>
      <AutorizarContent />
    </Suspense>
  );
}
