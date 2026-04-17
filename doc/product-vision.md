# SpecForge · Visión de producto

## Problema

El desarrollo asistido por IA suele degradarse en:

- prompts aislados sin trazabilidad
- decisiones no persistidas
- handoffs ambiguos
- retrabajo por validación tardía
- poca gobernanza en equipos de más de una persona

## Propuesta de valor

SpecForge no busca solo generar código. Busca gobernar cómo se produce el resultado mediante un workflow SDD explícito, persistido y auditable.

## Usuario objetivo

Equipos de desarrollo que necesitan:

- coherencia entre artefactos
- control del proceso
- documentación viva versionada
- visibilidad del progreso
- capacidad de intervención humana sin romper la trazabilidad

## Resultado esperado

Desde una US o UH, el sistema debe permitir recorrer un flujo gobernado de:

1. definición inicial
2. refinement
3. diseño técnico
4. implementación
5. review
6. preparación de PR

## Principios

- El chat no es la fuente de verdad final.
- Toda información relevante se persiste en artefactos del repo.
- La herramienta debe ser usable por otro workstation solo clonando el repositorio.
- La UX debe priorizar claridad operativa.
- El sistema debe permitir checkpoints e intervención humana entre fases.

## No objetivos de fase 1

- editor visual avanzado de workflows
- paralelización intra-UH
- integración completa con PR e issues
- optimización multi-proveedor más allá de una abstracción mínima
