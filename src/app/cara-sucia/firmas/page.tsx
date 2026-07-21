"use client";

import { FirmasAutorizadasCard } from "@/components/config/FirmasAutorizadasCard";

export default function FirmasCaraSuciaPage() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <h1 className="text-xl font-bold font-headline text-amber-800">
          Firmas Autorizadas · CARA SUCIA
        </h1>
      </div>
      <FirmasAutorizadasCard sucursalFilter="CARA SUCIA" />
    </div>
  );
}
