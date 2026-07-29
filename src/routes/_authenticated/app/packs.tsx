import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { applyStarterPack, listStarterPacks } from "@/lib/starter-packs.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/packs")({
  head: () => ({
    meta: [
      { title: "Starter Packs | Nevermine Coach" },
      {
        name: "description",
        content:
          "Instala catálogos de métricas listos para usar: grupos, métricas, fórmulas y pesos configurados por deporte.",
      },
      { property: "og:title", content: "Starter Packs | Nevermine Coach" },
      {
        property: "og:description",
        content: "Arranca tu catálogo de métricas con una configuración validada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StarterPacksPage,
});

function StarterPacksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPacks = useServerFn(listStarterPacks);
  const apply = useServerFn(applyStarterPack);

  const packs = useQuery({ queryKey: ["starter-packs"], queryFn: () => fetchPacks({ data: {} }) });

  const mutation = useMutation({
    mutationFn: (input: { packId: string; force?: boolean }) => apply({ data: input }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      await queryClient.invalidateQueries({ queryKey: ["sports"] });
      await queryClient.invalidateQueries({ queryKey: ["starter-packs"] });

      if (result.action === "noop") {
        toast.info("Nada que instalar", { description: result.message });
        return;
      }

      toast.success(
        result.action === "update" ? "Starter Pack actualizado" : "Starter Pack aplicado",
        {
          description: `${result.metrics} métricas y ${result.formulas} fórmulas en un borrador listo para revisar.`,
        },
      );
      if (result.catalogId) {
        navigate({ to: "/app/catalogos/$catalogId", params: { catalogId: result.catalogId } });
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "No se ha podido aplicar el pack"),
  });

  return (
    <>
      <PageHeader
        title="Starter Packs"
        description="Catálogo oficial de configuración por deporte: grupos, métricas, fórmulas y pesos. Todo se instala en borrador para que lo revises antes de publicar."
      />

      <QueryState
        isLoading={packs.isLoading}
        error={packs.error}
        isEmpty={(packs.data?.length ?? 0) === 0}
        emptyText="Todavía no hay packs disponibles."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {packs.data?.map((pack) => (
            <Card key={pack.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-muted-foreground" aria-hidden />
                    <CardTitle className="text-base">{pack.name}</CardTitle>
                  </div>
                  <Badge variant="secondary">{pack.sportName}</Badge>
                </div>
                <CardDescription>{pack.summary}</CardDescription>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Badge variant="outline">v{pack.latestVersion}</Badge>
                  <span>{pack.author}</span>
                  <LifecycleBadge state={pack.lifecycleState} />
                  <StateBadge
                    state={pack.state}
                    installedVersion={pack.installedVersion}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Grupos" value={pack.groupCount} />
                  <Stat label="Perfiles" value={pack.profileCount} />
                  <Stat label="Métricas primarias" value={pack.primaryCount} />
                  <Stat label="Métricas derivadas" value={pack.derivedCount} />
                </dl>
                {!pack.distributable && (
                  <p className="text-xs text-muted-foreground">
                    Este paquete todavía no está publicado, por lo que no puede instalarse.
                  </p>
                )}
                <Button
                  onClick={() =>
                    mutation.mutate({
                      packId: pack.id,
                      force: pack.state === "installed",
                    })
                  }
                  disabled={mutation.isPending || !pack.distributable}
                  variant={pack.state === "installed" ? "outline" : "default"}
                  className="w-full"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {mutation.isPending
                    ? "Aplicando…"
                    : pack.state === "outdated"
                      ? `Actualizar a v${pack.latestVersion}`
                      : pack.state === "installed"
                        ? "Reinstalar"
                        : "Instalar pack"}
                </Button>

              </CardContent>
            </Card>
          ))}
        </div>
      </QueryState>
    </>
  );
}

const LIFECYCLE_LABELS: Record<string, string> = {
  draft: "Borrador",
  review: "En revisión",
  certified: "Certificado",
  published: "Publicado",
  deprecated: "Obsoleto",
  archived: "Archivado",
};

/** Estado del ciclo de vida de distribución del paquete (FEATURE-003.3). */
function LifecycleBadge({ state }: { state: string }) {
  return (
    <Badge variant={state === "published" ? "secondary" : "outline"}>
      {LIFECYCLE_LABELS[state] ?? state}
    </Badge>
  );
}

function StateBadge({
  state,
  installedVersion,
}: {
  state: string;
  installedVersion: string | null;
}) {
  if (state === "not_installed") return <Badge variant="outline">No instalado</Badge>;
  if (state === "outdated") {
    return <Badge variant="destructive">Actualización disponible (v{installedVersion})</Badge>;
  }
  if (state === "failed") return <Badge variant="destructive">Instalación fallida</Badge>;
  return <Badge>Instalado v{installedVersion}</Badge>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

