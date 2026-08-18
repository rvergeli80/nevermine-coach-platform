# REMEDIATION-004 — Coach Organizational Cutover (PLAN, read-only)

## 1. Executive summary
Existen dos líneas de escritura para Season, Competition y Team: la nueva (`/app/organizacion` → `sports-organization.functions.ts` → `SportsOrganizationService` → dominio) y la legacy (`/app/temporadas`, `/app/competiciones`, `/app/equipos` → `config.functions.ts` / `org.functions.ts` → CRUD directo). El plan consolida la línea nueva como única autoritativa, migra los datos legacy, endurece el esquema y añade Authority explícita en los Application Services, en 6 etapas separadas (código → datos → UI → authorization → endurecimiento → retirada legacy).

## 2. Estado real inspeccionado (A1)
- Rama: `edit/edt-a8abefcd-d26b-4526-8be8-b6e6ff1785a1`; commit `3682d358b6e46947b289e292617d375bdd860ee7` (18 Ago 2026, "Inspección read-only Nevermine"); working tree limpio.
- Remotos: `origin` (storage interno Lovable) y `secondary` (S3). **SYNC STATUS — UNKNOWN / NOT EVIDENCED** para Lovable ↔ GitHub.
- Migración más reciente en repo: `20260731165657_9ee3055b...sql`.
- Datos (entorno cloud actual, consulta directa): 1 `sport` (Waterpolo, `sport_space_id` NULL = deporte de plataforma), 5 `seasons` (todas `sport_id` NULL, `state='draft'`, `status='active'`), 9 `teams` (todos `sport_id`=Waterpolo, `season_id` NULL, `category` NULL, `category_id` NULL), 7 `players`, 0 `sport_categories`, 0 `competitions`, 3 `observation_contexts` con `season_id` NULL y `team_id` informado. Cada fila vive en un SportSpace distinto (datos de pruebas de aislamiento).

## 3. Línea autoritativa Current vs Target (A2 / B)

| Entidad | Op | Current legacy | Current nuevo | Target |
|---|---|---|---|---|
| Sport | list/create | `config.functions.listSports/createSport` (contexto OK) | — | conservar en config.functions, mover a `sports-organization` service |
| Sport | update | `updateSport` (**sólo `requireSupabaseAuth`**, sin contexto) | — | migrar a servicio autoritativo + contexto + rol |
| Category | list/create/update | — | `sports-organization.functions` | único camino (ya OK) |
| Season | list | `config.listSeasons` (service sin filtro por SportSpace) | `getOrganizationOverview` | overview + `listSeasons` filtrado por contexto |
| Season | create | `config.createSeason` (sin `sport_id`) | `createOrganizationSeason` | sólo el nuevo |
| Season | update/state | `config.updateSeason` (`status`, auth-only) | `changeSeasonState` (`state`) | `changeSeasonState` + `updateSeason` reescrito sobre el servicio |
| Competition | list | `config.listCompetitions` | overview | overview / service |
| Competition | create/update | `config.createCompetition` (sin `sport_id` ni `type`) | `createOrganizationCompetition` | sólo el nuevo (+ `updateOrganizationCompetition` nuevo) |
| Team | list | `org.listTeams` | overview | service con filtro de contexto |
| Team | create/update | `org.createTeam/updateTeam` (sin `season_id`/`category_id`; update auth-only) | `createOrganizationTeam` | sólo el nuevo (+ `updateOrganizationTeam` nuevo) |
| Player | list/create/update | `org.functions` (update auth-only) | — | permanece Coach Product, pero con contexto + rol y equipos leídos del modelo autoritativo |

Capas Target: UI → Server Function (transporte) → `sports-organization.service` (Coach Product Application Service, valida contexto + Authority) → `src/modules/sports-organization` (dominio puro) → Supabase (adaptador). RLS = defensa en profundidad. No se usa el término "Engine".

## 4. Consumidores legacy (A3)
- `config.functions.ts`: `/app/deportes`, `/app/temporadas`, `/app/competiciones`, `/app/equipos` (listSports), `/app/catalogos/*`, `weights-panel.tsx`, `/app/index.tsx`. **No eliminar el archivo**: catálogos, versiones, grupos y métricas siguen siendo necesarios; sólo se extraen Sport/Season/Competition.
- `org.functions.ts`: `/app/equipos`, `/app/jugadores`. Se conserva sólo la parte Player.
- `config.service.ts`: consumido además por MCP (`list-seasons`, `create-season`, `list-competitions`, `list-catalogs`, `list-metrics`) y por dos tests MCP → cualquier cambio de firma exige actualizar las herramientas MCP en el mismo paso.
- `sports-organization.functions.ts`/`service.ts`: sólo `/app/organizacion`.
- Navegación (`app-shell.tsx`): entradas Deportes, Organización, Temporadas, Competiciones, Equipos, Jugadores.

## 5. Matriz de archivos
- Conservar: `modules/sports-organization/*`, `services/sports-organization.service.ts`, `sports-organization.functions.ts`, `routes/.../organizacion.tsx`, `jugadores.tsx`.
- Modificar: `config.functions.ts` (quitar Season/Competition, reencaminar Sport), `config.service.ts` (Season/Competition delegan al servicio autoritativo, filtrado por SportSpace), `org.functions.ts` (sólo Player, con contexto + rol), rutas legacy (reencaminadas o redirigidas), `app-shell.tsx`, herramientas MCP de seasons/competitions.
- Deprecar temporalmente: `createSeason`, `updateSeason`, `createCompetition`, `updateCompetition`, `createTeam`, `updateTeam` (wrappers que delegan y avisan) durante una etapa.
- Eliminar después del cutover de UI: esos wrappers y las columnas legacy.

## 6. Mapping fila por fila (C1/C2)
- 1 sport Waterpolo (plataforma): DETERMINISTIC, sin cambios.
- 5 seasons `sport_id` NULL, con un único deporte disponible en el sistema: **HIGH CONFIDENCE** → Waterpolo. Requiere confirmación humana por lote (no automático).
- 9 teams `season_id` NULL: en cada SportSpace no existe temporada asociada (las 5 temporadas están en SportSpaces distintos a los de los equipos) → **UNMAPPABLE / HUMAN DECISION REQUIRED**: o se crea una "Temporada de regularización" por SportSpace, o se archivan los equipos como datos de prueba.
- 9 teams `category_id` NULL y 0 categorías existentes → **UNMAPPABLE**: no se inventan categorías; requiere decisión de producto (crear categoría "Sin clasificar" por deporte, o mantener `category_id` nullable).
- 7 players → team: 6 DETERMINISTIC (team del mismo SportSpace), 1 con `team_id` NULL → queda sin equipo (permitido hoy).
- 3 observation_contexts con `season_id` NULL: **HUMAN DECISION REQUIRED** (heredar la temporada del equipo tras el backfill, o dejarlos históricos sin temporada; la inmutabilidad del histórico sugiere no tocarlos).
- 0 competitions, 0 categories: nada que migrar.

### Decisiones HUMAN DECISION REQUIRED
1. ¿Los 9 equipos y 5 temporadas actuales son datos de prueba archivables o deben conservarse y regularizarse?
2. ¿`teams.category_id` pasa a obligatorio (exige categoría "Sin clasificar") o permanece opcional?
3. ¿Se retro-asigna temporada a los observation_contexts existentes?
4. Política de roles: ¿`coach` puede crear/editar estructura organizativa o sólo `owner`?

## 7. Plan de migración por etapas (C3/C4/C5)
Cada etapa es una migración separada, con verificación previa y posterior y sin ejecutar aún.
1. **Preflight**: snapshot lógico (`create table _bkp_seasons/_bkp_teams as select *`), conteo de filas afectadas, informe de nulos.
2. **Categorías**: sólo si la decisión 2 lo aprueba (`insert` de categoría por deporte). Reversible.
3. **`seasons.sport_id`**: `update seasons set sport_id = <waterpolo> where sport_id is null` — sólo tras aprobación; esperado 5 filas. Rollback desde backup.
4. **Normalizar `seasons.state`** a partir de `status` (`active→draft/active` según decisión), documentando la tabla de equivalencia; `status` permanece hasta que no queden consumidores.
5. **`teams.season_id`** y **`teams.category_id`**: sólo por decisión explícita; si se archivan los equipos, `status='archived'` en lugar de backfill.
6. **Verificaciones**: Player→Team mismo SportSpace; contextos→Season/Team coherentes; ausencia de relaciones cross-SportSpace.
7. **Endurecimiento** (etapa posterior, sólo con 0 nulos y sin consumidores legacy): `seasons.sport_id NOT NULL`, `teams.season_id NOT NULL`, opcional `teams.category_id NOT NULL`, índices únicos no parciales (nombre por temporada, categoría por deporte, competición por temporada), trigger que rechace estructura nueva sobre temporadas `closed/archived`.
8. **Retirada de columnas legacy** (`seasons.status`, `teams.category`) en una migración final, nunca en la misma que el backfill.

## 8. Plan de UI (D)
Recomendación: **opción 2** — conservar las rutas especializadas (`/app/temporadas`, `/app/competiciones`, `/app/equipos`, `/app/deportes`, `/app/jugadores`) pero reconectarlas al mismo Application Service autoritativo, y mantener `/app/organizacion` como vista transversal (árbol Deporte → Temporada → Categoría/Competición/Equipo). Menor riesgo de regresión, sin enlaces rotos, sin duplicar lógica (la duplicación desaparece en la capa de servicio, no en la de rutas). Se añade la superficie que falta: gestión de Categorías (hoy sólo en Organización).
Matriz de preservación: cada pantalla actual conserva su funcionalidad; el cambio es el server function que consume y los campos obligatorios nuevos (deporte en temporada; temporada y categoría en equipo; tipo en competición).
Estados a cubrir en todas: loading, empty, error, forbidden (rol insuficiente), datos legacy pendientes de normalizar (aviso), temporada inexistente, temporada cerrada (acciones deshabilitadas con motivo), categoría inexistente, relación inválida.

## 9. Authorization (E) — propuesta mínima
Guard en el Application Service: `assertCan(context, action)` con `owner | coach` resueltos desde `sport_space_members` del SportSpace activo. Propuesta a aprobar: lectura de todo el modelo organizativo = owner + coach; creación/edición de deporte, categoría, temporada y cambios de estado = owner; competición, equipo y jugador = owner + coach; borrado = no existe (sólo archivado); históricos = lectura para ambos. Toda query protegida incluye `sport_space_id` del contexto; RLS se mantiene; la UI oculta acciones pero no es enforcement; nunca se deriva ámbito de `owner_id`.

## 10. Tests (F)
Dominio (invariantes ya existentes + estructura sobre temporada cerrada), Application Services (contexto obligatorio, contexto ajeno denegado, rol insuficiente denegado, sin bypass legacy, Player limitado a equipos del SportSpace activo), persistencia (0 nulos, FKs, únicos, rollback, migración reproducible), seguridad (scripts existentes en `scripts/` ampliados a cross-SportSpace read/write, manipulación de IDs, acceso directo a server functions), UI (navegación, CRUD, forbidden, empty, persistencia tras recarga), regresión (Players, Observación, Valoración, Starter Packs, Membership, cambio de SportSpace, herramientas MCP de seasons/competitions).

## 11. Rollback y despliegue (G)
Cinco entregas independientes: (1) unificación de código — reversible por revert; (2) migración de datos — reversible desde tablas `_bkp_*`, punto de no retorno tras eliminar backups; (3) cutover de UI — reversible; (4) endurecimiento de schema — reversible con `drop not null`; (5) retirada de columnas legacy — **irreversible**, exige backup y validación previa. Merge ≠ deploy: cada migración se aplica manualmente con aprobación y validación post-deploy (conteos y smoke test del flujo Temporada → Equipo → Jugador → Observación).

## 12. Riesgos
- HARD: escrituras legacy que sigan creando filas incompletas durante el cutover; pérdida de datos al endurecer sin backfill; MCP roto por cambio de firma en `config.service`.
- CONDITIONAL: equipos sin temporada asignable; normalización `status`↔`state` con semántica ambigua; índices únicos parciales que hoy no protegen nada.
- DEBT: sin histórico de plantilla Player ↔ Season (se registra explícitamente); `audit_log` sin escrituras; Knowledge Packages in-memory.

## 13. Criterios de aceptación y secuencia
Los del enunciado, más `docs/REMEDIATION-004-cierre.md`. Secuencia propuesta: A) unificar servicios y server functions con deprecación temporal → B) reconectar UI y añadir Categorías → C) guards de Authority + tests → D) preflight y backfill aprobado → E) endurecimiento → F) retirada de wrappers y columnas legacy → G) documento de cierre.

REMEDIATION-004 PLAN COMPLETED — NO FILES, CODE, DATABASE, CONFIGURATION, COMMITS OR DEPLOYMENTS WERE MODIFIED.
