import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { listAuditTrail } from "@/lib/operations.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría operativa | Nevermine Coach" },
      {
        name: "description",
        content:
          "Registro inmutable de cada observación, métrica registrada y valoración calculada, con su SportSpace, equipo y jugador.",
      },
      { property: "og:title", content: "Auditoría operativa | Nevermine Coach" },
      {
        property: "og:description",
        content: "Quién registró qué, sobre qué jugador y en qué partido o entrenamiento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

type Filter = "all" | "observation_context" | "observation" | "metric_value" | "valuation";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "observation_context", label: "Sesiones" },
  { value: "observation", label: "Observaciones" },
  { value: "metric_value", label: "Métricas" },
  { value: "valuation", label: "Valoraciones" },
];

const ENTITY_LABEL: Record<string, string> = {
  observation_context: "Sesión",
  observation: "Observación",
  metric_value: "Métrica",
  valuation: "Valoración",
};

const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

type AuditEntry = Awaited<ReturnType<typeof listAuditTrail>>[number];

function detailOf(entry: AuditEntry): string {
  const detail = entry.detail ?? {};
  if (entry.entityType === "metric_value") {
    const code = detail.metricCode ?? "";
    const value = detail.value;
    return `${code}${code ? " = " : ""}${value === null || value === undefined ? "—" : String(value)}`;
  }
  if (entry.entityType === "valuation") {
    if (detail.skipped) return String(detail.skipped);
    return detail.score === undefined ? "—" : `Score ${Number(detail.score).toFixed(2)}`;
  }
  if (entry.entityType === "observation") {
    const metrics = detail.metrics ?? [];
    return `${metrics.length} métrica${metrics.length === 1 ? "" : "s"} registradas`;
  }
  const occurred = detail.occurredAt;
  return occurred ? dateTime(occurred) : "—";
}

function AuditPage() {
  const fetchAudit = useServerFn(listAuditTrail);
  const [filter, setFilter] = useState<Filter>("all");

  const audit = useQuery({
    queryKey: ["ops-audit", filter],
    queryFn: () =>
      fetchAudit({ data: filter === "all" ? {} : { entityType: filter } }),
  });

  return (
    <>
      <PageHeader
        title="Auditoría operativa"
        description="Cada observación, métrica registrada y valoración calculada del SportSpace activo, con su equipo y jugador."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <QueryState
        isLoading={audit.isLoading}
        error={audit.error}
        isEmpty={(audit.data ?? []).length === 0}
        emptyText="Todavía no hay actividad operativa registrada en este SportSpace."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Sesión</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(audit.data ?? []).map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell>{entry.sessionLabel ?? "—"}</TableCell>
                  <TableCell>{entry.teamName ?? "—"}</TableCell>
                  <TableCell>{entry.playerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {detailOf(entry)}
                    {entry.reason ? (
                      <span className="block text-xs">Motivo: {entry.reason}</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryState>
    </>
  );
}
