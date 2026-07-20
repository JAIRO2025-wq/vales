"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authorizeVoucherByTokenAction } from "@/app/actions/vouchers";
import { verifyPinAction } from "@/app/actions/config";
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  FileWarning,
} from "lucide-react";

function AutorizarValeContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const token = searchParams.get("token") || "";

  const [isValidating, setIsValidating] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPinOK, setIsPinOK] = useState(false);

  // Validar token al cargar
  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      return;
    }
    // No podemos validar el token sin PIN todavía, solo verificar que no está vacío
    setTokenValido(!!token);
    setIsValidating(false);
  }, [token]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) return;

    setIsVerifying(true);
    try {
      // Verificar PIN genérico (cualquier PIN de jefe válido)
      const result = await verifyPinAction(pin, "");
      if (result.success && result.user) {
        setIsPinOK(true);
        toast({ title: "PIN Verificado", description: `Bienvenido(a) ${result.user.name}` });
      } else {
        toast({
          variant: "destructive",
          title: "PIN Inválido",
          description: "El código ingresado no es correcto. Solo jefes de agencia pueden autorizar.",
        });
        setPin("");
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo conectar con el servidor." });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAutorizar = async () => {
    if (!token || !isPinOK) return;
    setIsVerifying(true);
    try {
      const result = await authorizeVoucherByTokenAction(token);
      if (result.success) {
        setVoucherInfo(result.voucher);
        setIsAuthorized(true);
        toast({
          title: "Vale Autorizado",
          description: `Vale #${result.voucher?.numVale} autorizado exitosamente.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error de autorización",
          description: result.error || "No se pudo autorizar el vale. El token puede haber expirado.",
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Error al procesar la autorización." });
    } finally {
      setIsVerifying(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl">
          <CardContent>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground mt-4">Validando solicitud...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl">
          <CardContent className="space-y-4">
            <FileWarning className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold font-headline">Enlace Inválido</h2>
            <p className="text-sm text-muted-foreground">
              Este enlace de autorización no es válido o ha expirado.
            </p>
            <Button variant="outline" onClick={() => window.close()}>
              Cerrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAuthorized && voucherInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl">
          <CardContent className="space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold font-headline text-primary">¡Vale Autorizado!</h2>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200 space-y-2 text-left">
              <p className="text-sm"><strong>Vale #:</strong> {voucherInfo.numVale}</p>
              <p className="text-sm"><strong>Entregado a:</strong> {voucherInfo.entregado}</p>
              <p className="text-sm"><strong>Sucursal:</strong> {voucherInfo.sucursal}</p>
              <p className="text-sm"><strong>ID:</strong> {voucherInfo.id}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              El vale ya puede ser firmado por el usuario. Puedes cerrar esta página.
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
      <Card className="w-full shadow-2xl border-2 border-purple-200">
        <CardHeader className="bg-purple-50 border-b border-purple-100 p-6">
          <CardTitle className="font-headline text-xl flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            Autorización de Jefe de Agencia
          </CardTitle>
          <CardDescription>
            Como jefe de agencia, autoriza este vale para que pueda ser firmado
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {!isPinOK ? (
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <label className="text-sm font-bold text-muted-foreground uppercase">
                    PIN DE JEFE
                  </label>
                </div>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="one-time-code"
                  placeholder="****"
                  className="text-center text-4xl h-20 font-bold tracking-widest border-2 border-purple-200 focus:border-purple-500"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoFocus
                  disabled={isVerifying}
                />
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 mt-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-[10px] text-amber-800 font-medium">
                    Solo el jefe de agencia autorizado puede aprobar este vale. Tu PIN es personal e intransferible.
                  </p>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700 shadow-lg"
                disabled={isVerifying || pin.length < 4}
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Verificar PIN"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-green-800">Identidad verificada</p>
                <p className="text-xs text-green-600 mt-1">
                  Puedes proceder a autorizar este vale
                </p>
              </div>
              <Button
                onClick={handleAutorizar}
                disabled={isVerifying}
                className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700 shadow-lg"
              >
                {isVerifying ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="w-5 h-5 mr-2" />
                )}
                Autorizar Vale
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em]">
        Flynet Digital · Doble Autorización v1.0
      </p>
    </div>
  );
}

export default function AutorizarValePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-headline">Conectando...</div>}>
      <AutorizarValeContent />
    </Suspense>
  );
}
