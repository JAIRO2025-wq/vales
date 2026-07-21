"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen, Folder, File, FileText, Image, Download, Trash2, Eye,
  ArrowLeft, Home, RefreshCw, Shield, LogOut, Database, Server,
  HardDrive, Calendar, Search, AlertTriangle, X, Loader2,
} from "lucide-react";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  path: string;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
  created: string | null;
  mimeType: string;
  previewable: boolean;
}

interface PreviewData {
  type: "text" | "image" | "unsupported";
  content?: string;
  truncated?: boolean;
  totalSize?: number;
  lines?: number;
  message?: string;
}

const ROOT_OPTIONS = [
  { key: "sistema", label: "Sistema (src/data)", icon: Database },
  { key: "servidor", label: "Servidor Python", icon: Server },
];

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-SV", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  const imgExts = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
  if (imgExts.includes(ext || "")) return <Image className="w-4 h-4" />;
  if (ext === "pdf") return <FileText className="w-4 h-4" />;
  if (ext === "json") return <FileText className="w-4 h-4 text-yellow-400" />;
  if (ext === "csv") return <FileText className="w-4 h-4 text-green-400" />;
  if (ext === "py") return <FileText className="w-4 h-4 text-blue-400" />;
  if (ext === "ts" || ext === "tsx") return <FileText className="w-4 h-4 text-cyan-400" />;
  if (ext === "js" || ext === "mjs") return <FileText className="w-4 h-4 text-yellow-300" />;
  if (ext === "hash") return <FileText className="w-4 h-4 text-slate-500" />;
  return <File className="w-4 h-4" />;
}

export default function ExploradorPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [root, setRoot] = useState("sistema");
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  // Preview / Info
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; path: string; isDir: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  // Verificar autorización
  useEffect(() => {
    fetch("/api/super-admin/login")
      .then(r => r.json())
      .then(data => {
        setAuthorized(data.valid);
        if (!data.valid) router.replace("/super-admin");
      })
      .catch(() => {
        setAuthorized(false);
        router.replace("/super-admin");
      });
  }, [router]);

  // Cargar archivos
  const loadFiles = useCallback(async (r: string, p: string) => {
    setLoading(true);
    setSelectedFile(null);
    setFileInfo(null);
    setPreviewData(null);
    try {
      const res = await fetch(`/api/super-admin/files?root=${r}&path=${encodeURIComponent(p)}`);
      if (res.status === 401) {
        router.replace("/super-admin");
        return;
      }
      const data = await res.json();
      if (data.error) {
        toast({ variant: "destructive", title: "Error", description: data.error });
      } else {
        setEntries(data.entries || []);
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo listar el directorio." });
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    if (authorized) loadFiles(root, currentPath);
  }, [authorized, root, currentPath, loadFiles]);

  // Navegación
  const navigateTo = (entry: FileEntry) => {
    if (entry.type === "directory") {
      setCurrentPath(entry.path);
    } else {
      openFile(entry.path);
    }
  };

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const openFile = async (filePath: string) => {
    setPreviewLoading(true);
    setSelectedFile(filePath);
    setFileInfo(null);
    setPreviewData(null);

    try {
      // Cargar info
      const infoRes = await fetch(`/api/super-admin/file?root=${root}&path=${encodeURIComponent(filePath)}&action=info`);
      if (infoRes.ok) {
        setFileInfo(await infoRes.json());
      }

      // Cargar preview
      const prevRes = await fetch(`/api/super-admin/file?root=${root}&path=${encodeURIComponent(filePath)}&action=preview`);
      if (prevRes.ok) {
        const ct = prevRes.headers.get("content-type") || "";
        if (ct.startsWith("image/")) {
          setPreviewData({ type: "image" });
        } else {
          setPreviewData(await prevRes.json());
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el archivo." });
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async (filePath: string) => {
    const res = await fetch(`/api/super-admin/file?root=${root}&path=${encodeURIComponent(filePath)}&action=download`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "archivo";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirm !== "ELIMINAR") return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/super-admin/file?root=${root}&path=${encodeURIComponent(deleteTarget.path)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        toast({ title: "Eliminado", description: `"${deleteTarget.name}" fue eliminado permanentemente.` });
        setDeleteTarget(null);
        setDeleteConfirm("");
        loadFiles(root, currentPath);
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar." });
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    // Eliminar cookie estableciendo expiración pasada
    document.cookie = "sa_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/super-admin");
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!authorized) return null;

  // Breadcrumb
  const pathParts = currentPath ? currentPath.split("/") : [];
  const rootLabel = ROOT_OPTIONS.find(r => r.key === root)?.label || root;

  // Filtrar entradas
  const filteredEntries = filter
    ? entries.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-500" />
          <h1 className="text-sm font-bold text-white tracking-wide">CENTRO DE CARGA · SUPER ADMIN</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-400 hover:text-red-400 hover:bg-red-950/30"
          >
            <LogOut className="w-4 h-4 mr-1" />
            Salir
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-3 flex flex-col gap-3 shrink-0 overflow-y-auto">
          {/* Root selector */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider px-1">Explorar</p>
            {ROOT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setRoot(opt.key); setCurrentPath(""); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                    root === opt.key
                      ? "bg-amber-500/20 text-amber-300 font-medium"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Current path info */}
          <div className="text-[10px] text-slate-600 px-1 space-y-1">
            <p className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{rootLabel}</p>
            <p className="flex items-center gap-1"><FolderOpen className="w-3 h-3" />/{currentPath || "raíz"}</p>
          </div>

          {/* Quick nav */}
          <div className="space-y-1">
            <button
              onClick={() => setCurrentPath("")}
              className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            >
              <Home className="w-3.5 h-3.5" /> Raíz
            </button>
            {currentPath && (
              <button
                onClick={goUp}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Subir un nivel
              </button>
            )}
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider px-1 mb-2">
              Contenido {loading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
            </p>
            {filteredEntries.length === 0 && !loading && (
              <p className="text-xs text-slate-600 px-1">Vacío</p>
            )}
            {filteredEntries.map(entry => (
              <button
                key={entry.path}
                onClick={() => navigateTo(entry)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors text-left truncate"
                title={entry.name}
              >
                {entry.type === "directory" ? (
                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                ) : (
                  getFileIcon(entry.name)
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b border-slate-800 px-4 py-2 flex items-center gap-3 shrink-0 bg-slate-900/30">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <button onClick={() => setCurrentPath("")} className="hover:text-amber-400 transition-colors">
                <Home className="w-3.5 h-3.5" />
              </button>
              <span>/</span>
              {pathParts.map((part, i) => (
                <React.Fragment key={i}>
                  <button
                    onClick={() => setCurrentPath(pathParts.slice(0, i + 1).join("/"))}
                    className="hover:text-amber-400 transition-colors"
                  >
                    {part}
                  </button>
                  {i < pathParts.length - 1 && <span>/</span>}
                </React.Fragment>
              ))}
            </div>

            <div className="flex-1" />

            {/* Search & refresh */}
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <Input
                placeholder="Filtrar..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-7 h-7 text-xs bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadFiles(root, currentPath)}
              className="text-slate-400 hover:text-white"
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                <tr className="text-left text-slate-500">
                  <th className="py-2 px-4 font-medium">Nombre</th>
                  <th className="py-2 px-4 font-medium w-24">Tamaño</th>
                  <th className="py-2 px-4 font-medium w-44">Modificado</th>
                  <th className="py-2 px-4 font-medium w-32 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading && entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-600">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Cargando...
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-600">
                      <FolderOpen className="w-5 h-5 mx-auto mb-2" />
                      Directorio vacío
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map(entry => (
                    <tr
                      key={entry.path}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer ${
                        selectedFile === entry.path ? "bg-amber-500/10" : ""
                      }`}
                      onClick={() => navigateTo(entry)}
                    >
                      <td className="py-1.5 px-4 flex items-center gap-2">
                        {entry.type === "directory" ? (
                          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        ) : (
                          getFileIcon(entry.name)
                        )}
                        <span className="truncate">{entry.name}</span>
                      </td>
                      <td className="py-1.5 px-4 text-slate-500 font-mono">
                        {entry.type === "directory" ? "—" : formatSize(entry.size)}
                      </td>
                      <td className="py-1.5 px-4 text-slate-500 font-mono text-[11px]">
                        {formatDate(entry.modified)}
                      </td>
                      <td className="py-1.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        {entry.type === "file" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openFile(entry.path); }}
                              className="h-7 px-2 text-slate-400 hover:text-amber-400"
                              title="Ver"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); downloadFile(entry.path); }}
                              className="h-7 px-2 text-slate-400 hover:text-blue-400"
                              title="Descargar"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ name: entry.name, path: entry.path, isDir: false });
                                setDeleteConfirm("");
                              }}
                              className="h-7 px-2 text-slate-400 hover:text-red-400"
                              title="Eliminar permanentemente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                        {entry.type === "directory" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ name: entry.name, path: entry.path, isDir: true });
                                setDeleteConfirm("");
                              }}
                              className="h-7 px-2 text-slate-400 hover:text-red-400"
                              title="Eliminar directorio permanentemente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Preview Panel */}
          {selectedFile && (
            <div className="border-t border-slate-800 bg-slate-900/60 shrink-0" style={{ maxHeight: "40vh" }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-2 text-xs">
                  <File className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-white font-mono text-[11px]">{selectedFile.split("/").pop()}</span>
                  {fileInfo && (
                    <>
                      <Badge variant="outline" className="text-[10px] h-4">{formatSize(fileInfo.size)}</Badge>
                      <span className="text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(fileInfo.modified)}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(selectedFile)} className="h-6 text-xs text-slate-400 hover:text-blue-400">
                    <Download className="w-3 h-3 mr-1" />Descargar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)} className="h-6 text-xs text-slate-500 hover:text-white">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="overflow-auto p-3" style={{ maxHeight: "calc(40vh - 40px)" }}>
                {previewLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                  </div>
                ) : previewData?.type === "image" ? (
                  <div className="flex items-center justify-center">
                    <img
                      src={`/api/super-admin/file?root=${root}&path=${encodeURIComponent(selectedFile)}&action=preview`}
                      alt={selectedFile}
                      className="max-w-full max-h-[35vh] object-contain rounded border border-slate-700"
                    />
                  </div>
                ) : previewData?.type === "text" ? (
                  <div>
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-950 rounded p-3 overflow-auto max-h-[35vh] border border-slate-800">
                      {previewData.content}
                    </pre>
                    {previewData.truncated && (
                      <p className="text-[10px] text-amber-500 mt-1 text-center">
                        Vista previa truncada a 500 KB. Tamaño total: {formatSize(previewData.totalSize)} ({previewData.lines} líneas)
                      </p>
                    )}
                  </div>
                ) : previewData?.type === "unsupported" ? (
                  <p className="text-xs text-slate-500 text-center py-8">{previewData.message}</p>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[450px] bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Eliminar permanentemente
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {deleteTarget?.isDir ? (
                <>Vas a eliminar el directorio <strong className="text-white">{deleteTarget?.name}</strong> y <strong className="text-red-400">todo su contenido</strong>.</>
              ) : (
                <>Vas a eliminar el archivo <strong className="text-white">{deleteTarget?.name}</strong>.</>
              )}
              {" "}Esta acción <strong className="text-red-400">NO</strong> se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs text-slate-500">
              Escribí <strong className="text-red-400">ELIMINAR</strong> para confirmar:
            </p>
            <Input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="ELIMINAR"
              className="bg-slate-800 border-slate-700 text-white font-bold"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-slate-700 text-slate-400">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirm !== "ELIMINAR" || deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Eliminar para siempre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
