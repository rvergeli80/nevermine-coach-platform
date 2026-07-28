import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { listCompetitions, listSeasons } from "@/lib/config.functions";
import { listCatalogMetricRefs } from "@/lib/formulas.functions";
import {
  createValuationProfile,
  deleteWeight,
  listValuationProfiles,
  listWeights,
  updateValuationProfile,
  upsertWeight,
} from "@/lib/weights.functions";
import {
  checkWeight,
  scopeLabel,
  weightShares,
  type ProfileRef,
  type WeightMetricRef,
  type WeightRow,
} from "@/modules/config/weight-rules";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { QueryState } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface WeightVersionOption {
  id: string;
  version_number: number;
  status: string;
}

type WeightWithMetric = WeightRow & {
  profile_id: string;
  metrics: { code: string; name: string; nature: string; status: string } | null;
};

const GENERAL = "general";

export function WeightsPanel({
  catalogId,
  versions,
  versionsLoading,
}: {
  catalogId: string;
  versions: WeightVersionOption[];
  versionsLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchProfiles = useServerFn(listValuationProfiles);
  const fetchMetrics = useServerFn(listCatalogMetricRefs);
  const fetchWeights = useServerFn(listWeights);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchCompetitions = useServerFn(listCompetitions);
  const createProfile = useServerFn(createValuationProfile);
  const editProfile = useServerFn(updateValuationProfile);
  const saveWeight = useServerFn(upsertWeight);
  const removeWeight = useServerFn(deleteWeight);

  const defaultVersion =
    versions.find((version) => version.status === "draft")?.id ?? versions[0]?.id ?? "";
  const [selectedVersion, setSelectedVersion] = useState("");
  const versionId = selectedVersion || defaultVersion;
  const editable = versions.find((item) => item.id === versionId)?.status === "draft";

  const [selectedProfile, setSelectedProfile] = useState("");

  const profiles = useQuery({
    queryKey: ["valuation-profiles", catalogId],
    queryFn: () => fetchProfiles({ data: { catalogId } }),
  });
  const metrics = useQuery({
    queryKey: ["metric-refs", catalogId],
    queryFn: () => fetchMetrics({ data: { catalogId } }),
  });
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons() });
  const competitions = useQuery({
    queryKey: ["competitions"],
    queryFn: () => fetchCompetitions(),
  });

  const profileRows = (profiles.data ?? []) as (ProfileRef & { description: string | null })[];
  const profileId = selectedProfile || profileRows[0]?.id || "";
  const profile = profileRows.find((item) => item.id === profileId);

  const weights = useQuery({
    queryKey: ["weights", versionId, profileId],
    queryFn: () => fetchWeights({ data: { versionId, profileId } }),
    enabled: Boolean(versionId && profileId),
  });

  const metricRows = (metrics.data ?? []) as WeightMetricRef[];
  const weightRows = (weights.data ?? []) as WeightWithMetric[];
  const seasonNames = new Map(
    ((seasons.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );
  const competitionNames = new Map(
    ((competitions.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const shares = weightShares(weightRows);

  // Formulario de peso
  const [weightOpen, setWeightOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [metricId, setMetricId] = useState("");
  const [weightValue, setWeightValue] = useState("1");
  const [sign, setSign] = useState<"1" | "-1">("1");
  const [scope, setScope] = useState<string>(GENERAL);

  // Formulario de perfil
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState<
    (ProfileRef & { description: string | null }) | null
  >(null);
  const [profileCode, setProfileCode] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");

  const scopeIds = useMemo(() => {
    if (scope === GENERAL) return { seasonId: null, competitionId: null };
    const [kind, id] = scope.split(":");
    return kind === "season"
      ? { seasonId: id, competitionId: null }
      : { seasonId: null, competitionId: id };
  }, [scope]);

  const liveIssues = useMemo(() => {
    if (!metricId) return [];
    return checkWeight({
      metricId,
      weight: Number(weightValue),
      sign: Number(sign),
      seasonId: scopeIds.seasonId,
      competitionId: scopeIds.competitionId,
      metrics: metricRows,
      existing: weightRows,
      currentId: editingId,
    });
  }, [metricId, weightValue, sign, scopeIds, metricRows, weightRows, editingId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["weights", versionId, profileId] });
  };

  const weightMutation = useMutation({
    mutationFn: () =>
      saveWeight({
        data: {
          id: editingId,
          versionId,
          profileId,
          metricId,
          weight: Number(weightValue),
          sign: Number(sign) as 1 | -1,
          seasonId: scopeIds.seasonId,
          competitionId: scopeIds.competitionId,
        },
      }),
    onSuccess: () => {
      toast.success("Peso guardado");
      setWeightOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeWeight({ data: { id } }),
    onSuccess: () => {
      toast.success("Peso eliminado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const profileMutation = useMutation({
    mutationFn: () =>
      profileEditing
        ? editProfile({
            data: {
              id: profileEditing.id,
              name: profileName,
              description: profileDescription || null,
              status: profileEditing.status as "active" | "inactive" | "archived",
            },
          })
        : createProfile({
            data: {
              catalogId,
              code: profileCode,
              name: profileName,
              description: profileDescription || null,
            },
          }),
    onSuccess: () => {
      toast.success(profileEditing ? "Perfil actualizado" : "Perfil creado");
      setProfileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["valuation-profiles", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openWeight(row?: WeightWithMetric) {
    setEditingId(row?.id ?? null);
    setMetricId(row?.metric_id ?? "");
    setWeightValue(row ? String(row.weight) : "1");
    setSign(row && row.sign === -1 ? "-1" : "1");
    setScope(
      row?.competition_id
        ? `competition:${row.competition_id}`
        : row?.season_id
          ? `season:${row.season_id}`
          : GENERAL,
    );
    setWeightOpen(true);
  }

  function openProfile(row?: ProfileRef & { description: string | null }) {
    setProfileEditing(row ?? null);
    setProfileCode("");
    setProfileName(row?.name ?? "");
    setProfileDescription(row?.description ?? "");
    setProfileOpen(true);
  }

  if (!versionsLoading && versions.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Crea primero un borrador de versión: los pesos se congelan con la versión del catálogo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={versionId} onValueChange={setSelectedVersion}>
            <SelectTrigger aria-label="Versión">
              <SelectValue placeholder="Versión" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  v{item.version_number} · {item.status === "draft" ? "Borrador" : "Publicada"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {profileRows.length > 0 ? (
          <div className="w-56">
            <Select value={profileId} onValueChange={setSelectedProfile}>
              <SelectTrigger aria-label="Perfil">
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                {profileRows.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => openProfile()}>
            Nuevo perfil
          </Button>
          {profile ? (
            <Button variant="ghost" onClick={() => openProfile(profile)}>
              Editar perfil
            </Button>
          ) : null}
          <Button disabled={!editable || !profileId} onClick={() => openWeight()}>
            Nuevo peso
          </Button>
        </div>
      </div>

      {!editable ? (
        <p className="text-sm text-muted-foreground">
          Versión publicada: sus pesos son inmutables y sirven de histórico.
        </p>
      ) : null}

      {profileRows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Crea un perfil de valoración (por ejemplo, “Rendimiento general”) para repartir pesos.
        </p>
      ) : (
        <QueryState
          isLoading={weights.isLoading || metrics.isLoading}
          error={weights.error ?? metrics.error}
          isEmpty={weightRows.length === 0}
          emptyText="Este perfil todavía no tiene pesos en esta versión."
        >
          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Métrica</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead>Signo</TableHead>
                  <TableHead className="text-right">Contribución</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map(({ row, share }) => {
                  const item = row as WeightWithMetric;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        {item.metrics?.code ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {scopeLabel(item, seasonNames, competitionNames)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.weight}</TableCell>
                      <TableCell>
                        <Badge variant={item.sign === -1 ? "destructive" : "secondary"}>
                          {item.sign === -1 ? "Resta" : "Suma"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {share.toFixed(1)}%
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!editable}
                          onClick={() => openWeight(item)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!editable || deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </QueryState>
      )}

      <FormDialog
        open={weightOpen}
        onOpenChange={setWeightOpen}
        title={editingId ? "Editar peso" : "Nuevo peso"}
        description="El peso es relativo: la contribución se calcula sobre el total de su ámbito."
        pending={weightMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (liveIssues.length > 0) return;
          weightMutation.mutate();
        }}
      >
        <Field label="Métrica" htmlFor="metricId">
          <Select value={metricId} onValueChange={setMetricId}>
            <SelectTrigger id="metricId">
              <SelectValue placeholder="Selecciona una métrica" />
            </SelectTrigger>
            <SelectContent>
              {metricRows
                .filter((metric) => metric.status === "active")
                .map((metric) => (
                  <SelectItem key={metric.id} value={metric.id}>
                    {metric.code} · {metric.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Peso" htmlFor="weight">
            <Input
              id="weight"
              type="number"
              min="0.01"
              step="0.01"
              value={weightValue}
              onChange={(event) => setWeightValue(event.target.value)}
              required
            />
          </Field>
          <Field label="Signo" htmlFor="sign">
            <Select value={sign} onValueChange={(value) => setSign(value as "1" | "-1")}>
              <SelectTrigger id="sign">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Suma a la valoración</SelectItem>
                <SelectItem value="-1">Resta de la valoración</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field
          label="Ámbito"
          htmlFor="scope"
          hint="Un peso de temporada o competición prevalece sobre el general."
        >
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger id="scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERAL}>General</SelectItem>
              {[...seasonNames].map(([id, name]) => (
                <SelectItem key={id} value={`season:${id}`}>
                  Temporada · {name}
                </SelectItem>
              ))}
              {[...competitionNames].map(([id, name]) => (
                <SelectItem key={id} value={`competition:${id}`}>
                  Competición · {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {liveIssues.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {liveIssues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
      </FormDialog>

      <FormDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title={profileEditing ? "Editar perfil" : "Nuevo perfil de valoración"}
        description="Un perfil agrupa los pesos con los que se calcula una valoración."
        pending={profileMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          profileMutation.mutate();
        }}
      >
        {profileEditing ? null : (
          <Field label="Código" htmlFor="profileCode" hint="Minúsculas, números y guion bajo.">
            <Input
              id="profileCode"
              value={profileCode}
              onChange={(event) => setProfileCode(event.target.value)}
              required
            />
          </Field>
        )}
        <Field label="Nombre" htmlFor="profileName">
          <Input
            id="profileName"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            required
          />
        </Field>
        <Field label="Descripción" htmlFor="profileDescription">
          <Textarea
            id="profileDescription"
            value={profileDescription}
            onChange={(event) => setProfileDescription(event.target.value)}
            rows={2}
          />
        </Field>
      </FormDialog>
    </div>
  );
}
