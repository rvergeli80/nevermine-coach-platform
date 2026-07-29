# FEATURE-003.1 — Starter Packs Oficiales · Cierre

## 1. Resumen de implementación

Se sustituye el prototipo de Starter Packs de la Fase 1E por la infraestructura
oficial del EPIC-003, respetando Clean Architecture y DDD.

### Dominio puro — `src/modules/starter-packs/`
Módulo promovido desde `src/modules/config/starter-packs` a módulo de primer nivel.

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | Modelo `StarterPack` con `version`, `author`, `publishedAt`, `origin`, `status`, `compatibility`. |
| `version.ts` | Semver estricto: `parseVersion`, `compareVersions`, `isUpdateAvailable`, `checkCompatibility`. |
| `rules.ts` | Validación pura de contenido (grupos, métricas, fórmulas, pesos) **y** de metadatos. |
| `install-plan.ts` | Compila el pack a un plan cerrado con ASTs resueltos y checksum determinista. |
| `installation.ts` | Estado de instalación y decisión `install` / `update` / `reinstall` / `noop`. |
| `waterpolo.ts` | Primer pack oficial, ahora versionado (`1.0.0`). |

El dominio no conoce Supabase, React ni HTTP.

### Aplicación — `src/lib/services/starter-packs.service.ts`
Único orquestador, compartido por todos los canales: carga el estado de
instalación del SportSpace activo, deja decidir al dominio y delega la ejecución
a la base de datos. Recibe siempre un `ApplicationServiceContext` ya resuelto.

### Canal HTTP — `src/lib/starter-packs.functions.ts`
Capa fina sobre el servicio: `listStarterPacks`, `listStarterPackHistory`,
`applyStarterPack`. Todas bajo `requireApplicationContext`.

### Presentación — `src/routes/_authenticated/app/packs.tsx`
Muestra versión, autor y estado (No instalado / Instalado / Actualización
disponible / Fallido); el botón se adapta a la acción real.

## 2. Archivos modificados

**Creados**
- `src/modules/starter-packs/{types,version,rules,install-plan,installation,index,waterpolo}.ts`
- `src/modules/starter-packs/{rules.test.ts,starter-packs.test.ts}`
- `src/lib/services/starter-packs.service.ts`
- `docs/FEATURE-003.1-cierre.md`

**Modificados**
- `src/lib/starter-packs.functions.ts` (reescrito sobre el servicio)
- `src/lib/services/service-context.ts` (`DataClient` admite `rpc`)
- `src/routes/_authenticated/app/packs.tsx`
- `src/integrations/supabase/types.ts` (regenerado)

**Eliminados**
- `src/modules/config/starter-packs/**` (movido)

## 3. Migraciones creadas

1. **`starter_pack_installations`** — estado por (SportSpace, pack): versión,
   checksum, `status`, `catalog_id`, `catalog_version_id`. Unicidad
   `(sport_space_id, pack_id)`. GRANTs a `authenticated` y `service_role`,
   RLS por `can_access_space`.
2. **`starter_pack_installation_events`** — historial append-only con trigger
   `forbid_delete` y sin política de UPDATE/DELETE.
3. **`install_starter_pack(_sport_space_id uuid, _plan jsonb, _force boolean)`** —
   ejecuta el plan completo en una única transacción y registra instalación y
   evento. `SECURITY INVOKER`: la autorización sigue siendo RLS + Membership.
   `EXECUTE` revocado a `PUBLIC`, concedido a `authenticated`.

## 4. Tests ejecutados

`bunx vitest run` → **97/97 PASS** (10 ficheros), incluidos 16 tests nuevos:
- versionado semántico y compatibilidad de engine,
- compilación del plan, determinismo y sensibilidad del checksum,
- rechazo de packs incompatibles, obsoletos o con fórmulas inválidas,
- estado de instalación e **idempotencia** (`noop` en misma versión),
- proyección del catálogo con estado.

Los tests de integración real MCP/web siguen en verde, confirmando que la
refactorización no altera la paridad de canales.

## 5. Riesgos detectados

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Una actualización crea un nuevo catálogo en borrador en lugar de fusionar el existente. | Media | Decisión consciente: el merge pertenece a una Feature posterior del EPIC-003 y el histórico es inmutable. Documentado como comportamiento esperado. |
| El checksum cubre el contenido compilado, no la identidad de los recursos creados. | Baja | Suficiente para detectar deriva de contenido; la trazabilidad fina llegará con la auditoría persistente. |
| Reinstalar con `force` genera catálogos con código sufijado, acumulando borradores. | Baja | Los borradores no publicados pueden archivarse desde la UI de catálogos. |
| La deuda de auditoría persistente del EPIC-002 sigue abierta. | Media | El historial de eventos de packs es un primer paso; la auditoría global sigue planificada. |

## 6. Definition of Done

- [x] Modelo de dominio `StarterPack` con metadatos oficiales, puro y testeado.
- [x] Catálogo oficial expuesto con estado por SportSpace.
- [x] Versionado semántico con detección de actualizaciones y compatibilidad de engine.
- [x] Instalación sobre SportSpace resuelta exclusivamente por `ApplicationContext`.
- [x] Estado de instalación persistido y consultable.
- [x] Historial de instalaciones inmutable.
- [x] Idempotencia garantizada en dominio y en base de datos.
- [x] Transaccionalidad garantizada por función PL/pgSQL única.
- [x] RLS + Membership como única autorización; sin resolución por `owner_id`.
- [x] Compatible con futuras Features del EPIC-003 (marketplace, packs privados, merge)
      sin romper el contrato: `origin`, `status` y `checksum` ya modelados.
- [x] Sin marketplace, packs privados, compartición, merge, sincronización ni IA.
- [x] 97/97 tests PASS.
