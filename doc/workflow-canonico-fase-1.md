# SpecForge · Workflow canónico fase 1

## Objetivo

Definir el flujo mínimo gobernable y usable que justifica la existencia de SpecForge antes de introducir personalización avanzada.

## Alcance de fase 1

Incluye:

- creación o importación de una US
- ejecución secuencial de fases base
- checkpoints humanos explícitos
- regresión desde review a una fase previa permitida
- persistencia de artefactos y estado mínimo
- creación de rama de trabajo tras el primer refinement aprobado

No incluye:

- edición visual de workflows
- paralelización intra-US
- integración real con PR
- integración real con issues
- asignación avanzada de múltiples agentes por fase

## Fases del workflow

### 1. `capture`

Propósito:

- registrar la US inicial y crear su contexto base

Entrada:

- texto libre desde chat o markdown importado

Salida:

- `us.md`
- metadatos mínimos de la US

Definition of Done:

- existe identidad estable de US
- existe artefacto principal persistido
- el workflow queda inicializado
- se registra el hash inicial del contenido fuente

Checkpoint:

- no obligatorio

### 2. `refinement`

Propósito:

- convertir la intención inicial en una especificación funcional más precisa
- someter la propuesta a crítica estructurada antes de fijar el refinement final

Entrada:

- `us.md`
- contexto adicional del usuario si existe

Salida:

- `phases/01-refinement.md`

Definition of Done:

- objetivos, alcance y restricciones están explícitos
- quedan identificadas ambigüedades y supuestos
- existe una evaluación `red-team`
- existe una reconstrucción `blue-team` sobre los hallazgos relevantes
- la salida permite diseñar sin inventar requisitos críticos

Checkpoint:

- aprobación humana obligatoria

Notas operativas:

- una vez iniciada esta fase, `us.md` deja de ser fuente mutable de verdad para el workflow en curso
- el sistema debe comparar el hash del contenido fuente para detectar cambios manuales posteriores
- si la US cambia tras iniciar `refinement`, esos cambios no se incorporan automáticamente
- si el usuario quiere reiniciar desde la nueva US, el sistema debe limpiar el trabajo derivado ya procesado y reinicializar el flujo
- toda modificación del fichero de refinement por parte del agente debe añadir un bloque de `history log` al inicio con fecha y resumen breve multilinea

### 3. `refinement_approval`

Propósito:

- fijar el refinement aprobado como baseline operativa de la US
- crear la rama de trabajo que aislará la implementación

Entrada:

- `phases/01-refinement.md`
- decisión del usuario

Salida:

- refinement aprobado
- branch de trabajo creada desde `main` o desde la rama base elegida por el usuario

Definition of Done:

- existe aprobación explícita del usuario
- existe rama de trabajo asociada a la US
- el refinement aprobado queda congelado como baseline

Checkpoint:

- obligatorio

### 4. `technical_design`

Propósito:

- concretar solución técnica y límites de implementación

Entrada:

- salida aprobada de `refinement`
- restricciones del repositorio

Salida:

- `phases/02-technical-design.md`

Definition of Done:

- componentes afectados identificados
- estrategia de implementación definida
- riesgos y decisiones abiertas documentados

Checkpoint:

- aprobación humana obligatoria

Notas operativas:

- si esta fase ya fue aprobada o superada y debe regenerarse por una regresión, se crea una nueva versión, por ejemplo `phases/02-technical-design.v02.md`
- la versión anterior queda preservada como historial y deja de ser la activa

### 5. `implementation`

Propósito:

- ejecutar cambios sobre el repositorio conforme al diseño técnico

Entrada:

- diseño técnico aprobado

Salida:

- cambios en código
- resumen de implementación en `phases/03-implementation.md`

Definition of Done:

- el cambio implementa el alcance aprobado
- los artefactos modificados quedan trazados
- existe resultado verificable de implementación

Checkpoint:

- no obligatorio antes de review

Notas operativas:

- si esta fase ya produjo una salida anterior y debe rehacerse, se genera una nueva versión de fichero y la previa queda archivada como no activa

### 6. `review`

Propósito:

- verificar cumplimiento funcional y técnico respecto a artefactos previos

Entrada:

- US
- refinement aprobado
- diseño aprobado
- resultado de implementación

Salida:

- `phases/04-review.md`
- findings estructurados si aplica

Definition of Done:

- existe veredicto explícito `pass` o `fail`
- si falla, cada finding apunta a una fase objetivo de corrección

Checkpoint:

- obligatorio si el resultado es `pass`

### 7. `release_approval`

Propósito:

- pedir confirmación humana final antes de preparar la PR

Entrada:

- review con resultado `pass`
- estado actual de la branch

Salida:

- aprobación final del usuario o bloqueo explícito

Definition of Done:

- existe decisión final del usuario
- el sistema sabe si puede o no pasar a preparación de PR

Checkpoint:

- obligatorio

### 8. `pr_preparation`

Propósito:

- preparar la PR a partir de la branch de trabajo y los artefactos aprobados

Entrada:

- aprobación de `release_approval`

Salida:

- metadatos de PR preparados
- resumen final de cambios listo para publicación

Definition of Done:

- existe un payload de PR consistente con la US y los artefactos aprobados

Checkpoint:

- no obligatorio en fase 1, porque la integración real con GitHub sigue aplazada

## Transiciones válidas

- `capture -> refinement`
- `refinement -> refinement_approval`
- `refinement_approval -> technical_design`
- `technical_design -> implementation`
- `implementation -> review`
- `review -> release_approval`
- `release_approval -> pr_preparation`
- `pr_preparation -> completed`

## Regresiones válidas

- `review -> refinement`
- `review -> technical_design`
- `review -> implementation`
- `release_approval -> refinement`
- `release_approval -> technical_design`
- `release_approval -> implementation`

## Reglas operativas

- no puede haber más de una fase en estado `running`
- una fase con checkpoint obligatorio no puede avanzar sin aprobación
- toda regresión debe registrar motivo y evidencia
- toda intervención humana debe quedar asociada a una fase o checkpoint
- si una fase falla repetidamente sin nueva información, la US pasa a `waiting_user`
- si una US ya está `completed` y el usuario quiere cambiar `us.md`, `refinement` o artefactos equivalentes, el sistema debe recomendar crear una nueva US
- `us.md` solo es fuente de verdad para arrancar el flujo, no para mutar silenciosamente una ejecución ya iniciada

## Política inicial de escalado

Escalar al usuario cuando ocurra una de estas condiciones:

- ambigüedad crítica no resoluble con artefactos existentes
- dos regresiones consecutivas a la misma fase por el mismo motivo
- conflicto entre edición manual y salida generada no reconciliado
- cambio detectado en `us.md` después de iniciado `refinement`

## Persistencia mínima por US

Convención:

- `markdown` para artefactos de trabajo y revisión humana
- `yaml` para estado, configuración y metadatos técnicos
- no se crea `input.md` por defecto si la entrada de la fase puede inferirse de la baseline aprobada anterior y del estado activo
- solo se materializa un artefacto de entrada explícito cuando haga falta congelar un snapshot no inferible o adjuntar contexto extraordinario

Resolución de entradas por fase:

- `refinement` toma `us.md`
- `technical_design` toma la versión activa aprobada de `01-refinement.md`
- `implementation` toma la versión activa aprobada de `02-technical-design*.md`
- `review` toma `us.md` y las versiones activas de `refinement`, `technical_design` e `implementation`
- `release_approval` y `pr_preparation` toman la versión activa de `04-review.md` y los metadatos de rama

```text
work/
  us/
    <us-id>/
      us.md
      state.yaml
      timeline.md
      phases/
        01-refinement.md
        02-technical-design.md
        02-technical-design.v02.md
        03-implementation.md
        04-review.md
      branch.yaml
```

## Estado mínimo de `state.yaml`

```yaml
usId: US-0001
workflowId: canonical-v1
status: active
currentPhase: refinement
sourceHash: sha256:...
activeArtifacts:
  refinement: phases/01-refinement.md
  technicalDesign: phases/02-technical-design.md
  implementation: phases/03-implementation.md
  review: phases/04-review.md
phaseStates:
  refinement: waiting_user
  refinementApproval: pending
  technicalDesign: pending
  implementation: pending
  review: pending
  releaseApproval: pending
  prPreparation: pending
metrics:
  regressionCount: 0
  manualInterventionCount: 0
  reviewFailCount: 0
  reviewPassCount: 0
```

## Eventos mínimos

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
- `pr_preparation_requested`

## Impacto sobre el MCP inicial

Este workflow justifica como mínimo estas operaciones:

- `create_us_from_chat`
- `import_us_from_markdown`
- `list_user_stories`
- `get_user_story_summary`
- `get_current_phase`
- `generate_next_phase`
- `approve_phase`
- `request_regression`
- `restart_user_story_from_source`
- `create_work_branch`

## Decisiones abiertas

- si `timeline` seguirá en markdown o migrará también a `yaml`
- si `capture` se modela como fase persistida o como bootstrap del workflow
- si la review debe incorporar validaciones automáticas además del análisis del agente
