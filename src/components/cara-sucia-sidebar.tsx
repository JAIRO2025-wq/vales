"use client";

import * as React from "react";
import { 
  Building2, 
  LayoutDashboard, 
  Wallet, 
  Settings,
  LogOut,
  Receipt,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
} from "@/components/ui/sidebar";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { type AppConfig } from "@/lib/config";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface CaraSuciaSidebarProps {
  config: AppConfig;
}

export function CaraSuciaSidebar({ config }: CaraSuciaSidebarProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4 border-b bg-amber-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center text-white font-bold italic">
            CS
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-headline font-bold text-lg leading-tight">Cara Sucia</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Sub App · Ciclo Mensual</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/cara-sucia"} tooltip="Dashboard">
                <Link href="/cara-sucia">
                  <LayoutDashboard />
                  <span>Dashboard CARA SUCIA</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/cajas"} tooltip="Resumen Cajas">
                <Link href="/cajas">
                  <Wallet />
                  <span>Resumen de Cajas</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/cara-sucia/vouchers")} tooltip="Vouchers">
                <Link href="/cara-sucia/vouchers">
                  <Receipt />
                  <span>Vouchers Bancarios</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tipos de Caja</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {config.TIPOS_CAJA.map((caja) => (
                <SidebarMenuItem key={caja}>
                  <SidebarMenuButton asChild>
                    <Link href={`/cara-sucia?sucursal=CARA SUCIA&caja=${encodeURIComponent(caja)}`}>
                      <Building2 />
                      <span>{caja}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Enlaces</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="/admin" target="_blank">
                    <ExternalLink className="w-4 h-4" />
                    <span>Panel Principal</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-destructive hover:text-destructive">
              <LogOut />
              <span>Cerrar Sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
