import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { History } from "lucide-react";

import { getTraceabilityReportFn, listStarterPacks } from "@/lib/starter-packs.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/trazabilidad")({
  head: () => ({
    meta: [
      { title: "Trazabilidad del conocimiento | Nevermine Coach" },
      {
        name: "description",
        content:
          "Historial inmutable de cada Starter Pack: creación, publicación, instalaciones, actualizaciones, fusiones y rollbacks.",
      },
      { property: "og:title", content: "Trazabilidad del conocimiento | Nevermine Coach" },
      {
        property: "og:description",
        content: "Reconstruye el estado exacto de tu configuración en cualquier instante.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraceabilityPage,
});

const RESULT_LABEL: Record<string, string> = {
  success: "Correcto",
  failed: "Fallido",
  skipped: "Omitido",
};

function TraceabilityPage() {
  const fetchPacks = useServerFn(listStarterPacks);
  const fetchReport = useServerFn(getTraceabilityReportFn);
  const [packId, setPackId] = useState<string | null>(null);

  const packs = useQuery({ queryKey: ["starter-packs"], queryFn: () => fetchPacks({ data: {} }) });
  const selected = packId ?? packs.data?.[0]?.id ?? null;

  const report = useQuery({
    queryKey: ["pack-traceability", selected],
    queryFn: () => fetchReport({ data: { packId: selected as string } }),
    enabled: Boolean(selected),
  });

  const state = report.data?.currentState;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trazabilidad"
        description="Historial completo e inmutable de cada paquete de conocimiento. Sólo lectura: aquí nada se modifica."
        icon={History}
      />

      <QueryState query={packs} emptyLabel="No hay paquetes en el catálogo.">
        <div className="flex flex-wrap gap-2">
          {(packs.data ?? []).map((pack) => (
            <Button
              key={pack.id}
              variant={pack.id === selected ? "default" : "outline"}
              size="sm"
              onClick={() => setPackId(pack.id)}
            >
              {pack.name}
            </Button>
          ))}
        </div>
      </QueryState>

      {report.isPending && selected ? (
        <p className="text-sm text-muted-foreground">Reconstruyendo el historial…</p>
      ) : null}

      {report.data ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Estado reconstruido</CardTitle>
              <CardDescription>
                Deducido reproduciendo {state?.appliedEvents ?? 0} eventos, sin snapshots.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Última versión" value={state?.latestVersion ?? "—"} />
              <Row label="Ciclo de vida" value={state?.lifecycleState ?? "—"} />
              <Row label="Confianza" value={state?.trustLevel ?? "—"} />
              <Row label="Certificado" value={state?.certified ? "Sí" : "No"} />
              <Row
                label="Versiones publicadas"
                value={state?.publishedVersions.join(", ") || "—"}
              />
              <Row
                label="Instalado en este espacio"
                value={Object.values(state?.installations ?? {})[0] ?? "No instalado"}
              />
              <Row label="Fusiones" value={state?.merges.join(", ") || "—"} />
              <Row label="Eventos totales" value={String(report.data.totalEvents)} />
              <Row label="Actores" value={report.data.actors.join(", ") || "—"} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Línea temporal</CardTitle>
              <CardDescription>
                Registro append-only: cada hecho queda sellado con su identificador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {report.data.timeline.map((entry) => {
                  const audit = report.data.auditTrail.find((a) => a.eventId === entry.eventId);
                  return (
                    <li key={entry.eventId} className="border-l-2 border-border pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{entry.eventType}</Badge>
                        {entry.version ? <Badge variant="outline">v{entry.version}</Badge> : null}
                        <Badge variant={entry.result === "failed" ? "destructive" : "outline"}>
                          {RESULT_LABEL[entry.result] ?? entry.result}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.timestamp).toLocaleString("es-ES")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{entry.summary}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.actor} · {entry.source}
                        {audit?.reason ? ` · ${audit.reason}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
