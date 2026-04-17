# SpecForge · `branch.yaml` fase 1

## Objetivo

Definir el artefacto técnico que persiste el anclaje Git de una US sin mezclarlo con el estado funcional del workflow.

## Propósito

`branch.yaml` existe para responder de forma estable a estas preguntas:

- desde qué rama base se creó la rama de trabajo
- cuál es la rama activa de la US
- cuándo se creó
- cuál es su estado operativo dentro del flujo
- qué metadatos mínimos serán reutilizables en la futura preparación de PR

## Alcance de fase 1

Incluye:

- persistencia de rama base elegida por el usuario
- persistencia del nombre de la rama de trabajo
- trazabilidad temporal de creación
- estado mínimo de la rama respecto al workflow

No incluye:

- sincronización remota con GitHub
- estado de CI
- URL de PR real
- enriquecimiento con metadatos de revisión externa

## Relación con otros artefactos

- `state.yaml` gobierna el ciclo de vida de la US
- `branch.yaml` gobierna su contexto Git operativo
- `04-review.md` y la futura preparación de PR pueden leer `branch.yaml`, pero no deben duplicar sus datos

## Momento de creación

`branch.yaml` debe crearse en `refinement_approval`, cuando:

- el usuario aprueba por primera vez el refinement
- el sistema ya puede abrir una rama de trabajo aislada

## Ubicación

```text
.specs/
  us/
    us.<us-id>/
      branch.yaml
```

## Esquema mínimo propuesto

```yaml
usId: US-0001
baseBranch: main
workBranch: feature/us-0001-specforge-foundation
status: active
createdAt: 2026-04-17T10:30:00Z
createdFromPhase: refinement_approval
strategy: single-branch-per-user-story
pullRequest:
  status: not_requested
  targetBaseBranch: main
```

## Campos

### `usId`

Identificador estable de la US dueña de la rama.

### `baseBranch`

Rama base elegida por el usuario al aprobar el primer refinement.

### `workBranch`

Nombre de la rama creada para aislar el trabajo de la US.

### `status`

Estado operativo de la rama.

Valores iniciales recomendados:

- `active`
- `superseded`
- `merged`
- `abandoned`

### `createdAt`

Marca temporal de creación de la rama.

### `createdFromPhase`

Fase del workflow que originó la creación. En fase 1 debe ser `refinement_approval`.

### `strategy`

Estrategia de branching aplicada. En fase 1 se fija como `single-branch-per-user-story`.

### `pullRequest`

Bloque reservado para enlazar con la futura preparación de PR sin forzar todavía integración real.

Campos mínimos:

- `status`
- `targetBaseBranch`

Valores iniciales de `pullRequest.status`:

- `not_requested`
- `ready_to_prepare`
- `prepared`

## Invariantes

- una US activa tiene como máximo un `branch.yaml` activo
- no puede existir `workBranch` sin `baseBranch`
- `branch.yaml` no se crea antes de la aprobación inicial del refinement
- si una US se reinicia desde fuente, el branch previo debe quedar marcado como `superseded` o `abandoned`, nunca reutilizado silenciosamente

## Decisiones abiertas

- convención final de naming para `workBranch`
- si `branch.yaml` debe incluir el `headCommit` local en fase 1 o posponerse
- si el estado `merged` debe quedar en fase 1 o reservarse para la futura integración real con PR
