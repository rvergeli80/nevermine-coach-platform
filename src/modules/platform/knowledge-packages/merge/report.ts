/**
 * FEATURE-003.8 — Informe de fusión.
 *
 * Un único texto para UI, MCP y CLI: si cada canal redactara el suyo, cada
 * canal contaría una historia distinta. Determinista carácter a carácter.
 */

import type {
  MergeConflict,
  MergeStatus,
  MergeSummary,
  MergeWarning,
  MergedChange,
  SkippedChange,
} from "./types";

const STATUS_LABEL: Record<MergeStatus, string> = {
  automatic: "Fusión automática",
  requires_manual_resolution: "Requiere resolución manual",
  rejected: "Fusión rechazada",
};

export function summarize(
  status: MergeStatus,
  merged: readonly MergedChange[],
  skipped: readonly SkippedChange[],
  conflicts: readonly MergeConflict[],
): MergeSummary {
  return {
    status,
    mergedCount: merged.length,
    skippedCount: skipped.length,
    conflictCount: conflicts.length,
    blockingCount: conflicts.filter((c) => c.category === "BLOCKING").length,
    warningCount: conflicts.filter((c) => c.category === "WARNING").length,
    infoCount: conflicts.filter((c) => c.category === "INFO").length,
  };
}

export interface MergeReportInput {
  sourceVersion: string;
  targetVersion: string;
  summary: MergeSummary;
  mergedChanges: readonly MergedChange[];
  skippedChanges: readonly SkippedChange[];
  conflicts: readonly MergeConflict[];
  warnings: readonly MergeWarning[];
  errors?: readonly string[];
}

/** Texto legible del informe: mismas entradas, mismo texto. */
export function buildMergeReport(input: MergeReportInput): string {
  const lines: string[] = [
    `Fusión ${input.sourceVersion} → ${input.targetVersion}`,
    `• ${STATUS_LABEL[input.summary.status]}`,
  ];

  for (const error of input.errors ?? []) lines.push(`• Error: ${error}`);

  if (input.summary.mergedCount > 0) {
    lines.push(
      `• ${input.summary.mergedCount} ${input.summary.mergedCount === 1 ? "elemento fusionado" : "elementos fusionados"}`,
    );
  }
  if (input.summary.skippedCount > 0) {
    lines.push(
      `• ${input.summary.skippedCount} ${input.summary.skippedCount === 1 ? "elemento descartado" : "elementos descartados"}`,
    );
  }
  if (input.summary.conflictCount === 0 && input.summary.mergedCount === 0 && !input.errors?.length) {
    lines.push("• Sin diferencias que incorporar: el destino ya contiene el origen.");
  }
  if (input.summary.blockingCount > 0) {
    lines.push(`• ${input.summary.blockingCount} conflicto(s) BLOCKING impiden la fusión automática`);
  }
  if (input.summary.warningCount > 0) lines.push(`• ${input.summary.warningCount} conflicto(s) WARNING`);
  if (input.summary.infoCount > 0) lines.push(`• ${input.summary.infoCount} conflicto(s) INFO`);

  for (const conflict of input.conflicts) {
    lines.push(`  [${conflict.category}] ${conflict.path}: ${conflict.message}`);
  }
  for (const warning of input.warnings) lines.push(`  [AVISO] ${warning.message}`);

  return lines.join("\n");
}

/** Explicación aislada de los conflictos, para pantallas de resolución. */
export function explainConflicts(conflicts: readonly MergeConflict[]): string {
  if (conflicts.length === 0) return "Sin conflictos.";
  return conflicts
    .map((c) => `[${c.category}] ${c.element} · ${c.path}\n  ${c.message}`)
    .join("\n");
}
