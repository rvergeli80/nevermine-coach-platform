import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
      <Toaster position="top-right" />
    </AppShell>
  );
}
