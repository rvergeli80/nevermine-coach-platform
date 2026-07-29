# FEATURE-002.4 — Cambios anticipados (trabajo detenido)

Se detectó un error de secuencia en el roadmap: parte de FEATURE-002.4 se inició
antes de cerrar FEATURE-002.3. Ese trabajo **queda detenido y NO se elimina**.
Este documento inventaría exactamente qué se introdujo antes de tiempo, para que
FEATURE-002.4 lo retome (o lo revierta) de forma consciente.

## 1. Base de datos — predicados de acceso (SECURITY DEFINER)

Creados antes de tiempo (migraciones `20260729130434`, `20260729130504`, `20260729130532`):

- `can_access_space(uuid)`, `can_admin_space(uuid)`
- `is_sport_space_member(uuid)`, `is_sport_space_owner(uuid)`
- `can_bootstrap_sport_space_membership(uuid)`
- Validación referencial: `can_access_team`, `can_access_player`,
  `can_access_season`, `can_access_competition`, `can_access_context`,
  `can_access_subject`, `can_use_sport`
- Catálogo: `can_read_catalog`, `can_write_catalog`, `can_read_metric`,
  `can_read_version`, `can_read_valuation_profile`

## 2. Base de datos — políticas RLS

Las políticas de las tablas de negocio ya evalúan `sport_space_id` + Membership
en lugar de `owner_id`. Afecta a: `sports`, `metric_catalogs`, `seasons`,
`competitions`, `teams`, `players`, `observation_contexts`, `metric_values`,
`valuations`, `audit_log`, `metric_groups`, `metrics` y tablas de versión.

## 3. Base de datos — endurecimiento de privilegios

`REVOKE ALL` sobre funciones públicas para `PUBLIC`/`anon` y `GRANT EXECUTE`
selectivo a `authenticated` sobre los predicados usados por RLS.

## 4. Dominio (TypeScript)

`src/modules/sport-space/sport-space.ts`:

- Añadidas `canAccessSportSpace(memberships, sportSpaceId, userId)` y
  `canAdminSportSpace(...)` — pertenecen a FEATURE-002.4.
- `canReadSportSpace(space, userId)` fue eliminada por error; **se ha
  restaurado** porque es el modelo de acceso vigente durante 002.3. Será
  FEATURE-002.4 quien la retire formalmente.

## 5. Estado

Ninguno de estos cambios altera el comportamiento funcional exigido por
FEATURE-002.3 (Dual Write, backfill, integridad, idempotencia y reversibilidad
se han verificado en verde con las políticas actuales). El trabajo de 002.4 se
retoma cuando esa Feature se apruebe explícitamente.
