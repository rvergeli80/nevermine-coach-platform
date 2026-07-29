# FEATURE-002.4 — Cierre formal: Seguridad y Row Level Security

Estado: **Completada y validada** (18/18 escenarios de la matriz, 37/37 propiedad, 66/66 unitarios).

## 1. Principio consolidado

La RLS es la **única fuente de autorización a nivel de datos**. El acceso se
deriva exclusivamente de `sport_space_id` + Membership (`sport_space_members`).
`owner_id` y `created_by` se conservan como trazabilidad/autoría, nunca como
criterio de autorización.

## 2. Consolidación del dominio

- Eliminada `canReadSportSpace()` (modelo antiguo, acceso por creador).
- Modelo único: `canAccessSportSpace()` (Membership) y `canAdminSportSpace()` (Owner).
- `src/lib/starter-packs.functions.ts`: la unicidad de catálogo se valida por
  SportSpace vía RLS, sin filtro por `owner_id`.
- `src/routes/_authenticated/app/deportes.tsx`: la editabilidad depende de
  `sport_space_id`, no de `owner_id`.

## 3. Correcciones aplicadas en esta consolidación

| Problema detectado | Causa | Corrección |
|---|---|---|
| `INSERT ... RETURNING` sobre `sport_spaces` fallaba con 42501 (rompía la creación desde la app) | La ventana de bootstrap se evaluaba con `can_bootstrap_sport_space_membership()`, que lee `sport_spaces` y no ve la fila recién insertada (instantánea de la sentencia) | Nueva política `sport_spaces_select`: `is_sport_space_member(id) OR (created_by = auth.uid() AND NOT sport_space_has_members(id))`; el nuevo predicado sólo consulta membresías |
| Un Coach invitado no podía crear datos en su SportSpace | El Dual Write derivaba `sport_space_id` de `owner_id`, generando un espacio personal ajeno a su Membership | `resolve_sport_space_for_user()`: resuelve el espacio por **pertenencia** del autor (única pertenencia → esa; varias → prioriza Owner). `sync_sport_space_id()` la utiliza |
| Primera escritura de un usuario sin SportSpace rechazada | `can_access_space()` era `STABLE` y no veía el espacio/membresía creados por el trigger de la misma sentencia | `can_access_space()` pasa a `VOLATILE` (misma semántica de autorización) |
| Un SportSpace sin Owner (residuo de diagnóstico) | — | Inicializado con `ensure_sport_space_owner()` |

Descartado: crear el espacio personal en el alta (`handle_new_user`) — desviaba
los datos del Coach invitado a su espacio privado.

## 4. Permisos sobre funciones

Predicados `SECURITY DEFINER`: `REVOKE ALL` a `PUBLIC`/`anon` y `GRANT EXECUTE`
selectivo a `authenticated` sólo donde la política lo requiere.
`resolve_sport_space_for_user()` no es invocable por `authenticated` (uso interno
del trigger).

## 5. Matriz de validación

`scripts/rls-authorization-matrix-test.py` — 18 escenarios reales con usuarios
distintos: Owner (A1–A3), Coach (B1–B3), aislamiento entre espacios (C1–C2),
ausencia de Membership (D1–D2), revocación de Membership (E1–E4), fugas en
listados globales (F1–F2) y rechazo de `owner_id`/`sport_space_id` ajenos (G1–G2).

Resto de la batería: `rls-isolation-test.py`, `rls-cross-reference-test.py`,
`membership-isolation-test.py`, `ownership-migration-test.py` — todos en verde.

## 6. Clasificación de referencias a `owner_id`

- **Trazabilidad/autoría (se mantiene)**: columnas `owner_id` en tablas de datos,
  su envío en las escrituras y su uso por `sync_sport_space_id` como respaldo.
- **Autorización (eliminado)**: filtros `.eq("owner_id", userId)` con intención
  de aislamiento y políticas RLS basadas en `owner_id`.
- **Deuda pendiente (fuera de alcance)**: eliminación física de `owner_id`
  (FEATURE-002.5+), selector de SportSpace, permisos granulares y auditoría.
