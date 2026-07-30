# FEATURE-003.9 — Publication & Updates · Cierre

**Estado:** completada · 236/236 tests PASS.

## 1. Distribution Engine (plataforma)
`src/modules/platform/knowledge-packages/distribution/`

| Archivo | Responsabilidad |
| --- | --- |
| `types.ts` | Canales (`stable`/`preview`/`internal`), políticas, publicaciones, anuncios, informe |
| `registry.ts` | `PublicationRegistry` append-only: publicar, retirar, última activa por canal |
| `policy.ts` | Clasificación `major`/`minor`/`patch` y recomendación `apply`/`confirm`/`manual` |
| `discovery.ts` | `validateAnnouncement`: canal, lifecycle, publisher, confianza, compatibilidad, dependencias, integridad |
| `report.ts` | Informe agregado: pendientes, incompatibilidades, `unknown`, resumen |
| `service.ts` | `DistributionService`: `publishVersion`, `unpublishVersion`, `checkForUpdates`, `discoverUpdates(ForScope)`, `buildReport`/`reportForScope`, `requestUpdate` |

Invariantes verificadas por test:
1. Sólo se publica lo certificado y gobernado; lo demás se rechaza con motivo.
2. Retirar una publicación deja de anunciarla y conserva el histórico.
3. Un canal o nivel de confianza no admitido nunca produce un anuncio ni una instalación.
4. `requestUpdate` no instala: delega en el `InstallationService` y sin él no puede ejecutar nada.
5. Sin actualización anunciada no hay ejecución posible.

Corrección aplicada: la compatibilidad se evalúa con el estado del ciclo de
vida (FEATURE-003.3), no con el `status` sellado en el descriptor.

## 2. Integración Coach
- `src/modules/starter-packs/distribution.ts`: suscripción (`stable` + `official`),
  registro del catálogo oficial y factoría con Installation Engine por ámbito.
- `src/modules/starter-packs/waterpolo.ts`: `distribution: { channel: "stable", updatePolicy: "notify" }`.
- `src/lib/services/starter-packs.service.ts`: `checkStarterPackUpdates`,
  `checkStarterPackUpdate`, `getDistributionReport`, `getPackDistributionStatus`,
  `applyAnnouncedUpdate`.
- `src/lib/starter-packs.functions.ts`: server functions bajo `requireApplicationContext`
  (y `requireSupabaseAuth` para la aplicación de la actualización).
- `/app/packs`: tarjeta "Actualizaciones disponibles" con confirmación explícita.

## 3. Fuera de alcance
Sincronización P2P, CDN y actualizaciones silenciosas.
