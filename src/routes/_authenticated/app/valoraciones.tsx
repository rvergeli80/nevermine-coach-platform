import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { getObservationSetup, listValuations } from "@/lib/observation.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/valoraciones")({
  head: () => ({
    meta: [
      { title: "Valoraciones | Nevermine Coach" },
      {
        name: "description",
        content:
          "Consulta el histórico inmutable de valoraciones calculadas por jugador y equipo, con su desglose y pesos congelados.",
      },
      { property: "og:title", content: "Valoraciones | Nevermine Coach" },
      {
        property: "og:description",
        content: "Histórico inmutable de valoraciones con desglose y pesos congelados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ValuationsPage,
});

function ValuationsPage() {
  const fetchValuations = useServerFn(listValuations);
  const fetchSetup = useServerFn(getObservationSetup);
  const [includeSuperseded, setIncludeSuperseded] = useState(false);
  const [seasonId, setSeasonId] = useState<string>("");

  const setup = useQuery({ queryKey: ["observation-setup"], queryFn: () => fetchSetup({}) });
  const valuations = useQuery({
    queryKey: ["valuations", seasonId, includeSuperseded],
    queryFn: () =>
      fetchValuations({ data: { seasonId: seasonId || null, includeSuperseded } }),
  });

  const names = new Map<string, string>();
  for (const player of setup.data?.players ?? []) names.set(player.id, player.full_name);
  for (const team of setup.data?.teams ?? []) names.set(team.id, team.name);

  const rows = valuations.data ?? [];

  return (
    <>
      <PageHeader
        title="Valoraciones"
        description="Cada cálculo queda sellado con su versión de catálogo y su snapshot de pesos: nunca se recalcula."
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <select
          aria-label="Temporada"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          className="h-10 min-w-52 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todas las temporadas</option>
          {(setup.data?.seasons ?? []).map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Switch
            id="superseded"
            checked={includeSuperseded}
            onCheckedChange={setIncludeSuperseded}
          />
          <Label htmlFor="superseded">Incluir reemplazadas</Label>
        </div>
      </div>

      <QueryState
        isLoading={valuations.isLoading}
        error={valuations.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no se ha calculado ninguna valoración."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sujeto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Puntuación</TableHead>
                <TableHead>Algoritmo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Calculada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {names.get(row.subject_id) ?? row.subject_id}
                  </TableCell>
                  <TableCell>{row.subject_type === "team" ? "Equipo" : "Jugador"}</TableCell>
                  <TableCell className="text-right">{Number(row.score).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.algorithm}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "current" ? "secondary" : "outline"}>
                      {row.status === "current" ? "Vigente" : "Reemplazada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.calculated_at).toLocaleString("es-ES", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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
