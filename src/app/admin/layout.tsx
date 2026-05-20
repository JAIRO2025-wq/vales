import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { CONFIG } from "@/lib/config";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pasamos la configuración al Sidebar desde un Server Component
  // para asegurar que router.refresh() actualice la UI correctamente.
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar config={CONFIG} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 border-b flex items-center px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10 md:hidden">
            <SidebarTrigger />
            <span className="ml-4 font-headline font-bold text-primary">ValeDigit</span>
          </header>
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
