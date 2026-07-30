# FEATURE-003.5 — Installation, Updates & Rollback (cierre)

## Objetivo

Cerrar el Knowledge Distribution Engine: el repositorio **describe y gobierna**;
el Installation Engine **ejecuta** de forma reproducible, segura e idempotente.

## Qué se ha implementado (Nevermine Platform)

`src/modules/platform/knowledge-packages/installation/`

| Pieza | Responsabilidad |
| --- | --- |
| `manifest.ts` | `InstallationManifest` (instantánea de lo instalado: paquete, versión, publisher, trust, ciclo de vida, checksum, versión anterior, payload) y el puerto `InstallationManifestStore`. |
| `version-resolution.ts` | Compara instalado vs objetivo y decide la operación: `install`, `update`, `rollback`, `reinstall`, `noop`. |
| `history.ts` | Historial **append-only** de eventos `INSTALL / UPDATE / ROLLBACK / UNINSTALL` con resultado `success | failed | noop` y marca `rolledBack`. |
| `service.ts` | `InstallationService`: `validate()`, `install()`, `update()`, `rollback()`, `uninstall()`, `listManifests()`, `listHistory()`. |

### Invariantes

1. **Preflight completo antes de tocar nada**: ciclo de vida publicado, política
   de publicación y ownership, compatibilidad producto/Engine, dependencias
   resueltas en orden topológico, integridad por checksum y nivel de confianza
   admitido. Un solo fallo aborta: no se aplica nada.
2. **Transaccional con compensación**: si el ejecutor falla, se restaura el
   manifiesto y el estado anteriores (`revert`) y el evento queda registrado
   como `failed` + `rolledBack`.
3. **Idempotencia**: instalar la versión ya instalada sin `force` es `noop`.
4. **Historial inmutable**: también se registran los intentos fallidos.
5. **La plataforma no conoce el contenido**: aplicarlo es tarea del ejecutor que
   aporta el producto dueño del `kind`.

## Integración en Coach

- `src/lib/services/pack-installation.ts`
  - `SupabaseInstallationManifestStore`: persiste el manifiesto sobre
    `starter_pack_installations`.
  - `CoachStarterPackExecutor`: aplica el pack mediante la función transaccional
    `install_starter_pack`; registra `uninstall` y `rollback` como eventos.
  - `createCoachInstallationService`: sólo admite `trust: official` mientras no
    exista firma digital.
- `src/lib/services/starter-packs.service.ts`: `installStarterPack`,
  `updateStarterPack`, `rollbackStarterPack`, `uninstallStarterPack` y
  `listInstallationManifests` delegan **exclusivamente** en el Installation
  Service. Coach ya no instala contra el repositorio ni contra la base de datos.
- `src/lib/starter-packs.functions.ts`: canales HTTP para actualizar, revertir,
  desinstalar y listar manifiestos.

### Base de datos

`starter_pack_installations` incorpora `publisher`, `trust_level`,
`lifecycle_state` y `previous_version` (habilita el rollback determinista).
Nuevos valores de enum: estado `uninstalled`; acciones `uninstall` y `rollback`.
Desinstalar **no borra** catálogos, versiones ni valoraciones: el histórico sigue
siendo inmutable; el manifiesto pasa a `uninstalled`.

## Verificación

- 166/166 tests PASS (12 nuevos en `installation.test.ts`: validación, manifiesto,
  idempotencia, `force`, update sin instalación previa, paquete desconocido,
  trust no admitido, fallo con restauración, rollback sin versión anterior,
  desinstalación y doble desinstalación, historial append-only).
- Typecheck limpio.

## Fuera de alcance (no implementado)

Marketplace, sincronización remota, firma digital, múltiples repositorios, IA,
aprobación humana y auto-update.
