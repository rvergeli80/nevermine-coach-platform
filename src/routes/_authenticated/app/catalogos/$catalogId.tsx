import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  createGroup,
  createMetric,
  createVersion,
  getCatalog,
  listGroups,
  listMetrics,
  listVersions,
  publishVersion,
  updateMetric,
} from "@/lib/config.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { FormulasPanel } from "@/components/app/formulas-panel";
import { Field, FormDialog, StatusBadge } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/app/catalogos/$catalogId")({
  head: () => ({
    meta: [
      { title: "Detalle del catálogo | Nevermine Coach" },
      {
        name: "description",
        content: "Grupos, métricas y versiones publicadas de un catálogo de métricas.",
      },
      { property: "og:title", content: "Detalle del catálogo | Nevermine Coach" },
      { property: "og:description", content: "Grupos, métricas y versiones de un catálogo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogDetailPage,
});

type Catalog = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sports: { name: string } | null;
};
type Group = { id: string; code: string; name: string; sort_order: number; status: string };
type Metric = {
  id: string;
  code: string;
  name: string;
  nature: string;
  value_type: string;
  direction: string;
  scope: string;
  unit: string | null;
  status: string;
  group_id: string | null;
  short_description: string | null;
  technical_description: string | null;
  icon: string | null;
  color: string | null;
};
type Version = {
  id: string;
  version_number: number;
  status: string;
  change_reason: string | null;
  published_at: string | null;
  catalog_version_metrics: { count: number }[];
};

const NATURE = { primary: "Primaria", derived: "Derivada" } as const;
const VALUE_TYPE = {
  counter: "Contador",
  duration: "Duración",
  boolean: "Booleano",
  ratio: "Ratio",
  scale: "Escala",
} as const;
const DIRECTION = {
  higher_is_better: "Más es mejor",
  lower_is_better: "Menos es mejor",
  neutral: "Neutra",
} as const;
const SCOPE = { individual: "Individual", collective: "Colectivo" } as const;

function CatalogDetailPage() {
  const { catalogId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchCatalog = useServerFn(getCatalog);
  const fetchGroups = useServerFn(listGroups);
  const fetchMetrics = useServerFn(listMetrics);
  const fetchVersions = useServerFn(listVersions);
  const addGroup = useServerFn(createGroup);
  const addMetric = useServerFn(createMetric);
  const editMetric = useServerFn(updateMetric);
  const addVersion = useServerFn(createVersion);
  const publish = useServerFn(publishVersion);

  const [groupOpen, setGroupOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<Metric | null>(null);
  const [metricForm, setMetricForm] = useState({
    groupId: "none",
    nature: "primary",
    valueType: "counter",
    direction: "higher_is_better",
    scope: "individual",
    status: "active",
  });

  const catalog = useQuery({
    queryKey: ["catalog", catalogId],
    queryFn: () => fetchCatalog({ data: { catalogId } }),
  });
  const groups = useQuery({
    queryKey: ["groups", catalogId],
    queryFn: () => fetchGroups({ data: { catalogId } }),
  });
  const metrics = useQuery({
    queryKey: ["metrics", catalogId],
    queryFn: () => fetchMetrics({ data: { catalogId } }),
  });
  const versions = useQuery({
    queryKey: ["versions", catalogId],
    queryFn: () => fetchVersions({ data: { catalogId } }),
  });

  const catalogData = catalog.data as Catalog | null | undefined;
  const groupRows = (groups.data ?? []) as Group[];
  const metricRows = (metrics.data ?? []) as Metric[];
  const versionRows = (versions.data ?? []) as Version[];
  const draft = versionRows.find((version) => version.status === "draft");

  const groupMutation = useMutation({
    mutationFn: (form: FormData) =>
      addGroup({
        data: {
          catalogId,
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
          color: (form.get("color") as string) || null,
          icon: (form.get("icon") as string) || null,
          sortOrder: Number(form.get("sortOrder") ?? 0),
        },
      }),
    onSuccess: () => {
      toast.success("Grupo creado");
      setGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ["groups", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const metricMutation = useMutation({
    mutationFn: (form: FormData) => {
      const shared = {
        groupId: metricForm.groupId === "none" ? null : metricForm.groupId,
        name: String(form.get("name") ?? ""),
        nature: metricForm.nature as "primary" | "derived",
        valueType: metricForm.valueType as "counter" | "duration" | "boolean" | "ratio" | "scale",
        direction: metricForm.direction as
          | "higher_is_better"
          | "lower_is_better"
          | "neutral",
        scope: metricForm.scope as "individual" | "collective",
        unit: (form.get("unit") as string) || null,
        shortDescription: (form.get("shortDescription") as string) || null,
        technicalDescription: (form.get("technicalDescription") as string) || null,
        icon: (form.get("icon") as string) || null,
        color: (form.get("color") as string) || null,
      };
      if (editingMetric) {
        return editMetric({
          data: {
            ...shared,
            id: editingMetric.id,
            status: metricForm.status as "active" | "inactive" | "archived",
          },
        });
      }
      return addMetric({ data: { ...shared, catalogId, code: String(form.get("code") ?? "") } });
    },
    onSuccess: () => {
      toast.success(editingMetric ? "Métrica actualizada" : "Métrica creada");
      setMetricOpen(false);
      setEditingMetric(null);
      queryClient.invalidateQueries({ queryKey: ["metrics", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const versionMutation = useMutation({
    mutationFn: (form: FormData) =>
      addVersion({
        data: { catalogId, changeReason: (form.get("changeReason") as string) || null },
      }),
    onSuccess: () => {
      toast.success("Borrador de versión creado");
      setVersionOpen(false);
      queryClient.invalidateQueries({ queryKey: ["versions", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publishMutation = useMutation({
    mutationFn: (versionId: string) => publish({ data: { versionId } }),
    onSuccess: () => {
      toast.success("Versión publicada");
      queryClient.invalidateQueries({ queryKey: ["versions", catalogId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openMetricDialog(metric: Metric | null) {
    setEditingMetric(metric);
    setMetricForm({
      groupId: metric?.group_id ?? "none",
      nature: metric?.nature ?? "primary",
      valueType: metric?.value_type ?? "counter",
      direction: metric?.direction ?? "higher_is_better",
      scope: metric?.scope ?? "individual",
      status: metric?.status ?? "active",
    });
    setMetricOpen(true);
  }

  return (
    <>
      <Link
        to="/app/catalogos"
        className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Catálogos
      </Link>

      <PageHeader
        title={catalogData?.name ?? "Catálogo"}
        description={
          catalogData
            ? `${catalogData.code} · ${catalogData.sports?.name ?? "Sin deporte"}`
            : undefined
        }
      />

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="formulas">Fórmulas</TabsTrigger>
          <TabsTrigger value="versions">Versiones</TabsTrigger>

        </TabsList>

        <TabsContent value="metrics" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openMetricDialog(null)}>Nueva métrica</Button>
          </div>
          <QueryState
            isLoading={metrics.isLoading}
            error={metrics.error}
            isEmpty={metricRows.length === 0}
            emptyText="Este catálogo todavía no tiene métricas."
          >
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Naturaleza</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ámbito</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricRows.map((metric) => (
                    <TableRow key={metric.id}>
                      <TableCell className="font-mono text-xs">{metric.code}</TableCell>
                      <TableCell>{metric.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {NATURE[metric.nature as keyof typeof NATURE]}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {VALUE_TYPE[metric.value_type as keyof typeof VALUE_TYPE]}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {SCOPE[metric.scope as keyof typeof SCOPE]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={metric.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openMetricDialog(metric)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </QueryState>
        </TabsContent>

        <TabsContent value="groups" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setGroupOpen(true)}>Nuevo grupo</Button>
          </div>
          <QueryState
            isLoading={groups.isLoading}
            error={groups.error}
            isEmpty={groupRows.length === 0}
            emptyText="Este catálogo todavía no tiene grupos."
          >
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRows.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {group.sort_order}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{group.code}</TableCell>
                      <TableCell>{group.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={group.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </QueryState>
        </TabsContent>

        <TabsContent value="formulas" className="mt-4">
          <FormulasPanel
            catalogId={catalogId}
            versions={versionRows}
            versionsLoading={versions.isLoading}
          />
        </TabsContent>



        <TabsContent value="versions" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setVersionOpen(true)} disabled={Boolean(draft)}>
              Nuevo borrador
            </Button>
          </div>
          {draft ? (
            <p className="text-sm text-muted-foreground">
              Ya existe un borrador abierto (v{draft.version_number}). Publícalo antes de crear otro.
            </p>
          ) : null}
          <QueryState
            isLoading={versions.isLoading}
            error={versions.error}
            isEmpty={versionRows.length === 0}
            emptyText="Este catálogo todavía no tiene versiones."
          >
            <div className="rounded-md border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Versión</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Métricas</TableHead>
                    <TableHead>Publicada</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versionRows.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>v{version.version_number}</TableCell>
                      <TableCell>
                        <StatusBadge status={version.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {version.catalog_version_metrics?.[0]?.count ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {version.published_at
                          ? new Date(version.published_at).toLocaleDateString("es-ES")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {version.status === "draft" ? (
                          <Button
                            size="sm"
                            disabled={publishMutation.isPending}
                            onClick={() => publishMutation.mutate(version.id)}
                          >
                            Publicar
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </QueryState>
        </TabsContent>
      </Tabs>

      <FormDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        title="Nuevo grupo"
        description="Los grupos organizan visualmente las métricas del catálogo."
        pending={groupMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          groupMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Código" htmlFor="group-code">
          <Input id="group-code" name="code" required placeholder="finalizacion" />
        </Field>
        <Field label="Nombre" htmlFor="group-name">
          <Input id="group-name" name="name" required placeholder="Finalización" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Color" htmlFor="group-color">
            <Input id="group-color" name="color" placeholder="#2563eb" />
          </Field>
          <Field label="Icono" htmlFor="group-icon">
            <Input id="group-icon" name="icon" placeholder="target" />
          </Field>
          <Field label="Orden" htmlFor="group-order">
            <Input id="group-order" name="sortOrder" type="number" min={0} defaultValue={0} />
          </Field>
        </div>
      </FormDialog>

      <FormDialog
        open={metricOpen}
        onOpenChange={(next) => {
          setMetricOpen(next);
          if (!next) setEditingMetric(null);
        }}
        title={editingMetric ? "Editar métrica" : "Nueva métrica"}
        description="El código de una métrica es inmutable."
        pending={metricMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          metricMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        {editingMetric ? null : (
          <Field label="Código" htmlFor="metric-code">
            <Input id="metric-code" name="code" required placeholder="goles" />
          </Field>
        )}
        <Field label="Nombre" htmlFor="metric-name">
          <Input
            id="metric-name"
            name="name"
            required
            defaultValue={editingMetric?.name}
            placeholder="Goles"
          />
        </Field>
        <Field label="Grupo" htmlFor="metric-group">
          <Select
            value={metricForm.groupId}
            onValueChange={(value) => setMetricForm((s) => ({ ...s, groupId: value }))}
          >
            <SelectTrigger id="metric-group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin grupo</SelectItem>
              {groupRows.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Naturaleza" htmlFor="metric-nature">
            <Select
              value={metricForm.nature}
              onValueChange={(value) => setMetricForm((s) => ({ ...s, nature: value }))}
            >
              <SelectTrigger id="metric-nature">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NATURE).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo de valor" htmlFor="metric-type">
            <Select
              value={metricForm.valueType}
              onValueChange={(value) => setMetricForm((s) => ({ ...s, valueType: value }))}
            >
              <SelectTrigger id="metric-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VALUE_TYPE).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Dirección" htmlFor="metric-direction">
            <Select
              value={metricForm.direction}
              onValueChange={(value) => setMetricForm((s) => ({ ...s, direction: value }))}
            >
              <SelectTrigger id="metric-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIRECTION).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ámbito" htmlFor="metric-scope">
            <Select
              value={metricForm.scope}
              onValueChange={(value) => setMetricForm((s) => ({ ...s, scope: value }))}
            >
              <SelectTrigger id="metric-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPE).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Unidad" htmlFor="metric-unit">
            <Input id="metric-unit" name="unit" defaultValue={editingMetric?.unit ?? ""} />
          </Field>
          <Field label="Icono" htmlFor="metric-icon">
            <Input id="metric-icon" name="icon" defaultValue={editingMetric?.icon ?? ""} />
          </Field>
          <Field label="Color" htmlFor="metric-color">
            <Input id="metric-color" name="color" defaultValue={editingMetric?.color ?? ""} />
          </Field>
        </div>
        <Field label="Descripción breve" htmlFor="metric-short">
          <Input
            id="metric-short"
            name="shortDescription"
            defaultValue={editingMetric?.short_description ?? ""}
          />
        </Field>
        <Field label="Descripción técnica" htmlFor="metric-technical">
          <Textarea
            id="metric-technical"
            name="technicalDescription"
            rows={3}
            defaultValue={editingMetric?.technical_description ?? ""}
          />
        </Field>
        {editingMetric ? (
          <Field label="Estado" htmlFor="metric-status">
            <Select
              value={metricForm.status}
              onValueChange={(value) => setMetricForm((s) => ({ ...s, status: value }))}
            >
              <SelectTrigger id="metric-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="inactive">Inactiva</SelectItem>
                <SelectItem value="archived">Archivada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FormDialog>

      <FormDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        title="Nuevo borrador de versión"
        description="Al publicarlo se congela la lista de métricas activas del catálogo."
        submitLabel="Crear borrador"
        pending={versionMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          versionMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Motivo del cambio" htmlFor="changeReason">
          <Textarea id="changeReason" name="changeReason" rows={3} />
        </Field>
      </FormDialog>
    </>
  );
}
