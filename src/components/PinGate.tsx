"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { verifyPinAction } from "@/app/actions/config";
import { Lock, Loader2, ShieldCheck } from "lucide-react";

const AUTH_KEY = "valedigit_auth";

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const { toast } = useToast();
  const [isAuthed, setIsAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Verificar si ya se autenticó en esta sesión del navegador
    const stored = sessionStorage.getItem(AUTH_KEY);
    if (stored === "true") {
      setIsAuthed(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) return;

    setIsVerifying(true);
    try {
      const result = await verifyPinAction(pin, "");
      if (result.success) {
        setIsAuthed(true);
        sessionStorage.setItem(AUTH_KEY, "true");
        toast({ title: "Bienvenido(a)", description: `Acceso concedido como ${result.user?.role}` });
      } else {
        toast({
          variant: "destructive",
          title: "PIN Inválido",
          description: result.error || "El código ingresado no es correcto."
        });
        setPin("");
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo conectar con el servidor."
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (!mounted) return null;

  if (isAuthed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <Card className="w-full max-w-md shadow-2xl border-2">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="font-headline text-2xl">Acceso al Sistema</CardTitle>
          <CardDescription>
            Ingrese su PIN de seguridad para acceder a la aplicación
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="app-pin-input" className="text-sm font-bold text-muted-foreground uppercase block text-center">
                PIN DE ACCESO
              </label>
              <Input
                id="app-pin-input"
                name="app_pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoComplete="one-time-code"
                placeholder="****"
                className="text-center text-4xl h-20 font-bold tracking-widest border-2 focus:border-primary"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                disabled={isVerifying}
              />
            </div>
            <Button
              type="submit"
              className="w-full h-14 text-lg font-bold shadow-lg"
              disabled={isVerifying || pin.length < 4}
            >
              {isVerifying ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
              Ingresar
            </Button>
          </form>
          <p className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] text-center mt-6">
            Flynet Digital Security v6.0
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
