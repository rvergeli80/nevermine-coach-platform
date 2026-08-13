# Nevermine Coach Platform — Auditoría Técnica

> Auditoría del estado REAL a **2026-08-13**, basada en código, esquema de base de datos, linter de
> Supabase y ejecución de la batería de tests. No se ha modificado la aplicación.
> Documento hermano: `docs/NEVERMINE_COACH_PLATFORM_MASTER_DOCUMENTATION.md`.
>
> Escala de severidad: **CRÍTICO** (bloquea producción) · **ALTO** (riesgo real de negocio o
> seguridad) · **MEDIO** (deuda que encarece la evolución) · **BAJO** (higiene).

---

## 1. Resumen ejecutivo

La plataforma tiene una arquitectura **excepcionalmente sólida en la capa de dominio y de
aislamiento**: dominio puro sin infraestructura, RLS como única fuente de autorización, invariantes
históricos garantizados por triggers y 271 tests verdes. El problema no es la calidad, es el
**desequilibrio de madurez**: el Knowledge Distribution Engine (10 features, ~40 archivos de
plataforma) está muy por delante del producto que debe servir, mientras que **el motor de métricas
—la razón de ser del producto— no tiene ningún camino de uso end-to-end**: no existe pantalla para
registrar observaciones ni para consultar valoraciones, y las funciones de cálculo no se invocan
desde ningún punto de la aplicación.

Hallazgos por severidad: **1 CRÍTICO**, **4 ALTOS**, **6 MEDIOS**, **4 BAJOS**.

---

## 2. Hallazgos

### 2.1 CRÍTICO — El motor de métricas no tiene camino de uso end-to-end

**Evidencia.** `computeValuation`, `resolveDerivedValues`, `selectWeights` y `evaluateFormula` sólo
aparecen dentro de `src/modules/metrics/domain/**`. Verificado con
`rg "computeValuation|evaluateFormula|resolveDerivedValues|selectWeights" src --glob '!*.test.ts'`:
ningún resultado en `src/lib/**` ni en `src/routes/**`.

Consecuencia en cadena:

- Las tablas `event_types`, `observation_contexts`, `metric_values` y `valuations` existen, tienen
  RLS, triggers de inmutabilidad y grants, pero **ninguna server function ni ruta las lee o escribe**.
- No hay UI para registrar una observación (partido/entrenamiento) ni para ver la valoración de un
  jugador o equipo.
- El ADR-001 (correcciones generan nueva valoración marcando la anterior como reemplazada) está
  implementado en base de datos pero nunca se ejercita.

**Lo que sí está cableado**: la *validación* de fórmulas y pesos (`checkFormula`,
`checkVersionFormulas`, `checkWeight`, `checkVersionWeights`) a través de
`src/modules/config/formula-rules.ts` y `weight-rules.ts`.

**Recomendación.** Es la siguiente feature obligatoria: *Observation & Valuation* — contexto de
observación, captura de métricas primarias, cálculo de derivadas con el evaluador existente y
persistencia de `valuations` con snapshot de pesos. El dominio ya está escrito y probado; falta
únicamente la capa de aplicación y la UI.

---

### 2.2 ALTO — El estado del Knowledge Engine sólo vive en memoria

**Evidencia.** `rg "supabase|drizzle|postgres|prisma" src/modules` → 0 resultados. Los almacenes son
`Map` de proceso: `LifecycleHistory` (`lifecycle.ts`), `PublisherRegistry` (`governance.ts:113`),
`PublicationAuditLog` (`publication.ts`), `InMemoryVersionStore` (`versioning/service.ts:75`),
`VersionGraph`, `distribution/registry.ts:22,122`, `history/store.ts`.

Sólo se persisten `starter_pack_installations` y `starter_pack_installation_events`.

**Impacto.** En un runtime edge/serverless con múltiples instancias y arranques en frío:

- El "historial append-only" y el "audit trail" del conocimiento se pierden en cada reinicio y
  **difieren entre instancias**. Contradice directamente el principio de historial inmutable.
- `/app/trazabilidad` muestra un estado reconstruido que puede variar entre peticiones. La parte
  fiable es la que procede de `starter_pack_installation_events` (sí persistida).
- El versionado real de configuraciones no sobrevive al proceso.

**Recomendación.** Antes de cualquier feature nueva del Engine, sustituir los stores in-memory por
adaptadores persistentes, siguiendo exactamente el patrón ya probado en
`src/lib/services/pack-installation.ts` (`SupabaseInstallationManifestStore`): el dominio ya define
las interfaces (`VersionStore`, `InstallationManifestStore`), sólo falta implementarlas contra la
base de datos. O, alternativamente, degradar de forma explícita la promesa: documentar que sólo la
historia de instalación es fuente de verdad.

---

### 2.3 ALTO — Mutaciones sin `requireApplicationContext`

**Evidencia.** `updateSport`, `updateSeason`, `updateCompetition`, `updateCatalog`, `updateGroup`,
`updateMetric`, `updateTeam`, `updatePlayer`, todas las funciones de `formulas.functions.ts`,
`weights.functions.ts` (escrituras), `memberships.functions.ts` y `sport-spaces.functions.ts` usan
sólo `requireSupabaseAuth` y operan por `.eq("id", …)`.

**Análisis.** No es una vulnerabilidad: la RLS por Membership sí protege esas filas y los scripts
`rls-authorization-matrix-test.py` / `rls-cross-reference-test.py` validan el aislamiento. Pero:

- La defensa queda en una sola capa. El principio declarado del proyecto es "RLS es la única
  autorización a nivel de datos" **y** el backend valida negocio; aquí el backend no valida ámbito.
- Es inconsistente con `sports-organization.service.ts`, que sí filtra `.eq("sport_space_id", …)` en
  todas sus consultas — el patrón correcto y el único aplicado de forma sistemática.

**Recomendación.** Homogeneizar: `requireApplicationContext` en toda mutación de recurso de negocio
y filtro explícito de `sport_space_id` en el `update`, dejando RLS como red de seguridad y no como
único control.

---

### 2.4 ALTO — 22 server functions expuestas sin ningún consumidor

**Evidencia** (sin referencias en todo `src/`):

`listStarterPackHistory`, `updateStarterPackFn`, `rollbackStarterPackFn`, `uninstallStarterPackFn`,
`listStarterPackManifests`, `listConfigurationVersions`, `getConfigurationVersionLineage`,
`compareConfigurationVersionsFn`, `previewConfigurationMergeFn`, `mergeConfigurationVersionsFn`,
`getPackDistributionStatusFn`, `getDistributionReportFn`, `searchKnowledgeHistoryFn`,
`getKnowledgeTimelineFn`, `getKnowledgeAuditTrailFn`, `reconstructKnowledgeStateFn`,
`explainKnowledgeHistoryFn`, `updateCatalog`, `updateGroup`, `listMyMemberships`, `getSportSpace`,
`listCategories`, `updateCategory`.

**Impacto.** Cada una es un endpoint RPC real y alcanzable. Superficie de ataque sin UI que la
justifique, y mantenimiento de código que nadie ejercita en producción. Especialmente sensibles:
`rollbackStarterPackFn`, `uninstallStarterPackFn` y `mergeConfigurationVersionsFn`, que mutan
configuración del SportSpace.

**Recomendación.** Decidir por función: cablear a UI o retirar. Mientras tanto, verificar que las
mutantes exigen rol Owner (hoy basta con Membership).

---

### 2.5 ALTO — Rutas administrativas funcionales pero ocultas

`/app/miembros` y `/app/sportspaces` existen, están bajo el gate `_authenticated` y operan sobre
`sport_space_members` y `sport_spaces`, pero **no aparecen en la navegación** de
`src/components/app/app-shell.tsx`. Cualquiera con la URL puede gestionar miembros (limitado por RLS
y por los triggers de invariante de Owner).

Además, la autorización de gestión de miembros está delegada al 100 % a RLS + triggers: no hay
comprobación en la capa de aplicación de que quien invita sea Owner. `canManageMembers` existe en el
dominio (`src/modules/sport-space/membership.ts`) pero **no se invoca desde `memberships.functions.ts`**.

**Recomendación.** Enlazar ambas rutas o retirarlas, y aplicar `canManageMembers` en el servicio.

---

### 2.6 MEDIO — Paridad MCP mínima

6 tools frente a ~80 server functions; sólo `create_season` escribe. No hay tools de organización
deportiva, equipos, jugadores, fórmulas, pesos ni Starter Packs. La arquitectura para lograr paridad
ya existe (`contextualTool` + Application Services compartidos): es trabajo de exposición, no de
diseño. Sin embargo, la contradicción con el objetivo declarado de FEATURE-002.6 ("toda Tool MCP se
comportará exactamente igual que la aplicación web") es real: el comportamiento es idéntico, pero la
superficie no.

### 2.7 MEDIO — El único Starter Pack está hardcodeado en el código fuente

`waterpolo_base` v1.0.0 vive en `src/modules/starter-packs/waterpolo.ts`. No hay tabla de packages ni
flujo de creación. Publicar un pack nuevo (o de un segundo deporte) exige un despliegue. Contradice
parcialmente el principio "configuración > programación" que rige el resto del sistema, y bloquea de
facto los escenarios Community / Enterprise / Marketplace para los que el Engine está preparado.

### 2.8 MEDIO — Motor de plataforma sin ejercitar fuera de sus tests

Certification, governance (`PublisherRegistry`, `isAuthorizedToPublish`), publication
(`PublicationAuditLog`, `evaluatePublicationPolicy`), `comparison/*`, `merge/*`, `versioning/*`
(`VersionGraph`, `InMemoryVersionStore`) y `distribution/registry.ts` no se citan por nombre desde
`src/lib`. Están completos y probados, pero su corrección sólo se demuestra en tests unitarios, no
en un flujo real. `InMemoryInstallationManifestStore` nunca se usa en producción.

### 2.9 MEDIO — Lógica de negocio en la capa de transporte

`config.functions.ts:252-297` implementa la herencia de fórmulas y pesos al crear una versión, y
`config.functions.ts:338-374` la validación previa a publicar. Esa lógica pertenece al dominio o a
un Application Service, no a una server function. Consecuencia práctica: MCP no puede crear ni
publicar versiones con las mismas garantías sin duplicar código.

### 2.10 MEDIO — `config.service.ts` no filtra el ámbito explícitamente

`listSeasonsService`, `listCompetitionsService` y `listCatalogsService` no aplican
`.eq("sport_space_id", ctx.sportSpaceId)`: confían por completo en la RLS del cliente contextual. Con
un usuario miembro de **dos** SportSpaces, la RLS permite ver los de ambos, mientras el
`ApplicationContext` dice que sólo uno está activo. Es decir: **el contexto activo no se está
respetando en esas lecturas**. `sports-organization.service.ts` sí lo hace bien.

Nota adicional: `can_read_catalog` admite catálogos de plataforma (`sport_space_id IS NULL`), lo que
es intencionado, pero refuerza la necesidad de filtro explícito para distinguir ámbitos.

### 2.11 MEDIO — Auditoría declarada pero no alimentada

La tabla `audit_log` existe con triggers de inmutabilidad y sincronización de ámbito, pero ninguna
server function ni servicio escribe en ella. La auditoría se aceptó como deuda técnica en la Fase 0
y sigue abierta.

### 2.12 BAJO — 20 avisos del linter de base de datos

Todos de la categoría *"Signed-In Users Can Execute SECURITY DEFINER Function"*. Son las funciones
predicado (`can_access_*`, `has_role`, `is_sport_space_*`…) que la RLS necesita invocar como
`authenticated`. Todas tienen `search_path = public` fijado y son de sólo lectura, salvo
`ensure_personal_sport_space` / `ensure_sport_space_owner` / `install_starter_pack`, que sí escriben
y merecen una revisión de `EXECUTE`. **Aceptable con matiz**: ningún ERROR, pero conviene documentar
la excepción y restringir el `EXECUTE` de las tres funciones que mutan.

### 2.13 BAJO — Sin tests de interfaz ni E2E

La cobertura es excelente en dominio y aislamiento, nula en UI y en el flujo completo web. Ningún
test detectaría una regresión de navegación, de formulario o del switcher de SportSpace.

### 2.14 BAJO — Sin observabilidad de producción

Sólo captura de errores y un logger de consola para MCP. No hay métricas, trazas ni alertas; un fallo
de RLS o de instalación de pack sólo se detectaría por reporte del usuario.

### 2.15 BAJO — Dependencias en beta

`nitro` `3.0.260603-beta` y `vite ^8` son versiones muy recientes; `@lovable.dev/mcp-js` está en
`0.x` (API no estable). Riesgo de rotura en actualizaciones menores.

---

## 3. Contradicciones detectadas entre lo declarado y lo implementado

| Principio declarado | Realidad |
| --- | --- |
| "Historial inmutable y append-only" (Knowledge Engine) | Cierto en base de datos; **falso en memoria** para lifecycle, publicación, versionado, distribución e historia (§2.2) |
| "Toda Tool MCP se comporta igual que la web" | Cierto en semántica, **falso en cobertura**: 6 tools frente a ~80 funciones (§2.6) |
| "Configuración > programación" | Cierto para métricas, fórmulas y pesos; **falso para los propios packs**, que son código (§2.7) |
| "RLS + validación de negocio en backend" | RLS sí; **validación de ámbito ausente** en la mitad de las mutaciones (§2.3, §2.10) |
| "Un solo SportSpace activo por sesión" | Cierto en el contexto; **no aplicado** en varias lecturas que devuelven todos los espacios accesibles (§2.10) |
| Auditoría del sistema | Tabla existente, **nunca escrita** (§2.11) |
| ADR-001: valoraciones reemplazadas, nunca recalculadas | Garantizado por triggers, **nunca ejercitado**: no hay valoraciones (§2.1) |

---

## 4. Código muerto identificado

| Elemento | Ubicación |
| --- | --- |
| Motor de cálculo de métricas | `metrics/domain/valuation.ts`, `formula/evaluator.ts` (cálculo, no validación) |
| 22 server functions | ver §2.4 |
| Certification / governance / publication / comparison / merge / versioning / distribution-registry | `platform/knowledge-packages/**` (§2.8) |
| `InMemoryInstallationManifestStore` | `installation/manifest.ts` — sustituido siempre por el adaptador Supabase |
| `canManageMembers` | `sport-space/membership.ts` — nunca invocado |
| Tablas sin uso en la aplicación | `event_types`, `observation_contexts`, `metric_values`, `valuations`, `audit_log`, `validation_rules`, `catalog_version_metrics` |

---

## 5. Readiness para producción

| Dimensión | Estado | Nota |
| --- | --- | --- |
| Aislamiento multi-tenant | **Listo** | RLS por Membership, validado con scripts multi-usuario |
| Autenticación | **Listo** | JWT por petición, retry de clock skew, gate de rutas |
| Integridad histórica en BD | **Listo** | Triggers de inmutabilidad completos |
| Valor funcional para el entrenador | **No listo** | Sin registro de observaciones ni valoraciones (§2.1) |
| Durabilidad del Knowledge Engine | **No listo** | Estado en memoria (§2.2) |
| Auditoría | **No listo** | Tabla vacía (§2.11) |
| Observabilidad | **No listo** | Sin métricas ni alertas (§2.14) |
| Cobertura de pruebas | **Parcial** | Dominio excelente, UI nula |

**Veredicto**: no apto para uso real por entrenadores todavía — no por defectos, sino porque el
caso de uso central (medir y valorar) no está expuesto. Sí apto como base técnica para construirlo.

---

## 6. Prioridades recomendadas

1. **Observation & Valuation** (resuelve §2.1): la única feature que convierte la plataforma en un
   producto usable. El dominio ya existe y está probado.
2. **Persistir el Knowledge Engine** (§2.2): adaptadores de base de datos para los stores in-memory,
   siguiendo el patrón de `pack-installation.ts`.
3. **Homogeneizar ámbito y contexto** (§2.3, §2.10): `requireApplicationContext` en toda mutación y
   filtro explícito de `sport_space_id` en `config.service.ts`.
4. **Limpiar superficie** (§2.4, §2.5): cablear o retirar las 22 funciones huérfanas y las dos rutas
   ocultas; aplicar `canManageMembers`.
5. **Alimentar `audit_log`** (§2.11) desde los Application Services.
6. **Packs como dato** (§2.7) y paridad MCP (§2.6), cuando el producto lo requiera.
