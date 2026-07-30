# FEATURE-003.8 — Merge Engine · Cierre

## 1. Resumen de implementación

El Knowledge Distribution Engine incorpora su motor oficial de fusión. Fusionar es un
acto **derivado y determinista**: combina dos versiones compatibles en una configuración
nueva sin tocar jamás las originales.

- **`MergeService`** (plataforma) es la única puerta de entrada: `validateMerge`,
  `analyzeMerge`, `previewMerge`, `merge`, `explainConflicts`.
- **Regla de fusión automática**: el destino (`target`) es la base; del origen (`source`)
  entra únicamente lo **nuevo** (parámetros, conocimiento, capacidades, assets). Nada
  existente se sobrescribe sin regla explícita.
- **Conflictos** clasificados en `INFO` / `WARNING` / `BLOCKING`; sólo `BLOCKING` impide
  fusionar. Códigos: `configuration_conflict`, `knowledge_conflict`,
  `dependency_incompatible`, `trust_downgrade`, `lifecycle_incompatible`.
- **Estados**: `automatic`, `requires_manual_resolution`, `rejected` (bajada de Trust,
  incompatibilidad de lifecycle o de dependencias).
- **Determinismo**: `mergeId = checksum([sourceVersionId, targetVersionId])`; plan puro,
  salida ordenada por clave lógica, checksum del snapshot fusionado estable. Mismas
  entradas ⇒ mismo resultado, mismo checksum, mismo informe.
- **Integración con VersioningService**: una fusión `automatic` crea siempre una versión
  nueva con `merge = { mergeId, mergedFrom: [source, target], mergeTimestamp, mergeAuthor }`.
  El grafo expone `mergeLineageOf(versionId)` (source lineage, target lineage, merged).
- **Coach** aporta sólo el adaptador (proyección + materialización del Starter Pack) y
  consume `previewConfigurationMerge` / `mergeConfigurationVersions`. No implementa
  ninguna regla de fusión.

## 2. Archivos creados

- `src/modules/platform/knowledge-packages/merge/types.ts`
- `src/modules/platform/knowledge-packages/merge/conflicts.ts`
- `src/modules/platform/knowledge-packages/merge/plan.ts`
- `src/modules/platform/knowledge-packages/merge/report.ts`
- `src/modules/platform/knowledge-packages/merge/service.ts`
- `src/modules/platform/knowledge-packages/merge/index.ts`
- `src/modules/platform/knowledge-packages/merge/merge.test.ts`
- `src/modules/starter-packs/merge.ts`
- `src/modules/starter-packs/merge.test.ts`
- `docs/FEATURE-003.8-cierre.md`

## 3. Archivos modificados

- `src/modules/platform/knowledge-packages/versioning/types.ts` — `VersionMergeProvenance`
  y campo `merge` en `VersionRecord`.
- `src/modules/platform/knowledge-packages/versioning/service.ts` — persiste la procedencia.
- `src/modules/platform/knowledge-packages/versioning/graph.ts` — `mergeLineageOf`.
- `src/modules/platform/knowledge-packages/versioning/versioning.test.ts` — fixture.
- `src/modules/platform/knowledge-packages/index.ts` y `src/modules/starter-packs/index.ts` — barriles.
- `src/lib/services/starter-packs.service.ts` — `previewConfigurationMergeService`, `mergeConfiguration`.
- `src/lib/starter-packs.functions.ts` — `previewConfigurationMergeFn`, `mergeConfigurationVersionsFn`
  (bajo ApplicationContext; el autor de la fusión es siempre el usuario autenticado).

## 4. Migraciones

Ninguna. Fusionar no persiste estado en base de datos: el linaje vive en el
Versioning Engine.

## 5. Tests ejecutados

`bunx vitest run` → **20 archivos, 212 tests PASS** (12 nuevos: 8 unitarios del motor,
4 de integración con Coach). `tsgo --noEmit` limpio.

## 6. Riesgos

- El linaje es lineal por diseño: una fusión añade un eslabón al final de la cadena del
  paquete destino, no una rama. Si en el futuro se admiten ramas, el grafo deberá relajar
  su validación.
- El store de versiones sigue siendo en memoria: el historial de fusiones no sobrevive a
  un reinicio hasta que se persista.

## 7. Deuda técnica

- Sin UI de fusión en Coach (fuera de alcance, igual que en 003.7).
- Sin herramienta MCP de merge: el informe ya es reutilizable, falta exponerlo.
- Persistencia del linaje y de las procedencias de fusión pendiente.

## 8. Definition of Done

✔ MergeService · ✔ MergeResult · ✔ Automatic Merge · ✔ Conflict Detection ·
✔ Conflict Classification · ✔ Deterministic Merge · ✔ Merge Report ·
✔ Integración con VersioningService · ✔ Integración completa con Coach ·
✔ Tests unitarios · ✔ Tests de integración · ✔ Documentación.

No se ha implementado (fuera de alcance por especificación): IA, resolución automática
por LLM, edición manual, ramas paralelas, cherry-pick, rebase, sincronización remota y
colaboración multiusuario.
