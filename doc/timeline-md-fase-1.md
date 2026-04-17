# SpecForge · `timeline.md` fase 1

## Objetivo

Definir el formato de `timeline.md` como registro cronológico legible por humanos de la vida de una US.

## Propósito

`timeline.md` no sustituye a `state.yaml`. Su función es:

- dejar una traza auditable y fácil de leer
- explicar por qué cambió el estado de la US
- registrar decisiones, aprobaciones, regresiones e intervenciones
- resumir eventos relevantes sin obligar a inspeccionar múltiples ficheros

## Regla principal

`timeline.md` registra hechos y contexto breve.

No debe duplicar:

- el estado actual completo de `state.yaml`
- metadatos Git completos de `branch.yaml`
- contenido completo de artefactos de fase

Debe referenciar esos artefactos cuando sea necesario.

## Ubicación

```text
work/
  us/
    <us-id>/
      timeline.md
```

## Estructura propuesta

```md
# Timeline · US-0001 · Crear base SDD para SpecForge

## Resumen

- Estado actual: `waiting_user`
- Fase actual: `refinement`
- Rama activa: `sin crear`
- Última actualización: `2026-04-18T10:30:00Z`

## Eventos

### 2026-04-18T09:00:00Z · `us_created`

- Actor: `system`
- Fase: `capture`
- Resumen: Se creó la US desde chat y se inicializaron `us.md` y `state.yaml`.
- Artefactos:
  - `work/us/US-0001/us.md`
  - `work/us/US-0001/state.yaml`

### 2026-04-18T09:04:00Z · `phase_started`

- Actor: `system`
- Fase: `refinement`
- Resumen: Se inició la generación del refinement.

### 2026-04-18T09:06:00Z · `phase_completed`

- Actor: `system`
- Fase: `refinement`
- Resumen: Refinement generado con evaluación `red-team` y reconstrucción `blue-team`.
- Artefactos:
  - `work/us/US-0001/phases/01-refinement.md`

### 2026-04-18T09:10:00Z · `phase_approved`

- Actor: `user`
- Fase: `refinement_approval`
- Resumen: El usuario aprobó el refinement y eligió `main` como rama base.

### 2026-04-18T09:11:00Z · `branch_created`

- Actor: `system`
- Fase: `refinement_approval`
- Resumen: Se creó la rama `feature/us-0001-specforge-foundation`.
- Artefactos:
  - `work/us/US-0001/branch.yaml`
```

## Secciones

### Cabecera

Debe contener:

- `usId`
- título corto de la US

### `Resumen`

Debe reflejar solo una vista rápida:

- estado actual
- fase actual
- rama activa o ausencia de rama
- timestamp de última actualización

Esta sección puede reescribirse en cada cambio relevante.

### `Eventos`

Debe ser append-only a nivel semántico.

Cada evento se añade al final y representa un hecho ya ocurrido.

## Formato de un evento

Cada evento debe incluir:

- timestamp ISO-8601 en UTC
- código de evento
- actor
- fase asociada si aplica
- resumen breve

Puede incluir opcionalmente:

- razón
- evidencia
- artefactos afectados
- notas

## Eventos mínimos de fase 1

- `us_created`
- `phase_started`
- `phase_completed`
- `phase_approved`
- `phase_regressed`
- `manual_intervention_registered`
- `review_passed`
- `review_failed`
- `source_hash_mismatch_detected`
- `branch_created`
- `us_blocked`
- `us_waiting_user`
- `us_restarted_from_source`
- `pr_preparation_requested`

## Estilo de redacción

- frases cortas
- lenguaje factual
- sin narrativa larga
- sin copiar el contenido de artefactos
- enlazar por ruta cuando el detalle viva en otro fichero

## Reglas de actualización

- crear `timeline.md` en `capture`
- añadir un evento por cada transición de fase relevante
- añadir un evento por cada aprobación, regresión o intervención humana
- actualizar `Resumen` cuando cambie el estado global, la fase actual o la rama activa
- si una operación falla sin cambiar estado, solo registrar evento si aporta valor de auditoría

## Cuándo no registrar un evento

- relecturas internas sin efecto
- validaciones idempotentes sin cambio observable
- pasos técnicos de bajo nivel que no cambian la comprensión humana del flujo

## Relación con `state.yaml`

- `state.yaml` es la fuente estructurada de estado actual
- `timeline.md` es la fuente legible de historia operativa
- si hay discrepancia, prevalece `state.yaml`

## Decisiones abiertas

- si conviene limitar el tamaño del `Resumen`
- si algunos errores técnicos repetitivos deberían agregarse en una sola entrada
- si a futuro hará falta un `events.yaml` adicional para analítica más fina
