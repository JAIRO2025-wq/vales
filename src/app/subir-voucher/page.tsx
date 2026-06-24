"use client";

import React, { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CONFIG } from "@/lib/config";
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  FileImage,
  DollarSign,
  Calendar,
  Building2,
  Hash,
  ImageUp,
  Eye,
  QrCode,
} from "lucide-react";

function SubirVoucherContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Estado de verificación previa
  const [isChecking, setIsChecking] = useState(true);
  const [alreadyUploaded, setAlreadyUploaded] = useState(false);
  const [existingVoucherUrl, setExistingVoucherUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState("");

  // Leer parámetros de la URL
  const id = searchParams.get("id") || "";
  const fila = searchParams.get("fila") || "";
  const sheet = searchParams.get("sheet") || "";
  const dp = searchParams.get("dp") || "";
  const fecha = searchParams.get("fecha") || "";
  const cantidad = searchParams.get("cantidad") || "";
  const banco = searchParams.get("banco") || "";

  // Generar QR solo cuando se muestra (evita llamadas innecesarias)
  const handleShowQr = () => {
    const url = window.location.href;
    // Usamos qrserver.com (gratis, sin límites, siempre disponible)
    setQrImageUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`);
    setShowQr(true);
  };

  // ===== VERIFICAR SI YA EXISTE VOUCHER SUBIDO =====
  // Lee los params directamente de window.location.search para evitar
  // problemas de hidratación de useSearchParams() en Next.js 15 + Suspense.
  // Solo manda el ID; el endpoint extrae año/mes/sucursal del propio ID.
  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlId = urlParams.get("id") || id;

      if (!urlId) {
        setIsChecking(false);
        return;
      }

      try {
        // Endpoint dedicado de vouchers (busca en voucher-index.json)
        const res1 = await fetch(`/api/voucher-status?id=${encodeURIComponent(urlId)}`);
        if (res1.ok && !cancelled) {
          const data1 = await res1.json();
          if (data1?.voucherSubido) {
            setAlreadyUploaded(true);
            setExistingVoucherUrl(data1.voucherUrl || null);
            setIsChecking(false);
            return;
          }
        }

        // Fallback: /api/estado (busca en vouchers.json del ciclo Flynet)
        const params2 = new URLSearchParams();
        params2.set("id", urlId);
        const urlFecha = urlParams.get("fecha") || fecha;
        if (urlFecha) params2.set("fecha", urlFecha);

        const res2 = await fetch(`/api/estado?${params2.toString()}`);
        if (res2.ok && !cancelled) {
          const data2 = await res2.json();
          if (data2?.voucherSubido) {
            setAlreadyUploaded(true);
            setExistingVoucherUrl(data2.voucherUrl || null);
          }
        }
      } catch (e) {
        console.warn("No se pudo verificar estado del voucher:", e);
      }

      if (!cancelled) setIsChecking(false);
    };

    verify();
    return () => { cancelled = true; };
  }, []); // Solo se ejecuta una vez al montar

  // ===== POLLING: DETECTAR SI SE SUBIÓ DESDE EL TELÉFONO =====
  // Después de la verificación inicial, si no hay voucher, hacemos polling
  // cada 5 segundos para detectar si alguien escaneó el QR y subió desde el móvil.
  useEffect(() => {
    if (isChecking || alreadyUploaded || !id) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/voucher-status?id=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.voucherSubido) {
          setAlreadyUploaded(true);
          setExistingVoucherUrl(data.voucherUrl || null);
          clearInterval(pollInterval);
        }
      } catch {
        // Silencioso: si falla el poll, reintentamos en la siguiente iteración
      }
    }, 5000); // Cada 5 segundos

    return () => clearInterval(pollInterval);
  }, [isChecking, alreadyUploaded, id]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Archivo no válido",
        description: "Solo se permiten imágenes (JPG, PNG, WebP).",
      });
      return;
    }

    // Validar tamaño máximo (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: "La imagen no debe superar los 10 MB.",
      });
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Generar preview
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !id) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("id", id);
      formData.append("fila", fila);
      formData.append("sheet", sheet);
      formData.append("imagen", selectedFile);

      const response = await fetch("/api/upload-voucher", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Si el error es por duplicado, mostrar mensaje específico
        if (data.yaSubido) {
          setAlreadyUploaded(true);
          setExistingVoucherUrl(data.voucherUrl || null);
          toast({
            title: "Voucher ya subido",
            description: "Este vale ya tiene un comprobante bancario registrado.",
          });
          return;
        }
        throw new Error(data.error || "Error al subir la imagen");
      }

      setUploadedUrl(data.url);
      setIsSuccess(true);
      toast({
        title: "¡Voucher subido!",
        description: "La imagen se ha guardado correctamente.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
      toast({
        variant: "destructive",
        title: "Error al subir",
        description: message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCameraCapture = () => {
    // Abrir selector de archivo con captura de cámara
    const input = fileInputRef.current;
    if (input) {
      input.setAttribute("capture", "environment");
      input.click();
      // Limpiar capture para permitir galería en siguientes clicks
      setTimeout(() => input.removeAttribute("capture"), 100);
    }
  };

  const handleGalleryOpen = () => {
    const input = fileInputRef.current;
    if (input) {
      input.removeAttribute("capture");
      input.click();
    }
  };

  // ===== PANTALLA: VERIFICANDO ESTADO =====
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground font-headline">Verificando estado del vale...</p>
        </div>
      </div>
    );
  }

  // ===== PANTALLA: VOUCHER YA SUBIDO =====
  // En vez de solo mostrar "ya subido", mostramos el voucher con opción
  // de verlo en grande o ir al panel de administración.
  if (alreadyUploaded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-yellow-100">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl border-amber-200">
          <CardContent className="space-y-6">
            <ImageUp className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="text-2xl font-bold font-headline text-amber-900">
              Voucher ya registrado
            </h2>
            <p className="text-muted-foreground text-sm">
              Este vale ya tiene un comprobante bancario subido anteriormente.
            </p>
            {existingVoucherUrl && (
              <div
                className="bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => window.open(existingVoucherUrl!, "_blank")}
              >
                <img
                  src={existingVoucherUrl}
                  alt="Voucher existente"
                  className="rounded-lg max-h-56 mx-auto object-cover"
                />
                <p className="text-[10px] text-muted-foreground mt-2">
                  Clic para ver en tamaño completo
                </p>
              </div>
            )}
            <div className="bg-zinc-50 rounded-xl border p-4 space-y-2 text-left">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Datos del Registro
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {dp && (
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">DP:</span>
                    <span className="font-bold text-primary">{dp}</span>
                  </div>
                )}
                {fecha && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Fecha:</span>
                    <span className="font-bold text-primary">{fecha}</span>
                  </div>
                )}
                {cantidad && (
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Cantidad:</span>
                    <span className="font-bold text-primary">{cantidad}</span>
                  </div>
                )}
                {banco && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Banco:</span>
                    <span className="font-bold text-primary truncate">{banco}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-12"
                variant="default"
                onClick={() => existingVoucherUrl && window.open(existingVoucherUrl, "_blank")}
              >
                <Eye className="w-4 h-4 mr-2" />
                Ver Voucher
              </Button>
              <Button
                className="flex-1 h-12"
                variant="outline"
                onClick={() => window.close()}
              >
                Cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== PANTALLA: SUBIDA EXITOSA =====
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-50 to-emerald-100">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl border-green-200">
          <CardContent className="space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold font-headline text-green-900">
              ¡Voucher Subido!
            </h2>
            <p className="text-muted-foreground">
              La imagen del comprobante se ha guardado correctamente.
            </p>
            {uploadedUrl && (
              <div className="bg-zinc-50 rounded-xl border p-4">
                <img
                  src={uploadedUrl}
                  alt="Voucher subido"
                  className="rounded-lg max-h-48 mx-auto object-cover"
                />
              </div>
            )}
            <Button
              className="w-full h-12"
              variant="outline"
              onClick={() => window.close()}
            >
              Cerrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <FileImage className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-headline text-primary">
            Subir Voucher
          </CardTitle>
          <CardDescription>
            Adjunta la imagen del comprobante bancario
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Datos del registro */}
          <div className="bg-zinc-50 rounded-xl border p-4 space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
              Datos del Registro
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {dp && (
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">DP:</span>
                  <span className="font-bold text-primary">{dp}</span>
                </div>
              )}
              {fecha && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Fecha:</span>
                  <span className="font-bold text-primary">{fecha}</span>
                </div>
              )}
              {cantidad && (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Cantidad:</span>
                  <span className="font-bold text-primary">{cantidad}</span>
                </div>
              )}
              {banco && (
                <div className="flex items-center gap-1.5 col-span-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Banco:</span>
                  <span className="font-bold text-primary truncate">{banco}</span>
                </div>
              )}
            </div>
            {id && (
              <p className="text-[10px] text-muted-foreground truncate pt-1 border-t">
                ID: {id}
              </p>
            )}
          </div>

          {/* QR para subir desde el teléfono */}
          {!showQr ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full h-10 text-[11px] text-muted-foreground hover:text-primary border border-dashed"
              onClick={handleShowQr}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Mostrar QR para subir desde el teléfono
            </Button>
          ) : (
            <div className="bg-white rounded-xl border-2 border-dashed border-primary/30 p-4 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <QrCode className="w-4 h-4 text-primary" />
                <span className="font-bold">Escanea con tu teléfono para abrir este link</span>
              </div>
              {qrImageUrl && (
                <img
                  src={qrImageUrl}
                  alt="QR para subir voucher desde el teléfono"
                  className="w-40 h-40 mx-auto rounded-lg border"
                />
              )}
              <p className="text-[9px] text-muted-foreground leading-tight">
                Apunta la cámara de tu teléfono al código QR para abrir esta misma página y subir la foto del comprobante.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-muted-foreground"
                onClick={() => setShowQr(false)}
              >
                Ocultar QR
              </Button>
            </div>
          )}

          {/* Input de archivo oculto */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Preview de la imagen seleccionada */}
          {previewUrl && (
            <div className="rounded-xl border overflow-hidden bg-zinc-100">
              <img
                src={previewUrl}
                alt="Vista previa"
                className="w-full max-h-56 object-contain"
              />
            </div>
          )}

          {/* Botones de selección */}
          {!selectedFile ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed"
                onClick={handleCameraCapture}
              >
                <Camera className="w-8 h-8 text-primary" />
                <span className="text-xs font-bold">Cámara</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed"
                onClick={handleGalleryOpen}
              >
                <Upload className="w-8 h-8 text-primary" />
                <span className="text-xs font-bold">Galería</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setError(null);
                }}
              >
                Cambiar imagen
              </Button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Botón de subir */}
          <Button
            className="w-full h-12 text-base font-bold"
            disabled={!selectedFile || isUploading || !id}
            onClick={handleUpload}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Subir Voucher
              </>
            )}
          </Button>

          {!id && (
            <p className="text-xs text-amber-600 text-center">
              Faltan parámetros en la URL (id requerido).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubirVoucherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <SubirVoucherContent />
    </Suspense>
  );
}
