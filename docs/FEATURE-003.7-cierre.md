# FEATURE-003.7 — Version Comparison · Cierre

## 1. Resumen de implementación

Motor oficial de comparación del Knowledge Distribution Engine. Compara dos
versiones completas de una configuración y produce un informe estructurado de
diferencias. **Sólo lee**: no modifica versiones, no fusiona, no resuelve
conflictos y no sugiere nada.

- **Comparison Engine** (`platform/knowledge-packages/comparison/`):
  `ComparisonService` con `compareVersions`, `compareVersionIds`,
  `comparePackageVersions`, `compareSnapshots`, `compareMetadata`,
  `compareConfiguration` y `compareKnowledge`.
- **Determinismo**: serialización canónica (FNV-1a de FEATURE-003.2), listas
  simples normalizadas como conjuntos ordenados, salidas ordenadas por ruta e
  identidad, y `comparisonId` derivado del par de versiones (no del reloj).
- **ComparisonResult**: `comparisonId`, `generatedAt`, `sourceVersion`,
  `targetVersion`, resumen (`identical`, `compatible`, `verdict`,
  `breakingChanges`, `totalChanges`) y detalle (`metadataChanges`,
  `configurationChanges`, `knowledgeChanges`, `governanceChanges`), más
  `reasons` y `humanSummary`.
- **Metadata Comparison**: versión, checksum, tipo de cambio, autor;
  separando gobierno (publisher, owner, lifecycle, publication state, trust,
  certificación). Clasificación `UNCHANGED | MODIFIED | ADDED | REMOVED`.
- **Configuration Comparison**: estructural, aplanada por ruta lógica; el
  orden de claves y de listas simples es irrelevante.
- **Knowledge Comparison**: por **identidad lógica** (`kind` + `id`), nunca por
  texto; cubre capabilities, packs, assets y, en Coach, grupos, métricas,
  perfiles y dependencias.
- **Compatibility Analysis**: `compatible`, `compatible_with_warnings`,
  `breaking`, con motivo explícito por cada juicio (salto mayor, conocimiento
  crítico eliminado, parámetro eliminado/modificado, bajada de trust, retirada
  de ciclo de vida, despublicación).
- **Human-readable Summary**: texto único reutilizable por UI, MCP y CLI.
- **Coach Integration**: `starterPackProjector` traduce un Starter Pack al
  modelo de comparación; Coach usa **exclusivamente** el `ComparisonService`
  y sólo muestra el resultado.

## 2. Archivos creados

- `src/modules/platform/knowledge-packages/comparison/types.ts`
- `src/modules/platform/knowledge-packages/comparison/diff.ts`
- `src/modules/platform/knowledge-packages/comparison/metadata.ts`
- `src/modules/platform/knowledge-packages/comparison/knowledge.ts`
- `src/modules/platform/knowledge-packages/comparison/compatibility.ts`
- `src/modules/platform/knowledge-packages/comparison/summary.ts`
- `src/modules/platform/knowledge-packages/comparison/service.ts`
- `src/modules/platform/knowledge-packages/comparison/index.ts`
- `src/modules/platform/knowledge-packages/comparison/comparison.test.ts`
- `src/modules/starter-packs/comparison.ts`
- `src/modules/starter-packs/comparison.test.ts`
- `docs/FEATURE-003.7-cierre.md`

## 3. Archivos modificados

- `src/modules/platform/knowledge-packages/index.ts` — exporta `comparison`.
- `src/modules/starter-packs/index.ts` — exporta la comparación de Coach.
- `src/lib/services/starter-packs.service.ts` — `compareConfiguration` y
  `compareConfigurationWithCurrent`.
- `src/lib/starter-packs.functions.ts` — canal HTTP
  `compareConfigurationVersionsFn` (sólo lectura, bajo ApplicationContext).

## 4. Migraciones

Ninguna. La comparación es una operación de lectura sobre el historial de
versiones ya existente: no introduce estado persistente nuevo.

## 5. Tests ejecutados

`bunx vitest run` → **200/200 en verde** (18 ficheros), de los cuales 14
nuevos: 11 unitarios del motor (estructura, identidad lógica, determinismo,
veredictos, resumen, inmutabilidad) y 3 de integración con Coach (proyección,
detección explicada de una métrica eliminada, error controlado).

## 6. Riesgos

- **Umbral de "crítico"**: la lista de familias cuya eliminación se considera
  incompatible (`capability`, `dependency`, `metric`, `profile`, `pack`) es una
  decisión de plataforma; ampliarla cambia veredictos históricos.
- **Proyección de Coach**: si un pack incorpora contenido nuevo y nadie lo
  añade al proyector, ese contenido no se compara. Es un fallo silencioso.
- **Versiones muy grandes**: la comparación es O(n) sobre entidades, en
  memoria; con catálogos de decenas de miles de entidades habría que paginar.

## 7. Deuda técnica

- El informe no se persiste: se recalcula en cada consulta (es determinista,
  así que es correcto, pero impide auditar "qué se mostró" en su día).
- No hay UI de comparación en Coach: sólo dominio, servicio y canal HTTP. La
  visualización pertenece a la Feature siguiente.
- El `owner` de un pack se deriva hoy de `origin`; cuando exista Ownership
  explícito por SportSpace, el proyector deberá leerlo de ahí.

## 8. Definition of Done

| Requisito | Estado |
| --- | --- |
| ComparisonService | ✔ |
| ComparisonResult | ✔ |
| Metadata Comparison | ✔ |
| Configuration Comparison | ✔ |
| Knowledge Comparison | ✔ |
| Compatibility Analysis | ✔ |
| Human-readable Summary | ✔ |
| Integración completa con Coach | ✔ |
| Tests unitarios | ✔ |
| Tests de integración | ✔ |
| Documentación de cierre | ✔ |

No se ha implementado (fuera de alcance por especificación): merge, resolución
de conflictos, comparación visual, diff HTML, IA, sugerencias automáticas,
aprobación humana y sincronización remota.
