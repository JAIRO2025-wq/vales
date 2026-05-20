"use client";

import React, { Suspense, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CONFIG } from "@/lib/config";
import { saveVoucherAction } from "@/app/actions/vouchers";
import { 
  Camera, 
  Upload, 
  CheckCircle2, 
  X,
  FileImage,
  AlertCircle,
  Loader2
} from "lucide-react";

function AdjuntarContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState(0);

  const voucherInfo = {
    fila: searchParams.get("fila") || "",
    sheet: searchParams.get("sheet") || "",
    id: searchParams.get("id") || "",
    numVale: searchParams.get("numVale") || "---",
    sucursal: searchParams.get("sucursal") || "---",
    fecha: searchParams.get("fecha") || "",
    entregado: searchParams.get("entregado") || "",
    monto: searchParams.get("monto") || "",
    rubro: searchParams.get("rubro") || "",
    concepto: searchParams.get("concepto") || "",
  };

  // Función para comprimir imagen usando Canvas API nativa
  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Limite de dimensiones para optimizar peso (Full HD aprox)
        const MAX_SIZE = 1600;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Comprimir a JPEG con calidad 0.7 (balance perfecto peso/calidad para documentos)
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedBase64);
        } else {
          resolve(base64);
        }
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 25 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Archivo demasiado pesado", description: "El límite inicial es 25MB." });
        return;
      }
      
      setIsCompressing(true);
      setFile(selectedFile);
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        if (selectedFile.type.startsWith('image/')) {
          const compressed = await compressImage(base64);
          setPreview(compressed);
        } else {
          setPreview(base64);
        }
        setIsCompressing(false);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !preview) return;
    
    setIsUploading(true);
    setProgress(20);
    
    try {
      // 1. Guardar localmente el estado del comprobante con la imagen optimizada
      await saveVoucherAction({
        ...voucherInfo,
        comprobanteUrl: preview,
        timestamp: new Date().toISOString()
      } as any);

      setProgress(50);

      // Generar link de consulta para Google
      const baseUrl = window.location.origin;
      const params = new URLSearchParams();
      params.set("fila", voucherInfo.fila);
      params.set("sheet", voucherInfo.sheet);
      params.set("id", voucherInfo.id);
      params.set("numVale", voucherInfo.numVale);
      params.set("entregado", voucherInfo.entregado);
      params.set("monto", voucherInfo.monto);
      params.set("sucursal", voucherInfo.sucursal);
      params.set("fecha", voucherInfo.fecha);
      params.set("rubro", voucherInfo.rubro);
      if (voucherInfo.concepto) params.set("concepto", voucherInfo.concepto);
      const viewLink = `${baseUrl}/vale?${params.toString()}`;

      // 2. Enviar a Google Apps Script (Avisar que ya hay comprobante)
      await fetch(CONFIG.API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fila: voucherInfo.fila,
          sheet: voucherInfo.sheet,
          id: voucherInfo.id,
          comprobante: preview, // Base64 para guardado en Drive
          comprobanteUrl: viewLink, // Link para la celda de Excel
          numVale: voucherInfo.numVale,
          metodo: "updateComprobante"
        }),
      });

      setProgress(100);
      setIsSuccess(true);
      toast({ title: "Enviado con éxito", description: "El comprobante ha sido sincronizado." });
      
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: "No se pudo sincronizar con Google." });
    } finally {
      setIsUploading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-emerald-50/30">
        <Card className="w-full max-w-md text-center py-10 shadow-2xl animate-in zoom-in duration-300">
          <CardContent className="space-y-6">
            <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto" />
            <h2 className="text-3xl font-bold font-headline text-emerald-800">¡Recibido!</h2>
            <p className="text-muted-foreground">El comprobante ha sido procesado, optimizado y vinculado al Vale #{voucherInfo.numVale}.</p>
            <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={() => window.close()}>Cerrar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center gap-6 max-w-lg mx-auto bg-emerald-50/20">
      <Card className="w-full shadow-2xl border-emerald-100">
        <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
          <div className="flex justify-between items-center">
            <CardTitle className="font-headline text-xl">Cargar Comprobante</CardTitle>
            <FileImage className="w-6 h-6 opacity-80" />
          </div>
          <CardDescription className="text-emerald-50">Vale #{voucherInfo.numVale} • {voucherInfo.sucursal}</CardDescription>
        </CardHeader>
        
        <CardContent className="pt-8 space-y-6">
          {!file ? (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-4 border-dashed border-emerald-200 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-emerald-50 transition-colors"
              >
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Camera className="w-10 h-10 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg text-emerald-900">Tomar Foto del Ticket</p>
                  <p className="text-xs text-muted-foreground">Admite fotos de alta resolución (Compresión automática)</p>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 aspect-[3/4] bg-muted flex items-center justify-center">
                {preview ? (
                  <img src={preview} alt="Vista previa" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                    <span className="text-xs font-bold uppercase">Optimizando imagen...</span>
                  </div>
                )}
                {(isCompressing || isUploading) && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white gap-2">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <span className="font-bold text-sm tracking-widest uppercase text-center px-4">
                      {isCompressing ? 'Reduciendo peso de imagen...' : 'Sincronizando con Flynet...'}
                    </span>
                  </div>
                )}
                {!isUploading && !isCompressing && (
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-2 right-2 rounded-full h-8 w-8"
                    onClick={() => { setFile(null); setPreview(null); }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {isUploading ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-emerald-800">
                    <span>ENVIANDO A LA NUBE...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-emerald-100" />
                </div>
              ) : (
                <Button 
                  onClick={handleUpload}
                  disabled={isCompressing || !preview}
                  className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                >
                  <Upload className="w-5 h-5 mr-2" /> {isCompressing ? 'Espere...' : 'Confirmar y Enviar'}
                </Button>
              )}
            </div>
          )}

          <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-lg border border-amber-100">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-[10px] text-amber-800 leading-tight">
              Sincronización Automática: Al enviar, se guardará la imagen en Drive y se actualizará la celda correspondiente en Google Sheets.
            </p>
          </div>
        </CardContent>
      </Card>
      
      <p className="text-[10px] text-muted-foreground text-center uppercase font-bold tracking-widest">
        Control de Gastos Flynet • Optimización de Datos v2.5
      </p>
    </div>
  );
}

export default function AdjuntarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-headline text-emerald-600 animate-pulse">Iniciando Cámara...</div>}>
      <AdjuntarContent />
    </Suspense>
  );
}