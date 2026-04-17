# SpecForge · Contrato MCP fase 1

## Objetivo

Definir la interfaz mínima del backend MCP para ejecutar el workflow canónico de fase 1 sin mezclar detalles de implementación interna con la UX de la extensión.

## Principios del contrato

- las tools operan sobre artefactos persistidos en repo
- el MCP devuelve estado suficiente para que la extensión no tenga que inferir reglas de negocio
- los errores de negocio deben ser explícitos y accionables
- el contrato se alinea con `workflow-canonico-fase-1.md`, `state.yaml` y `branch.yaml`
- el avance entre fases es estrictamente lineal; no existe salto arbitrario a una fase futura

## Convenciones

- todos los identificadores de historia usan `usId`
- las fases usan estos ids canónicos:
  - `capture`
  - `refinement`
  - `refinement_approval`
  - `technical_design`
  - `implementation`
  - `review`
  - `release_approval`
  - `pr_preparation`
- las respuestas deben incluir al menos:
  - `usId`
  - `status`
  - `currentPhase`
  - `activeArtifacts`

## Modelo base de respuesta

```yaml
usId: US-0001
status: active
currentPhase: refinement
activeArtifacts:
  us: .specs/us/us.US-0001/us.md
  refinement: .specs/us/us.US-0001/phases/01-refinement.md
messages:
  - code: refinement_generated
    level: info
    text: Refinement generado y pendiente de aprobación
```

## Tools mínimas

### `create_us_from_chat`

Propósito:

- crear una US nueva desde texto libre

Input mínimo:

```yaml
title: Crear base SDD para SpecForge
sourceText: |
  Quiero una herramienta para VS Code...
baseBranch: main
```

Output mínimo:

```yaml
usId: US-0001
status: active
currentPhase: refinement
createdArtifacts:
  us: .specs/us/us.US-0001/us.md
  state: .specs/us/us.US-0001/state.yaml
messages:
  - code: us_created
    level: info
    text: US creada correctamente
```

Errores de negocio:

- `invalid_source_text`
- `us_storage_conflict`

### `import_us_from_markdown`

Propósito:

- adoptar un markdown existente como fuente inicial de una US

Input mínimo:

```yaml
sourcePath: /repo/doc/input/specforge-us.md
baseBranch: main
```

Output mínimo:

- mismo shape que `create_us_from_chat`

Errores de negocio:

- `source_file_not_found`
- `invalid_markdown_source`
- `us_storage_conflict`

### `list_user_stories`

Propósito:

- listar USs conocidas con su estado resumido

Input mínimo:

```yaml
filter:
  status:
    - active
    - waiting_user
```

Output mínimo:

```yaml
items:
  - usId: US-0001
    title: Crear base SDD para SpecForge
    status: waiting_user
    currentPhase: refinement
    updatedAt: 2026-04-18T09:30:00Z
```

### `get_user_story_summary`

Propósito:

- recuperar el resumen operativo de una US

Input mínimo:

```yaml
usId: US-0001
```

Output mínimo:

```yaml
usId: US-0001
status: waiting_user
currentPhase: refinement
phaseStates:
  refinement: waiting_user
  refinementApproval: pending
activeArtifacts:
  us: .specs/us/us.US-0001/us.md
  refinement: .specs/us/us.US-0001/phases/01-refinement.md
branch:
  baseBranch: main
  workBranch: null
metrics:
  regressionCount: 0
  manualInterventionCount: 0
```

Errores de negocio:

- `us_not_found`

### `get_current_phase`

Propósito:

- recuperar la fase actual y su capacidad de avance

Input mínimo:

```yaml
usId: US-0001
```

Output mínimo:

```yaml
usId: US-0001
currentPhase: refinement
status: waiting_user
canAdvance: false
requiresApproval: true
blockingReason: refinement_pending_user_approval
```

Errores de negocio:

- `us_not_found`

### `generate_next_phase`

Propósito:

- ejecutar únicamente la siguiente transición lineal válida del workflow

Input mínimo:

```yaml
usId: US-0001
requestedBy: user
```

Output mínimo:

```yaml
usId: US-0001
status: waiting_user
currentPhase: refinement
generatedArtifact: .specs/us/us.US-0001/phases/01-refinement.md
messages:
  - code: refinement_generated
    level: info
    text: Refinement generado con evaluación red-team y blue-team
```

Errores de negocio:

- `us_not_found`
- `phase_transition_not_allowed`
- `approval_required_before_transition`
- `source_hash_mismatch_detected`
- `workflow_blocked`

### `approve_phase`

Propósito:

- aprobar un checkpoint y desbloquear la transición siguiente

Input mínimo:

```yaml
usId: US-0001
phaseId: refinement
approvedBy: user
baseBranch: main
```

Notas:

- `baseBranch` es obligatorio cuando la aprobación ejecuta `refinement_approval`, porque en ese momento se crea la rama de trabajo
- en el resto de checkpoints `baseBranch` es opcional o no aplicable
- en fase 1, la creación de rama queda integrada en esta operación y no se expone como tool separada

Output mínimo:

```yaml
usId: US-0001
status: active
currentPhase: technical_design
branch:
  baseBranch: main
  workBranch: feature/us-0001-specforge-foundation
messages:
  - code: phase_approved
    level: info
    text: Fase aprobada y workflow avanzado
```

Errores de negocio:

- `us_not_found`
- `phase_not_approvable`
- `approval_not_required`
- `missing_base_branch`

### `request_regression`

Propósito:

- forzar una regresión explícita a una fase válida

Input mínimo:

```yaml
usId: US-0001
targetPhaseId: technical_design
reason: Review detecta desacoplamiento insuficiente
requestedBy: user
```

Output mínimo:

```yaml
usId: US-0001
status: active
currentPhase: technical_design
messages:
  - code: phase_regressed
    level: warning
    text: Workflow regresado a technical_design
```

Errores de negocio:

- `us_not_found`
- `invalid_regression_target`
- `regression_not_allowed`

### `restart_user_story_from_source`

Propósito:

- reiniciar una US cuando la fuente cambió y el usuario decide reconstruir el flujo

Input mínimo:

```yaml
usId: US-0001
requestedBy: user
reason: La US cambió después de iniciar refinement
```

Output mínimo:

```yaml
usId: US-0001
status: active
currentPhase: refinement
messages:
  - code: us_restarted_from_source
    level: warning
    text: Se limpiaron artefactos derivados y se reinició el flujo
```

Errores de negocio:

- `us_not_found`
- `restart_not_allowed`

## Errores transversales recomendados

- `validation_error`
- `storage_error`
- `workflow_blocked`
- `concurrency_conflict`
- `internal_error`

## Recursos MCP sugeridos

- recurso de resumen de US por `usId`
- recurso de fase actual por `usId`
- recurso de artefactos activos por `usId`

## Decisiones abiertas

- `generate_next_phase` queda fijada como avance secuencial lineal; no acepta `targetPhaseId`
- si el resumen de errores debe normalizarse con estructura `code/message/details`
