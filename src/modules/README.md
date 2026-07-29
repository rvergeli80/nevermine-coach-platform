# Arquitectura de módulos — Nevermine Coach

Organización por capas, con dependencias en un solo sentido.

```text
routes/            Rutas y pantallas (Fase 0: mínimas y temporales)
  auth.tsx           Acceso público (correo/contraseña + Google)
  _authenticated/    Subárbol protegido por la puerta de sesión
lib/*.functions.ts Server functions (RPC tipado hacia el backend)
modules/           Dominio y aplicación, sin React ni acceso directo a datos
  identity/          Usuario, perfil y roles
  sport-space/       Agregados SportSpace y Membership (bounded context)
  metrics/domain/    Motor de métricas (capa pura)
integrations/      Clientes generados de la plataforma (no editar)
```

Reglas:

- `modules/metrics/domain` es **puro**: sin React, sin red, sin SQL y **sin
  conocimiento de ningún deporte**. Ningún código de métrica concreto puede
  aparecer en el código fuente; todo procede de la configuración en base de datos.
- Las rutas no acceden a la base de datos: llaman a server functions.
- Las server functions no contienen reglas de dominio: delegan en `modules/`.
- Dependencias permitidas: `routes -> lib -> modules -> (nada)`. Sin ciclos.

## Motor de métricas

| Pieza | Fichero |
| --- | --- |
| Tipos del dominio | `metrics/domain/types.ts` |
| Árbol de fórmula (persistido en JSON) | `metrics/domain/formula/ast.ts` |
| Analizador de expresiones textuales | `metrics/domain/formula/parser.ts` |
| Evaluación y validación semántica | `metrics/domain/formula/evaluator.ts` |
| Selección de pesos y valoración | `metrics/domain/valuation.ts` |

La expresión textual de la V1 y un futuro editor visual producen el **mismo
árbol**: el evaluador no cambia al sustituir el editor.

## Invariantes garantizados en base de datos

- El código de una métrica es inmutable (trigger).
- Las métricas, versiones, valoraciones y auditoría no se eliminan (trigger).
- Una versión publicada sólo puede retirarse; su contenido es inmutable (trigger).
- Sólo se registran valores de métricas primarias (trigger).
- Una valoración no se modifica: se genera otra y la anterior se marca como reemplazada (trigger).
- Aislamiento por entrenador mediante RLS sobre `owner_id = auth.uid()`.

## FEATURE-002.3 — Migración del modelo de propiedad (Dual Write)

Todas las tablas de negocio (`sports`, `metric_catalogs`, `seasons`,
`competitions`, `teams`, `players`, `observation_contexts`, `metric_values`,
`valuations`, `audit_log`) incorporan `sport_space_id`. **`owner_id` y
`created_by` se conservan**: la autorización (RLS) sigue basándose en
`owner_id` hasta FEATURE-002.4.

- **Doble escritura**: trigger `<tabla>_sync_sport_space` (BEFORE INSERT OR
  UPDATE) rellena `sport_space_id` a partir de `owner_id` mediante
  `ensure_personal_sport_space(uuid)`. Es transparente para el backend: no hay
  que enviar `sport_space_id` desde la aplicación.
- **Resolución del SportSpace**: 1) espacio donde el usuario ya es Owner;
  2) espacio creado por el usuario (se le añade la membresía Owner);
  3) creación de un SportSpace `personal` con su membresía Owner.
- **Inicialización de membresías**: `ensure_sport_space_owner(uuid)` garantiza
  que ningún SportSpace quede sin Owner, usando `created_by` sólo como dato
  histórico de arranque. Esta excepción desaparece al cerrar EPIC-002.
- **Integridad**: `CHECK (owner_id IS NULL OR sport_space_id IS NOT NULL)`
  validado en cada tabla; los recursos de plataforma (`owner_id IS NULL`) no
  tienen SportSpace.
- **Idempotencia**: columnas con `IF NOT EXISTS`, backfill acotado a
  `sport_space_id IS NULL`, inserciones con `ON CONFLICT DO NOTHING`. La
  migración puede reejecutarse sin efectos secundarios.
- **Rollback seguro**: basta con eliminar los triggers `*_sync_sport_space` y
  las restricciones `*_sport_space_sync`; el sistema vuelve a operar con
  `owner_id` sin pérdida de datos (las columnas pueden conservarse).
- **Pruebas**: `scripts/ownership-migration-test.py` (25 comprobaciones de
  columnas, huérfanos, Owners, doble escritura e idempotencia; todas las
  escrituras se revierten).
