# SpecForge · Modelo de dominio inicial

## Objetivo

Definir el núcleo mínimo gobernable para la primera fase sin arrastrar entidades de complejidad futura.

## Agregados iniciales

### `UserStory`

Representa la UH o US gestionada por SpecForge.

Responsabilidades:

- identidad estable
- referencia a artefacto principal
- estado global
- vínculo al workflow aplicado

### `WorkflowDefinition`

Describe el flujo permitido.

Responsabilidades:

- fases disponibles
- transiciones válidas
- checkpoints con aprobación humana
- destino de regresión permitido

### `WorkflowRun`

Instancia ejecutada de un workflow sobre una `UserStory`.

Responsabilidades:

- fase actual
- historial de transiciones
- estado global de ejecución

### `PhaseRun`

Ejecución de una fase concreta.

Responsabilidades:

- contrato de entrada
- artefactos de salida
- resultado
- timestamps
- estado de la fase

### `Artifact`

Artefacto persistido en repo.

Responsabilidades:

- tipo de artefacto
- ruta
- versión lógica
- relación con fase y UH

### `Checkpoint`

Punto de intervención explícita.

Responsabilidades:

- motivo
- estado de aprobación
- instrucciones humanas adjuntas

### `ReviewFinding`

Hallazgo estructurado generado por review.

Responsabilidades:

- severidad
- incumplimiento detectado
- evidencia
- fase objetivo de corrección

## Entidades aplazadas

Quedan fuera del dominio inicial y se recuperarán si la implementación las exige:

- `ExecutionSlice`
- `ComponentScope`
- `DependencyEdge`
- `IssueLink`
- `ConversationContribution`
- `ManualEditDetection`
- `PauseRequest`
- `ProjectMetrics` como agregado propio

## Invariantes iniciales

- Una `UserStory` tiene un único `WorkflowRun` activo.
- Solo puede existir una `PhaseRun` en estado `running` por `WorkflowRun`.
- No se avanza a la siguiente fase si el checkpoint obligatorio no está aprobado.
- Toda regresión debe apuntar a una fase permitida por `WorkflowDefinition`.
- Todo `ReviewFinding` debe referenciar la fase o artefacto afectado.

## Estados mínimos

### Estado global de `UserStory`

- `draft`
- `active`
- `waiting_user`
- `paused`
- `blocked`
- `completed`

### Estado de `PhaseRun`

- `pending`
- `ready`
- `running`
- `waiting_user`
- `completed`
- `failed`
- `regressed`

## Métricas mínimas de fase 1

- `phaseLeadTime`
- `regressionCount`
- `manualInterventionCount`
- `reviewFailCount`
- `reviewPassCount`

Estas métricas deben derivarse de eventos observables, no de inferencias opacas.
