import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CaraSuciaSidebar } from "@/components/cara-sucia-sidebar";
import { getServerConfig } from "@/lib/config-server";
import { PinGate } from "@/components/PinGate";

export default async function CaraSuciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = getServerConfig();

  return (
    <PinGate>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <CaraSuciaSidebar config={config} />
          <main className="flex-1 flex flex-col overflow-hidden">
            <header className="h-14 border-b flex items-center px-4 bg-amber-50/50 backdrop-blur-sm sticky top-0 z-10 md:hidden">
              <SidebarTrigger />
              <span className="ml-4 font-headline font-bold text-amber-800">Cara Sucia · ValeDigit</span>
            </header>
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </PinGate>
  );
}
