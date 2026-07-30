/**
 * FEATURE-003.7 — Resumen legible del informe de comparación.
 *
 * Un mismo texto para UI, MCP y CLI: si la explicación viviera en cada canal,
 * cada canal contaría una historia distinta.
 */

import type {
  CompatibilityReason,
  CompatibilityVerdict,
  ComparedVersion,
  FieldChange,
  KnowledgeChange,
} from "./types";

const VERDICT_LABEL: Record<CompatibilityVerdict, string> = {
  compatible: "Compatible",
  compatible_with_warnings: "Compatible con advertencias",
  breaking: "Cambio incompatible",
};

const KIND_LABEL: Record<string, [string, string]> = {
  capability: ["capability", "capabilities"],
  "knowledge-pack": ["Knowledge Pack", "Knowledge Packs"],
  pack: ["pack", "packs"],
  asset: ["asset", "assets"],
  metric: ["métrica", "métricas"],
  group: ["grupo", "grupos"],
  profile: ["perfil", "perfiles"],
  dependency: ["dependencia", "dependencias"],
};

function plural(kind: string, count: number): string {
  const labels = KIND_LABEL[kind] ?? [kind, `${kind}s`];
  return count === 1 ? labels[0] : labels[1];
}

function line(count: number, verb: string, kind: string): string | null {
  if (count === 0) return null;
  return `• ${count} ${plural(kind, count)} ${verb}`;
}

export interface SummaryInput {
  source: ComparedVersion;
  target: ComparedVersion;
  identical: boolean;
  verdict: CompatibilityVerdict;
  configurationChanges: readonly FieldChange[];
  knowledgeChanges: readonly KnowledgeChange[];
  governanceChanges: readonly FieldChange[];
  reasons: readonly CompatibilityReason[];
}

/** Texto determinista: mismas entradas, mismo resumen, carácter a carácter. */
export function buildHumanSummary(input: SummaryInput): string {
  const header = `Versión ${input.source.semanticVersion} → ${input.target.semanticVersion}`;
  if (input.identical) {
    return `${header}\n• Sin diferencias: ambas versiones son idénticas.\n• ${VERDICT_LABEL[input.verdict]}`;
  }

  const lines: string[] = [];

  const added = input.configurationChanges.filter((c) => c.kind === "ADDED").length;
  const removed = input.configurationChanges.filter((c) => c.kind === "REMOVED").length;
  const modified = input.configurationChanges.filter((c) => c.kind === "MODIFIED").length;
  if (added) lines.push(`• ${added} ${added === 1 ? "parámetro añadido" : "parámetros añadidos"}`);
  if (removed) lines.push(`• ${removed} ${removed === 1 ? "parámetro eliminado" : "parámetros eliminados"}`);
  if (modified) lines.push(`• ${modified} ${modified === 1 ? "parámetro modificado" : "parámetros modificados"}`);

  // Conocimiento agrupado por familia, en orden alfabético para ser estable.
  const kinds = [...new Set(input.knowledgeChanges.map((c) => c.entityKind))].sort();
  for (const kind of kinds) {
    const scoped = input.knowledgeChanges.filter((c) => c.entityKind === kind);
    const l1 = line(scoped.filter((c) => c.kind === "ADDED").length, "nuevas", kind);
    const l2 = line(scoped.filter((c) => c.kind === "REMOVED").length, "eliminadas", kind);
    const l3 = line(scoped.filter((c) => c.kind === "MODIFIED").length, "modificadas", kind);
    for (const l of [l1, l2, l3]) if (l) lines.push(l);
  }

  const trust = input.governanceChanges.find((c) => c.path === "trustLevel");
  lines.push(
    trust ? `• Trust Level: ${trust.before} → ${trust.after}` : "• Trust Level sin cambios",
  );

  const lifecycle = input.governanceChanges.find((c) => c.path === "lifecycleState");
  if (lifecycle) lines.push(`• Ciclo de vida: ${lifecycle.before} → ${lifecycle.after}`);

  lines.push(`• ${VERDICT_LABEL[input.verdict]}`);
  for (const reason of input.reasons.filter((r) => r.severity === "breaking")) {
    lines.push(`  ‣ ${reason.message}`);
  }

  return [header, ...lines].join("\n");
}
