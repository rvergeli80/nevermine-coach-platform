import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/identity.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app")({
  component: WorkspacePage,
});

/**
 * Pantalla técnica temporal de la Fase 0.
 * Sirve únicamente para validar sesión, identidad y acceso a datos.
 */
function WorkspacePage() {
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const { data, isLoading, error } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => fetchCurrentUser({}),
  });

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nevermine Coach</h1>
          <p className="text-sm text-muted-foreground">
            Fase 0 — base técnica. Sin funcionalidad de negocio todavía.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Cerrar sesión
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sesión</CardTitle>
          <CardDescription>Identidad y roles del usuario autenticado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoading ? <p className="text-muted-foreground">Cargando…</p> : null}
          {error ? <p className="text-destructive">No se ha podido cargar la identidad.</p> : null}
          {data ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
              <dt className="text-muted-foreground">Usuario</dt>
              <dd>{data.profile.fullName ?? "—"}</dd>
              <dt className="text-muted-foreground">Correo</dt>
              <dd>{data.profile.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Roles</dt>
              <dd>{data.roles.join(", ") || "—"}</dd>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-8 text-sm text-muted-foreground">
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </p>
    </main>
  );
}
