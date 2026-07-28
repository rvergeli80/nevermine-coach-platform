import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  deleteFormula,
  listCatalogMetricRefs,
  listFormulas,
  upsertFormula,
} from "@/lib/formulas.functions";
import { checkFormula, type CatalogMetricRef } from "@/modules/config/formula-rules";
import type { FormulaNode } from "@/modules/metrics/domain";
import { QueryState } from "@/components/app/page-header";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export interface FormulaVersionOption {
  id: string;
  version_number: number;
  status: string;
}

type FormulaRow = {
  id: string;
  metric_id: string;
  expression: string;
  ast: FormulaNode;
  dependencies: string[];
  null_policy: string;
  metrics: { code: string; name: string } | null;
};

export function FormulasPanel({
  catalogId,
  versions,
  versionsLoading,
}: {
  catalogId: string;
  versions: FormulaVersionOption[];
  versionsLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchMetrics = useServerFn(listCatalogMetricRefs);
  const fetchFormulas = useServerFn(listFormulas);
  const save = useServerFn(upsertFormula);
  const remove = useServerFn(deleteFormula);

  const defaultVersion =
    versions.find((version) => version.status === "draft")?.id ?? versions[0]?.id ?? "";
  const [selectedVersion, setSelectedVersion] = useState("");
  const versionId = selectedVersion || defaultVersion;
  const version = versions.find((item) => item.id === versionId);
  const editable = version?.status === "draft";

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CatalogMetricRef | null>(null);
  const [expression, setExpression] = useState("");
  const [nullPolicy, setNullPolicy] = useState<"zero" | "propagate">("zero");

  const metrics = useQuery({
    queryKey: ["metric-refs", catalogId],
    queryFn: () => fetchMetrics({ data: { catalogId } }),
  });
  const formulas = useQuery({
    queryKey: ["formulas", versionId],
    queryFn: () => fetchFormulas({ data: { versionId } }),
    enabled: Boolean(versionId),
  });

  const metricRefs = (metrics.data ?? []) as CatalogMetricRef[];
  const formulaRows = (formulas.data ?? []) as FormulaRow[];
  const derived = metricRefs.filter((m) => m.nature === "derived" && m.status === "active");
  const byMetric = new Map(formulaRows.map((row) => [row.metric_id, row]));

  const liveCheck = useMemo(() => {
    if (!target || !expression.trim()) return null;
    const others = formulaRows
      .filter((row) => row.metric_id !== target.id)
      .map((row) => ({ metricCode: row.metrics?.code ?? "", ast: row.ast }));
    return checkFormula(expression, target, metricRefs, others);
  }, [expression, target, metricRefs, formulaRows]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Selecciona una métrica");
      return save({ data: { versionId, metricId: target.id, expression, nullPolicy } });
    },
    onSuccess: () => {
      toast.success("Fórmula guardada");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["formulas", versionId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Fórmula eliminada");
      queryClient.invalidateQueries({ queryKey: ["formulas", versionId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEditor(metric: CatalogMetricRef) {
    const current = byMetric.get(metric.id);
    setTarget(metric);
    setExpression(current?.expression ?? "");
    setNullPolicy((current?.null_policy as "zero" | "propagate") ?? "zero");
    setOpen(true);
  }

  if (!versionsLoading && versions.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Crea primero un borrador de versión: las fórmulas viven dentro de una versión del catálogo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <Select value={versionId} onValueChange={setSelectedVersion}>
            <SelectTrigger aria-label="Versión">
              <SelectValue placeholder="Selecciona una versión" />
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
        {editable ? null : (
          <p className="text-sm text-muted-foreground">
            Versión publicada: sus fórmulas son inmutables.
          </p>
        )}
      </div>

      <QueryState
        isLoading={metrics.isLoading || formulas.isLoading}
        error={metrics.error ?? formulas.error}
        isEmpty={derived.length === 0}
        emptyText="Este catálogo no tiene métricas derivadas activas."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead>Expresión</TableHead>
                <TableHead>Dependencias</TableHead>
                <TableHead>Nulos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {derived.map((metric) => {
                const formula = byMetric.get(metric.id);
                return (
                  <TableRow key={metric.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{metric.code}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formula ? (
                        formula.expression
                      ) : (
                        <Badge variant="outline">Sin fórmula</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formula?.dependencies?.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formula ? (formula.null_policy === "zero" ? "Cuenta 0" : "Propaga") : "—"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!editable}
                        onClick={() => openEditor(metric)}
                      >
                        {formula ? "Editar" : "Definir"}
                      </Button>
                      {formula && editable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(formula.id)}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </QueryState>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={target ? `Fórmula de ${target.code}` : "Fórmula"}
        description="Usa códigos de métrica, números, + - * / y las funciones min, max, abs, round y safe_div."
        pending={saveMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Field
          label="Expresión"
          htmlFor="expression"
          hint="Ejemplo: safe_div(goles, tiros_totales) * 100"
        >
          <Textarea
            id="expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            rows={3}
            className="font-mono"
            required
          />
        </Field>

        {liveCheck ? (
          liveCheck.ok ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium">Expresión válida</p>
              <p className="mt-1 text-muted-foreground">
                Dependencias: {liveCheck.dependencies.join(", ") || "ninguna"}
              </p>
            </div>
          ) : (
            <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {liveCheck.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )
        ) : null}

        <Field label="Política de nulos" htmlFor="nullPolicy">
          <Select
            value={nullPolicy}
            onValueChange={(value) => setNullPolicy(value as "zero" | "propagate")}
          >
            <SelectTrigger id="nullPolicy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zero">Los valores ausentes cuentan como 0</SelectItem>
              <SelectItem value="propagate">Los valores ausentes anulan el resultado</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium">Métricas disponibles</p>
          <div className="flex flex-wrap gap-1">
            {metricRefs
              .filter((m) => m.status === "active" && m.id !== target?.id)
              .map((metric) => (
                <button
                  key={metric.id}
                  type="button"
                  className="rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setExpression((current) => `${current}${metric.code}`)}
                >
                  {metric.code}
                </button>
              ))}
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
