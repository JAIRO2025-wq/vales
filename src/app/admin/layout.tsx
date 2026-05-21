import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { getServerConfig } from "@/lib/config-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leemos la configuración real del disco en cada carga del layout (lado del servidor)
  const config = getServerConfig();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar config={config} />
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
