"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SuperAdminPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  // Verificar si ya hay sesión activa
  useEffect(() => {
    fetch("/api/super-admin/login")
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          router.replace("/super-admin/explorador");
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        toast({ title: "Acceso concedido", description: "Bienvenido, Super Admin." });
        router.push("/super-admin/explorador");
      } else {
        toast({ variant: "destructive", title: "Acceso denegado", description: data.error || "Password incorrecto." });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo verificar el acceso." });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-sm border-slate-700 bg-slate-800/80 backdrop-blur">
        <CardHeader className="text-center space-y-1 pb-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <CardTitle className="text-xl text-white">Super Admin</CardTitle>
          <CardDescription className="text-slate-400">
            Centro de carga y gestión de archivos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                type="password"
                placeholder="Password de acceso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Ingresar
            </Button>
          </form>
          <p className="text-[10px] text-slate-600 text-center mt-4">
            Acceso restringido · Flynet S.A. de C.V.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
