import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  History,
  LogOut,
  Trophy,
  Network,
  CalendarDays,
  Medal,
  Library,
  LayoutGrid,
  Users,
  UserRound,
  Package,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { SportSpaceSwitcher } from "@/components/app/sport-space-switcher";
import { Button } from "@/components/ui/button";


const NAV = [
  { to: "/app", label: "Resumen", icon: LayoutGrid, exact: true },
  { to: "/app/deportes", label: "Deportes", icon: Trophy, exact: false },
  { to: "/app/organizacion", label: "Organización", icon: Network, exact: false },
  { to: "/app/temporadas", label: "Temporadas", icon: CalendarDays, exact: false },
  { to: "/app/competiciones", label: "Competiciones", icon: Medal, exact: false },
  { to: "/app/equipos", label: "Equipos", icon: Users, exact: false },
  { to: "/app/jugadores", label: "Jugadores", icon: UserRound, exact: false },
  { to: "/app/catalogos", label: "Catálogos", icon: Library, exact: false },
  { to: "/app/packs", label: "Starter Packs", icon: Package, exact: false },
  { to: "/app/trazabilidad", label: "Trazabilidad", icon: History, exact: false },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
      <aside className="border-b border-border bg-card md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-4 md:block">
          <div>
            <p className="text-sm font-semibold tracking-tight">Nevermine Coach</p>
            <p className="text-xs text-muted-foreground">Configuración del dominio</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="md:hidden"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        <SportSpaceSwitcher />



        <nav aria-label="Navegación principal" className="px-2 pb-3">
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.map((item) => (
              <li key={item.to} className="shrink-0 md:shrink">
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:font-medium data-[status=active]:text-accent-foreground"
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden px-2 pb-4 md:block">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="size-4" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
