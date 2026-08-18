# Nevermine Coach Platform — Master Documentation

> **Documento reconstruido por ingeniería inversa** del estado REAL del repositorio y de la base
> de datos a fecha **2026-08-13**. Todo lo aquí escrito procede de código fuente, migraciones
> aplicadas, esquema real de la base de datos y ejecución de la batería de tests. Lo que no se ha
> podido verificar se marca explícitamente como **[NO VERIFICADO]**. No se ha modificado la
> aplicación para producir este documento.
>
> Documento hermano: `docs/NEVERMINE_COACH_PLATFORM_AUDIT.md` (contradicciones, código muerto,
> riesgos y gap analysis).

---

## 1. Inventario del repositorio

### 1.1 Stack real

| Capa | Tecnología (versión en `package.json`) |
| --- | --- |
| Framework | TanStack Start `^1.168.26` + TanStack Router `^1.170.16` |
| Build | Vite `^8.0.16`, plugin `@lovable.dev/vite-tanstack-config` 2.12.0 |
| Runtime servidor | Edge/Worker (Nitro 3 beta), SSR |
| UI | React 19.2, Tailwind CSS 4.2 (`src/styles.css`), shadcn/ui sobre Radix |
| Estado servidor | TanStack Query `^5.101.1` |
| Backend | Supabase (`@supabase/supabase-js` ^2.110.9) vía Lovable Cloud |
| Validación | Zod `^4.4.3` |
| Tests | Vitest `^4.1.10` + scripts Python de integración |
| MCP | `@lovable.dev/mcp-js` ^0.25.0 (plugin Vite + ruta `/mcp`) |
| Gráficas | Recharts 2.15 |

No hay `tailwind.config.js` (Tailwind v4 por CSS). No hay `src/App.tsx` ni React Router.

### 1.2 Árbol de primer nivel (`src/`)

```
src/
├── components/app/      Shell, cabeceras, diálogos, paneles de fórmulas y pesos
├── components/ui/       shadcn/ui (no auditado en detalle: librería base)
├── hooks/               use-mobile
├── integrations/
│   ├── supabase/        client, client.server, auth-middleware, auth-attacher, types (autogen)
│   └── lovable/         integración de plataforma
├── lib/
│   ├── *.functions.ts   Server functions (capa de aplicación HTTP)
│   ├── services/        Application Services (agnósticos de canal)
│   └── mcp/             Runtime MCP + tools
├── modules/             CAPA DE DOMINIO PURA (sin Supabase, React ni HTTP)
│   ├── application-context/
│   ├── config/
│   ├── identity/
│   ├── metrics/domain/
│   ├── platform/        semver + knowledge-packages (motor de plataforma)
│   ├── sport-space/
│   ├── sports-organization/
│   └── starter-packs/   Adaptador Coach del motor de plataforma
├── routes/              Rutas de fichero TanStack (24 archivos)
├── router.tsx, start.ts, server.ts
docs/                    12 documentos de cierre de feature + este master
scripts/                 7 scripts Python de validación de aislamiento/RLS
supabase/migrations/     23 migraciones aplicadas
```

### 1.3 Métricas del repositorio (verificadas)

- **26 tablas** en el esquema `public`, todas con RLS habilitada.
- **23 migraciones** aplicadas (`20260728185923` → `20260731165657`).
- **~80 server functions** exportadas en `src/lib/*.functions.ts`.
- **6 tools MCP** registradas.
- **276 tests** Vitest: **271 pasan, 5 se saltan** (integración MCP, requieren runtime).
- **7 scripts** Python de validación multi-usuario de RLS.

---

## 2. Arquitectura real

### 2.1 Capas efectivas

```
┌───────────────────────── Canales ─────────────────────────┐
│  Web (rutas TanStack + React Query)   │   MCP (/mcp)      │
└───────────┬───────────────────────────┴─────────┬─────────┘
            │ server functions                    │ contextualTool
            │ src/lib/*.functions.ts              │ src/lib/mcp/tools/*
            ▼                                     ▼
   ┌─────────────────── requireSupabaseAuth ──────────────────┐
   │            + requireApplicationContext (cookie)          │
   │            + resolveMcpApplicationContext (claim JWT)    │
   └────────────────────────┬─────────────────────────────────┘
                            ▼
            Application Services  (src/lib/services/*.ts)
              contexto: { userId, sportSpaceId, supabase }
                            ▼
        ┌──────────── Dominio puro (src/modules/**) ───────────┐
        │  invariantes, máquinas de estado, parser/AST, semver │
        └──────────────────────────────────────────────────────┘
                            ▼
                  Supabase / PostgreSQL + RLS
```

Regla verificada por `rg`: **cero imports de Supabase/DB/HTTP dentro de `src/modules`**. El dominio
es puro y testeable sin infraestructura.

### 2.2 Contexto de aplicación (aislamiento)

- El ámbito de datos es **siempre** `sport_space_id`, nunca derivado de `owner_id`.
  Verificado: todos los `insert` que escriben `owner_id` lo marcan como *metadato de trazabilidad*
  (`config.functions.ts:62`, `org.functions.ts:38,90`, `services/config.service.ts:88`,
  `services/sports-organization.service.ts:328,365`).
- **Transporte web**: cookie httpOnly `nvm_active_sport_space` (`src/lib/application-context.server.ts`).
- **Transporte MCP**: claim `sportSpaceId` del JWT (`src/lib/mcp/application-context.ts:25,61-66`).
- **Resolución compartida**: `loadContextCandidates` (Memberships) + `resolveApplicationContext`
  (dominio puro, orden determinista: owner primero, luego antigüedad, luego id).
- Resultados posibles: `resolved` | `forbidden` | `empty`.

### 2.3 Autenticación

- `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`): extrae Bearer del request,
  valida con `supabase.auth.getClaims(token)`, crea un cliente Supabase **por petición** con el JWT
  del usuario → RLS se aplica como ese usuario.
- `attachSupabaseAuth` (cliente, registrado en `src/start.ts:29`): adjunta el token a cada RPC.
- `withClockSkewRetry` (`src/lib/jwt-skew.server.ts`): reintento ante "JWT issued at future".
- `supabaseAdmin` (service role, `client.server.ts`) existe pero se carga dinámicamente y sólo para
  operaciones de confianza server-side.

---

## 3. Modelo de datos real (26 tablas)

### 3.1 Bloques funcionales

| Bloque | Tablas |
| --- | --- |
| Identidad | `profiles`, `user_roles` |
| Organización de acceso | `sport_spaces`, `sport_space_members` |
| Organización deportiva | `sports`, `sport_categories`, `seasons`, `competitions`, `teams`, `players` |
| Catálogo de métricas | `metric_catalogs`, `catalog_versions`, `catalog_version_metrics`, `metric_groups`, `metrics`, `metric_formulas`, `metric_weights`, `validation_rules`, `valuation_profiles` |
| Observación y valoración | `event_types`, `observation_contexts`, `metric_values`, `valuations` |
| Distribución de conocimiento | `starter_pack_installations`, `starter_pack_installation_events` |
| Auditoría | `audit_log` |

### 3.2 Enums

`app_role`, `catalog_version_status`, `competition_type`, `data_source`, `entity_status`,
`metric_direction`, `metric_nature`, `metric_value_type`, `season_state`, `sport_space_role`,
`sport_space_type`, `starter_pack_installation_action`, `starter_pack_installation_status`,
`subject_scope`, `subject_type`, `valuation_status`.

### 3.3 Invariantes garantizados por la base de datos

- **Inmutabilidad histórica**: `forbid_delete()` en `audit_log`, `catalog_versions`, `metrics`,
  `valuations`, `sport_spaces`, eventos de instalación; `forbid_update_events()` en
  `starter_pack_installation_events`.
- **Versiones publicadas inmutables**: `guard_published_version()` (sólo se permite `published → retired`).
- **Contenido de versión sólo en borrador**: `guard_version_content()` sobre fórmulas, pesos, reglas
  y métricas de versión.
- **Valoraciones inmutables**: `guard_valuation_immutability()`; corregir = nueva valoración +
  marcar la anterior `superseded` (ADR-001).
- **Sólo métricas primarias se registran**: `guard_primary_metric_value()`; las derivadas se calculan.
- **Código de métrica inmutable**: `guard_metric_code()`.
- **Un SportSpace conserva siempre un Owner**: `enforce_last_owner_remains()`; el primer miembro debe
  ser Owner: `enforce_first_member_is_owner()`.
- **Dual write de ámbito**: `sync_sport_space_id()` en BEFORE INSERT/UPDATE de 10 tablas de negocio.
- **Una sola temporada activa por deporte**: índice único parcial (FEATURE-004.1).
- `updated_at` mantenido por `set_updated_at()`.

### 3.4 Modelo de autorización (RLS)

Toda política se apoya en funciones `SECURITY DEFINER` con `search_path = public`:

- Raíz: `can_access_space(uuid)` → existe Membership del `auth.uid()` en ese SportSpace.
- Derivadas por recurso: `can_access_season`, `can_access_competition`, `can_access_team`,
  `can_access_player`, `can_access_category`, `can_access_context`, `can_access_subject`.
- Catálogo: `can_read_catalog`, `can_read_version`, `can_read_metric`,
  `can_read_valuation_profile`, `can_write_catalog` (permite catálogos de plataforma con
  `sport_space_id IS NULL` a rol `admin`).
- Administración: `can_admin_space` / `is_sport_space_owner`.
- Bootstrap controlado: `can_bootstrap_sport_space_membership` (sólo el creador y sólo si no hay
  ninguna Membership todavía).
- Resolución de ámbito en escritura: `resolve_sport_space_for_user` / `ensure_personal_sport_space`.

Las funciones se usan tanto en `USING` como en `WITH CHECK`, cerrando la "inyección referencial"
(apuntar un recurso propio a un padre ajeno).

**Linter de base de datos**: 20 avisos, todos de la misma categoría —
*"Signed-In Users Can Execute SECURITY DEFINER Function"*. Son las funciones predicado que la propia
RLS necesita invocar como `authenticated`; ningún ERROR. Ver auditoría §Riesgos.

---

## 4. Capa de aplicación (backend)

### 4.1 Server functions por archivo

| Archivo | Funciones | Middleware predominante |
| --- | --- | --- |
| `application-context.functions.ts` | `getApplicationContext`, `setApplicationContext` | `requireSupabaseAuth` |
| `config.functions.ts` | deportes, temporadas, competiciones, catálogos, versiones, grupos, métricas (~22) | mixto: `requireApplicationContext` en listas/creaciones, `requireSupabaseAuth` en updates |
| `formulas.functions.ts` | `listFormulas`, `listCatalogMetricRefs`, `upsertFormula`, `deleteFormula` | `requireSupabaseAuth` |
| `identity.functions.ts` | `getCurrentUser` | `requireSupabaseAuth` |
| `memberships.functions.ts` | listar/añadir/cambiar rol/eliminar miembros | `requireSupabaseAuth` |
| `org.functions.ts` | equipos y jugadores | `requireApplicationContext` (lecturas/creación) |
| `sport-spaces.functions.ts` | `listSportSpaces`, `getSportSpace`, `createSportSpace` | `requireSupabaseAuth` |
| `sports-organization.functions.ts` | overview, categorías, temporadas, competiciones, equipos (8) | `requireApplicationContext` (100 %) |
| `starter-packs.functions.ts` | catálogo, instalación, actualización, rollback, versionado, merge, distribución, historia (~21) | `requireApplicationContext` |
| `weights.functions.ts` | perfiles y pesos de valoración | mixto |

### 4.2 Application Services (`src/lib/services/`)

| Servicio | Responsabilidad | Nota |
| --- | --- | --- |
| `service-context.ts` | Contrato `ApplicationServiceContext = { userId, sportSpaceId, supabase }` | agnóstico de canal |
| `config.service.ts` | Lecturas/creaciones de temporadas, competiciones, catálogos, métricas | filtra por RLS; sólo `createSeasonService` fija `sport_space_id` explícito |
| `sports-organization.service.ts` | Motor organizativo FEATURE-004.1 | **único servicio que filtra `.eq("sport_space_id", ctx.sportSpaceId)` en todas las queries** |
| `weights.service.ts` | Perfiles y pesos (también usado por MCP) | |
| `pack-installation.ts` | Adaptador Coach del Installation Engine: `SupabaseInstallationManifestStore` + `CoachStarterPackExecutor` (RPC `install_starter_pack`) | único punto de persistencia del motor de conocimiento |
| `starter-packs.service.ts` | Orquestación completa del motor de Starter Packs (525 líneas) | delega toda regla al dominio |

### 4.3 Canal MCP

- Ruta `/mcp` (autogenerada), OAuth con emisor directo de Supabase.
- 6 tools: `list_seasons`, `list_competitions`, `list_catalogs`, `list_metrics`,
  `list_valuation_weights`, `create_season`.
- `contextualTool` (`src/lib/mcp/application-context.ts:86-133`) resuelve el mismo
  `ApplicationContext` que la web, ejecuta el mismo Application Service y registra la ejecución.
- Cliente Supabase con el token del cliente MCP: **RLS como usuario**, nunca service role.

---

## 5. Frontend

### 5.1 Rutas

| Ruta | Función |
| --- | --- |
| `/` | Landing pública |
| `/auth` | Alta e inicio de sesión |
| `/_authenticated/*` | Gate de sesión (redirige a `/auth`) |
| `/app` | Panel de inicio |
| `/app/organizacion` | Vista central FEATURE-004.1 (deporte → temporada → competiciones/equipos) |
| `/app/deportes`, `/app/temporadas`, `/app/competiciones`, `/app/equipos`, `/app/jugadores` | CRUD por entidad |
| `/app/catalogos`, `/app/catalogos/$catalogId` | Catálogos, versiones, grupos, métricas, fórmulas y pesos |
| `/app/packs` | Starter Packs: instalación y actualizaciones |
| `/app/trazabilidad` | Timeline y estado reconstruido del conocimiento |
| `/app/miembros`, `/app/sportspaces` | Administración de SportSpace **(funcionales pero no enlazadas en el menú)** |
| `/mcp`, `/.mcp/*`, `/.well-known/oauth-protected-resource`, `/.lovable.oauth.consent` | Superficie MCP/OAuth |

### 5.2 Patrones

- Datos siempre por **server function + TanStack Query**; los `loader` de ruta no cargan datos de
  dominio (evita el 401 de prerender en funciones protegidas).
- `AppShell` (`src/components/app/app-shell.tsx`) contiene la navegación y el `SportSpaceSwitcher`.
- Paneles reutilizables: `formulas-panel.tsx`, `weights-panel.tsx`, `form-dialog.tsx`, `page-header.tsx`.
- Idioma: español en toda la interfaz.

---

## 6. Motor de métricas (dominio)

`src/modules/metrics/domain/` — agnóstico del deporte por diseño (sin un solo código de métrica).

- `types.ts`: entidades del motor (Sport, MetricCatalog, CatalogVersion, Metric, MetricWeight,
  ValuationProfile, MetricValue…).
- `formula/parser.ts`: parser recursivo-descendente → AST (`FormulaSyntaxError`).
- `formula/ast.ts`: nodos, funciones permitidas, `collectDependencies`.
- `formula/evaluator.ts`: `evaluateFormula` con políticas de nulos y `validateFormulaGraph`
  (detección de ciclos y referencias inválidas por DFS).
- `valuation.ts`: `DEFAULT_ALGORITHM = "weighted_sum_v1"`, `resolveDerivedValues`, `selectWeights`
  (peso del ámbito más específico), `computeValuation` (suma ponderada con signo y breakdown).

Estado de integración: la **validación** de fórmulas y pesos sí está cableada (vía
`src/modules/config/formula-rules.ts` y `weight-rules.ts` → `formulas.functions.ts`,
`weights.functions.ts`). El **cálculo** (`evaluateFormula`, `computeValuation`, `resolveDerivedValues`,
`selectWeights`) **no tiene ningún consumidor en la aplicación** — ver auditoría.

---

## 7. Knowledge Distribution Engine

### 7.1 Plataforma (`src/modules/platform/knowledge-packages/`)

| Submódulo | Contenido |
| --- | --- |
| `types.ts`, `repository.ts` | `KnowledgePackageDescriptor`, repositorio in-memory con índice por id+versión |
| `certification.ts` | Certificación automática (descriptor + integridad + compatibilidad + dependencias) |
| `lifecycle.ts` | Máquina `draft→review→certified→published→deprecated→archived`; sólo `published` es instalable |
| `governance.ts` | `Publisher`, `TrustLevel` (`official…experimental`), `PublisherRegistry` |
| `publication.ts` | Política de publicación + `PublicationAuditLog` append-only |
| `validation.ts`, `integrity.ts`, `compatibility.ts`, `dependencies.ts` | Validación estructural, checksum FNV-1a, semver, orden topológico |
| `installation/` | `InstallationService` (install/update/rollback/uninstall), manifiesto y puertos de ejecución |
| `versioning/` | `VersioningService`, snapshots inmutables, `VersionGraph` |
| `comparison/` | Diff determinista y veredicto de compatibilidad |
| `merge/` | Fusión determinista con conflictos INFO/WARNING/BLOCKING y procedencia |
| `distribution/` | Canales `stable|preview|internal`, políticas `automatic|notify|manual`, registro de publicaciones |
| `history/` | Store append-only sellado, timeline, audit trail, `reconstructState`, informe de trazabilidad |

`platform/semver.ts` da soporte a todo lo anterior.

### 7.2 Adaptador Coach (`src/modules/starter-packs/`)

- `waterpolo.ts`: **único pack real**, `waterpolo_base` v1.0.0, 5 grupos (ataque, defensa, portería,
  disciplina, participación), ~19 métricas primarias y derivadas (`eficacia_tiro`,
  `eficacia_penalti`, `eficacia_superioridad`…), definido **en código fuente, no en base de datos**.
- `repository.ts`: catálogo Coach y singleton `knowledgePackages`.
- `rules.ts`, `version.ts`, `install-plan.ts`, `installation.ts`, `knowledge-package.ts`,
  `versioning.ts`, `comparison.ts`, `merge.ts`, `distribution.ts`, `history.ts`: envoltorios que
  aplican el motor genérico al dominio de Coach.

### 7.3 Persistencia del motor

Sólo dos tablas: `starter_pack_installations` (estado por SportSpace y pack) y
`starter_pack_installation_events` (historial append-only inmutable). Todo lo demás —catálogo,
lifecycle history, publisher registry, audit log de publicación, grafo de versiones, registro de
distribución, history store— vive **en memoria del proceso** y se reinicializa en cada arranque.

---

## 8. Tests y verificación

- **Vitest**: 276 tests, 271 verdes, 5 saltados (integración MCP). Cobertura concentrada en el
  dominio: métricas, application-context, sport-space, sports-organization, config
  (fórmulas/pesos) y todo el Knowledge Engine (lifecycle, governance, versioning, comparison,
  merge, distribution, history, installation).
- **Scripts Python** (`scripts/`), validación real multi-usuario contra la base de datos:
  `rls-isolation-test.py`, `rls-cross-reference-test.py`, `rls-authorization-matrix-test.py`,
  `sport-space-isolation-test.py`, `membership-isolation-test.py`, `ownership-migration-test.py`,
  `application-context-test.py`.
- **Sin tests de UI/E2E** en el repositorio.

---

## 9. Historia funcional reconstruida

| Hito | Contenido entregado |
| --- | --- |
| Fase 0 | Esquema genérico de métricas, RLS por `owner_id`, motor de fórmulas, arquitectura modular |
| Fase 1A–1E | CRUD de temporadas, motor de fórmulas y valoración, equipos y jugadores, Starter Packs, MCP + OAuth |
| EPIC-002 (002.1–002.7) | SportSpace, Membership, migración de propiedad (dual write), RLS por Membership, ApplicationContext, MCP contextual, certificación del Engine |
| EPIC-003 (003.1–003.10) | Starter Packs oficiales, Knowledge Packages, lifecycle, gobierno, instalación/rollback, versionado, comparación, merge, distribución, historia y trazabilidad |
| FEATURE-004.1 | Sports Organization: Sport, Category, Season con máquina de estados, Competition, Team |

Cada hito tiene su documento de cierre en `docs/`.

---

## 10. Configuración y despliegue

- Variables cliente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Secretos backend: `LOVABLE_API_KEY`, `SUPABASE_*` (gestionados por la plataforma).
- `vite.config.ts` registra el plugin MCP; `src/routes/mcp.ts` es autogenerado.
- Sin buckets de almacenamiento. Sin edge functions de Supabase (todo con `createServerFn`).
- Observabilidad: `src/lib/error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts` y
  `consoleToolExecutionLogger` para MCP. **No hay métricas, trazas ni alertas.**

---

## 11. Especificación de replicación

Para reconstruir la plataforma desde cero:

1. Proyecto TanStack Start + Tailwind 4 + shadcn/ui + Supabase.
2. Aplicar las 23 migraciones en orden cronológico (crean 26 tablas, 16 enums, 36 funciones y 60+
   triggers/políticas).
3. Implementar `src/modules/` primero: dominio puro y sus tests, sin infraestructura.
4. Añadir `requireSupabaseAuth` + `requireApplicationContext` y el repositorio de Memberships.
5. Escribir Application Services con el contrato `{ userId, sportSpaceId, supabase }`.
6. Exponer server functions finas y, sobre el mismo servicio, las tools MCP con `contextualTool`.
7. Construir la UI consumiendo exclusivamente server functions vía TanStack Query.
8. Validar el aislamiento con los scripts Python multi-usuario antes de dar por buena cualquier
   política RLS.

---

## 12. Current Implementation Status (18 Ago 2026)

| Área | Estado |
| --- | --- |
| Sports Organization (Sport, Category, Season, Competition, Team) | **IMPLEMENTED — CONSOLIDATED** |
| Línea autoritativa | **SINGLE** (`UI → src/lib/sports-organization.functions.ts → Application Service → Dominio → Persistencia`) |
| Datos legacy organizativos incompatibles | **REMOVED** (Fase C, migración `20260818151253`) |
| Campos organizativos obligatorios (`seasons.sport_id`, `teams.season_id`, `teams.category_id`) | **ENFORCED** (NOT NULL + validación de aplicación) |
| Autorización de producto | **ENFORCED** — Authority por rol (`ORG_POLICY`) resuelta desde `sport_space_members`; RLS como segunda barrera |
| Aislamiento SportSpace | ENFORCED (RLS + `requireApplicationContext`) |
| Canal MCP | ALINEADO con la misma línea autoritativa |
| Players | OPERATIVO (`players.service.ts`) |
| Observation / Valuation | Sin cambios de madurez en esta remediación; sin regresión detectada |
| Deploy / publicación | **PENDIENTE** (no ejecutado) |

### Deuda registrada

- Columnas legacy `seasons.status` y `teams.category`: pendientes de retirada.
- Histórico de plantilla Player ↔ Season: inexistente.
- Ruido de formato (`prettier/prettier`) preexistente en todo el repositorio.
