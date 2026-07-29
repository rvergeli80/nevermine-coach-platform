# FEATURE-003.3 — Knowledge Distribution Lifecycle (cierre)

## Objetivo
Dotar al repositorio de Knowledge Packages de un modelo oficial de distribución:
existir en el repositorio y poder instalarse son cosas distintas.

## Entregado

### Plataforma (`src/modules/platform/knowledge-packages/`)
- `lifecycle.ts` — máquina de estados explícita
  `draft → review → certified → published → deprecated → archived`
  (`archived` es final; `published` sólo se alcanza desde `certified`).
  `LifecycleHistory` es un log **append-only** con entradas congeladas
  (actor, motivo, instante, checksum y evidencia).
- `certification.ts` — certificación automática y funcional (sin firma
  criptográfica): descriptor, integridad, checksum, compatibilidad
  producto/Engine y dependencias. Produce un `CertificationReport` que se
  adjunta como evidencia de la transición a `certified`.
- `repository.ts` — repositorio *lifecycle-aware*: estado efectivo por versión,
  guardias de transición, certificación en el alta y `resolveInstall()` que
  **rechaza todo paquete no publicado**, incluidas sus dependencias.

### Coach (`src/modules/starter-packs/`, `src/lib/services/`)
- Verbos delegados: `certifyStarterPack`, `transitionStarterPack`,
  `starterPackLifecycleHistory`, `isStarterPackDistributable`,
  `starterPackLifecycleState`.
- `starter-packs.service.ts` expone `lifecycleState` y `distributable` en el
  catálogo y bloquea la instalación de lo no publicado **antes** de abrir
  ninguna transacción de base de datos.
- UI `/app/packs`: etiqueta de estado de distribución y botón deshabilitado
  para paquetes aún no publicados.

## Invariantes
1. Sólo `published` es distribuible.
2. No hay publicación sin certificación previa superada.
3. El historial es append-only e inmutable.
4. Un paquete incompatible o manipulado nunca llega a la base de datos.

## Verificación
132/132 tests PASS (16 nuevos en `lifecycle.test.ts`) y typecheck limpio.

## Fuera de alcance
Firma criptográfica real, persistencia del ciclo de vida en base de datos y UI
de publicación/gobierno.
