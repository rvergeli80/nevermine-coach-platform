# FEATURE-003.2 — Knowledge Packages Repository (cierre)

## Qué cambia conceptualmente

Los Starter Packs dejan de ser una capacidad de **Nevermine Coach** y pasan a ser
el primer `kind` de un **repositorio de conocimiento de Nevermine Platform**.

```text
modules/platform/                      Nevermine Platform (agnóstica de producto)
  semver.ts                            Versionado semántico reducido
  knowledge-packages/
    types.ts                           Descriptor, compatibilidad, dependencias, firma
    integrity.ts                       Canonicalización, checksum, verificación
    validation.ts                      Validación de forma del descriptor
    compatibility.ts                   Producto + Engine (min/max) + estado
    dependencies.ts                    Resolución topológica y ciclos
    repository.ts                      Catálogo, versiones, descubrimiento, plan

modules/starter-packs/                 Nevermine Coach (dueño del kind)
  knowledge-package.ts                 Adaptador StarterPack → descriptor
  repository.ts                        Catálogo oficial publicado + descubrimiento
  install-plan.ts / rules.ts           Contenido y compilación del pack
```

Dependencia en un solo sentido: `coach → platform`. La plataforma no conoce
Coach, Health ni Legal, ni ningún deporte.

## Requisitos cubiertos

| Requisito | Implementación |
| --- | --- |
| Repository | `KnowledgePackageRepository`: catálogo, versiones, autor, origen, estado, checksum |
| Descubrimiento | `find()` por producto, dominio, categoría, versión, etiqueta, origen, estado, texto y compatibilidad |
| Compatibilidad | `checkCompatibility()`: productos (min/max), Engines requeridos (min/max), estado publicado |
| Dependencias | `resolveDependencies()`: orden topológico, opcionales, rangos, ciclos; `dependentsOf()` |
| Integridad | `canonicalize()` + `checksumOf()` (FNV-1a 64 bits) y `verifyIntegrity()` |
| Firma | Sobre `PackageSignature` (`UNSIGNED`) preparado; la firma criptográfica **no** se implementa |
| Trazabilidad | `rejectedPackages` guarda los descriptores rechazados y su motivo |

## Preparación para el futuro (sin cambiar el modelo)

`origin` admite ya `official | community | enterprise | private | marketplace`,
`trust` admite `unverified | certified | partner` y `kind` es extensible. Un pack
de comunidad o de marketplace será **otro descriptor registrado**, no otro modelo.

## Reglas duras

- Un descriptor inválido o con checksum incoherente **nunca** entra al repositorio.
- Un paquete incompatible **nunca** llega a la base de datos: la compatibilidad y
  las dependencias se resuelven antes de abrir transacción.
- Las dependencias se instalan primero, en el orden devuelto por el repositorio.
- No hay resolución de conflictos de versión: si el rango no se satisface, falla.

## Fuera de alcance (confirmado)

Marketplace, descarga remota, comunidad, publicación, merge, sincronización, IA
y firma criptográfica real.

## Migraciones

Ninguna. FEATURE-003.2 es una Feature de dominio y arquitectura; el estado de
instalación e historial siguen en las tablas de FEATURE-003.1
(`starter_pack_installations`, `starter_pack_installation_events`).

## Pruebas

`bun x vitest run` — **116/116 PASS**, de los cuales 19 nuevos cubren integridad,
validación, compatibilidad, dependencias y repositorio.

## Riesgos

1. **Checksum no criptográfico**: FNV-1a detecta corrupción y manipulación
   accidental, no un ataque. Se sustituirá al introducir la firma.
2. **Sin conflictos de versión**: el repositorio sólo ofrece la última versión
   publicada de cada dependencia; un grafo con exigencias contradictorias falla
   en vez de negociar (decisión explícita del alcance).
3. **Catálogo en código**: los paquetes oficiales viven en el binario. La
   distribución remota es Feature posterior; el descriptor ya lo soporta.
4. **Versión de producto fija** (`coach 1.0.0`): al versionar el producto habrá
   que alimentarla desde la configuración de despliegue.
