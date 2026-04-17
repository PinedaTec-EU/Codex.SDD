SpecForge · Instrucciones maestras para Codex

Este documento está pensado para entregárselo a Codex como guía de construcción del producto SpecForge, una herramienta para VS Code orientada a orquestar workflows SDD con agentes por fase, persistencia documental en markdown, métricas, handoffs, regresiones e intervención humana controlada.

No quiero una demo superficial. Quiero una base seria, extensible y usable por equipos.

⸻

1. Contexto de producto

El nombre del producto es SpecForge.

SpecForge es una herramienta para VS Code cuyo objetivo es estructurar y gobernar el desarrollo asistido por IA mediante workflows por fases.

El sistema debe permitir partir de una US o UH, generar refinement, diseño técnico, implementación, validación y PR, con puntos de aprobación humana, revisiones automáticas y capacidad de regresión a fases anteriores cuando no se cumpla lo esperado.

El valor diferencial de SpecForge no es solo generar código, sino controlar cómo se produce ese código.

SpecForge está pensado especialmente para equipos de más de un developer, donde importan:

* coherencia
* trazabilidad
* control del proceso
* code reviews estructurados
* reducción de retrabajo
* documentación viva y versionada

⸻

1. Visión de arquitectura objetivo

La solución debe construirse con esta arquitectura general:

2.1 Extensión VS Code

Responsabilidades:

* UI y vistas del producto
* exploración de UHs
* acciones del usuario
* integración con el workspace
* apertura de markdowns
* detección de cambios manuales en ficheros
* pausa y reanudación de UHs
* visualización de estado, progreso y métricas
* cliente MCP para comunicarse con el backend operativo

La extensión no debe contener la lógica profunda del workflow.

2.2 MCP Server

Responsabilidades:

* motor del workflow SDD
* validación de transiciones
* handoffs entre fases
* regresiones
* checkpoints
* sincronización chat a markdown
* persistencia técnica de estado
* cálculo de métricas
* abstracción de proveedores LLM
* integración futura con issues
* planificación de ejecución paralela segura

El MCP es el backend semántico del sistema.

2.3 Repo como fuente de verdad

Todo lo importante debe persistirse dentro del repo:

* markdowns
* configuración
* perfiles de agentes
* workflows
* estado técnico
* métricas
* timeline de UHs
* artefactos por fase

El chat no es fuente de verdad final.

⸻

1. Objetivo funcional principal

Construir una herramienta para VS Code que permita:

* crear una UH desde chat o desde un markdown existente
* generar automáticamente el markdown inicial de la UH si entra por chat
* mantener una vista de UHs con su progreso
* abrir una UH y ver en qué fase está
* permitir intervención del usuario entre fases
* continuar automáticamente con la siguiente fase cuando el workflow lo permita
* pausar o bloquear una UH
* permitir regresión a fases previas
* asignar agentes distintos por fase
* permitir workflows personalizados
* soportar revisión automática antes de generar una PR
* si una fase se embucla o falla repetidamente, escalar al usuario
* si todo es correcto, permitir generar la PR

⸻

1. Principios obligatorios

1. No dependas del estado implícito de la conversación.
1. Toda información relevante debe persistirse en markdown o estado técnico asociado.
1. No construyas un simple prompt runner.
1. El sistema debe tener modelo de dominio explícito.
1. Las métricas se diseñan desde el principio.
1. La arquitectura debe quedar desacoplada del proveedor LLM.
1. El usuario debe poder intervenir en cualquier checkpoint entre fases.
1. Debe existir trazabilidad entre US, refinement, diseño, implementación, review y PR.
1. El sistema debe poder usarse desde otro workstation simplemente clonando el repo.
1. La UX debe priorizar claridad operativa frente a espectacularidad vacía.

⸻

1. Alcance funcional detallado

5.1 Entrada de UHs

La herramienta debe permitir iniciar una UH de dos formas:

* desde chat integrado en la extensión
* desde un fichero markdown existente

Si entra por chat:

* crear automáticamente el markdown de UH
* asignar identificador único
* crear estado técnico mínimo
* inicializar artefactos asociados

Si entra por markdown:

* adoptarlo como artefacto principal
* validar estructura mínima
* normalizar si es necesario
* generar estado técnico faltante

5.2 Vista de UHs

Debe existir una vista específica para UHs que permita:

* listar UHs
* ver fase actual
* ver estado
* ver bloqueos
* ver si hubo intervención humana
* abrir la UH
* continuar workflow
* pausar o reanudar
* ver métricas resumidas

5.3 Workflows personalizables

Debe existir un workflow base por defecto, pero el usuario debe poder:

* añadir fases
* quitar fases
* reordenarlas
* definir transiciones válidas
* definir regresiones válidas
* definir si una fase requiere aprobación humana
* definir si una fase continúa automáticamente
* definir agentes por fase

5.4 Agentes por fase

Cada fase debe poder tener asociado un agente configurable con:

* nombre
* rol
* personalidad
* instrucciones
* límites
* decisiones permitidas
* decisiones prohibidas
* formato de salida esperado

5.5 Intervención humana

El usuario debe poder intervenir entre fases, nunca en mitad de una fase en ejecución.

Acciones posibles del usuario entre checkpoints:

* añadir contexto por chat
* modificar markdown directamente
* pausar una UH
* reanudar una UH
* aprobar una fase
* forzar regresión
* cambiar instrucciones de la siguiente fase
* cambiar agente asignado si aplica

Toda intervención debe registrarse y persistirse.

5.6 Review y regresión

Tras la implementación, otro agente debe poder revisar si lo generado cumple con:

* la US o UH
* el refinement
* el diseño técnico
* el plan si existe
* las restricciones del repo

Si no cumple:

* generar findings estructurados
* devolver a la fase adecuada
* actualizar métricas de regresión
* añadir instrucciones de corrección

Si se detecta embucle:

* escalar al usuario
* dejar la UH en estado waiting_user o blocked según corresponda

5.7 PR

Si la implementación pasa validación:

* notificar al usuario
* permitir revisión humana final
* si el usuario la aprueba, preparar la PR

La creación real de la PR puede quedar como integración inicial o como interfaz preparada para una fase posterior, pero debe contemplarse en el diseño.

5.8 Ejecución paralela

La herramienta debe diseñarse para soportar:

* varias UHs en paralelo
* y más adelante ejecución paralela dentro de una misma UH mediante subtrabajos seguros

Escenarios futuros dentro de una misma UH:

* frontend y backend en paralelo
* tests y documentación en paralelo
* slices independientes con reconciliación posterior

No quiero que esto se implemente de forma naive. Debe haber:

* planificación
* detección de colisiones
* mapa de componentes afectados
* barreras de sincronización

⸻

1. Flujo objetivo base

Flujo base orientativo:

1. El usuario introduce una US o UH.
2. El sistema genera el refinement y lo persiste en markdown.
3. El usuario revisa y da el ok.
4. El sistema genera diseño técnico.
5. Según el workflow, puede requerir o no aprobación humana.
6. El sistema implementa.
7. Otro agente revisa lo implementado.
8. Si falla, regresa con findings a la fase adecuada.
9. Si se embucla o hay ambigüedad irresoluble, escala al usuario.
10. Si todo va bien, se notifica al usuario.
11. El usuario revisa y, si aprueba, se prepara la PR.

Este flujo debe ser configurable.

⸻

1. Modelo de dominio esperado

Diseña, documenta e implementa un modelo de dominio explícito.

Entidades mínimas:

* Workflow
* Phase
* PhaseTransition
* AgentProfile
* UserStory o UH
* PhaseExecution
* Handoff
* Regression
* Intervention
* ProjectMetrics
* UHMetrics
* IssueLink
* ProviderConfiguration
* ExecutionResult
* UHSourceType
* DocumentSyncEvent
* ManualEditDetection
* ConversationContribution
* Checkpoint
* PauseRequest
* ExecutionSlice
* ComponentScope
* ExecutionPlan
* DependencyEdge

Quiero invariantes claras y contratos bien definidos.

⸻

1. Estados y ciclo de vida

8.1 Estado de fase

Cada fase debe poder estar en estados como:

* pending
* ready
* running
* completed
* failed
* blocked
* paused
* waiting_user
* regressed

8.2 Estado global de UH

Cada UH debe tener un estado global como:

* active
* paused
* blocked
* completed
* cancelled
* waiting_user

Debe existir trazabilidad completa de cambios de estado.

⸻

1. Métricas obligatorias

Diseña desde el principio cómo medir y persistir, como mínimo:

Por UH:

* iterationCount
* handoffCount
* regressionCount
* manualInterventionCount
* automaticHandoffPercentage
* rejectedTransitionsCount
* reviewFailCount
* reviewPassCount
* phaseLeadTime
* uhCycleTime estimado
* conversationContributionCount
* manualDocumentEditCount
* issueCountLinkedToImplementation

Por proyecto:

* UHs abiertas, bloqueadas, cerradas
* fases con mayor fricción
* agentes que generan más regresión
* workflows con mejor ratio de aprobación
* tendencia de intervención humana
* tendencia de issues tras implementación

Distingue entre métricas observables e inferidas.

⸻

1. Estructura de carpetas esperada

Quiero una estructura de repo equivalente o mejorada a esta:

.sdd/
  README.md
  config/
    providers/
      openai.md
      providers.schema.json
    workflows/
      default-workflow.md
      workflow.schema.json
    agents/
      default-spec-agent.md
      default-design-agent.md
      default-implementer-agent.md
      default-reviewer-agent.md
      agents.schema.json
    settings/
      extension-settings.md
  prompts/
    00_system_master_prompt.md
    01_initial_product_uh_prompt.md
    02_next_phase_prompt.md
    03_sync_chat_to_markdown_prompt.md
    04_review_and_regression_prompt.md
    05_workflow_design_prompt.md
    06_agent_profile_design_prompt.md
    07_metrics_and_telemetry_prompt.md
  templates/
    uh.template.md
    phase-output.template.md
    feature-spec.template.md
    technical-design.template.md
    plan.template.md
    review-report.template.md
    issue-link.template.md
  projects/
    <project-id>/
      overview.md
      glossary.md
      architecture.md
      constraints.md
      workflows/
      agents/
      phases/
      metrics/
      issues/
      runs/
  uhs/
    <uh-id>/
      uh.md
      state.json
      timeline.md
      metrics.json
      context/
      phases/
        01-idea/
          input.md
          output.md
          handoff.md
        02-functional-spec/
          input.md
          output.md
          handoff.md
        03-technical-design/
          input.md
          output.md
          handoff.md
  docs/
    domain/
    architecture/
    decisions/
    troubleshooting/

Si introduces cambios, justifícalos.

⸻

1. Stack técnico recomendado

Extensión VS Code

* TypeScript
* VS Code Extension API
* comandos
* tree views
* webviews solo si son necesarias

MCP Server

Puedes elegir una de estas dos opciones, justificando la elección:

Opción A

TypeScript, para velocidad de prototipado y alineación con la extensión.

Opción B

C#, para un backend más robusto, tipado fuerte y dominio más mantenible.

Quiero que evalúes ambas y propongas la que tenga más sentido para una base seria de producto.

En cualquier caso, la extensión y el MCP deben quedar desacoplados.

⸻

1. Integración con proveedores

El sistema debe usar una abstracción de proveedor.

Interfaz esperada, conceptual:

* generatePhaseOutput
* reviewPhase
* summarizeDelta
* maybePlanSlices

Implementación inicial:

* OpenAI API

No quiero acoplamiento a un único proveedor.

⸻

1. Tools MCP esperadas

Diseña e implementa las tools del MCP como mínimo alrededor de estas capacidades:

* create_uh_from_chat
* import_uh_from_markdown
* list_uhs
* get_uh_summary
* get_current_phase
* generate_next_phase
* persist_chat_context_to_phase
* register_manual_intervention
* request_regression
* approve_phase
* pause_uh
* resume_uh
* get_uh_metrics
* get_project_metrics
* open_artifact_metadata
* link_issue_to_uh

Además, define resources y prompts MCP reutilizables.

⸻

1. Requisitos de implementación incremental

No quiero que intentes resolverlo todo de golpe. Trabaja por fases.

Fase 1

* modelo de dominio base
* estructura de repo
* persistencia en .sdd/
* crear/importar UH
* listar UHs
* fase actual
* generar siguiente fase
* métricas mínimas

Fase 2

* extensión VS Code básica
* árbol de UHs
* comandos crear/importar/continuar
* abrir markdown principal
* pausa y reanudación

Fase 3

* review formal
* regresión
* intervención humana registrada
* trazabilidad avanzada

Fase 4

* workflows personalizables
* agentes por fase
* paneles más ricos
* métricas más completas

Fase 5

* planificación paralela
* detección de colisiones
* slices internos por UH
* integración con PR e issues

⸻

1. Criterios de calidad

1. No generes humo.
1. No escondas deuda técnica.
1. Marca qué decisiones son reversibles y cuáles no.
1. Prioriza una arquitectura limpia sobre un prototipo aparente.
1. Asegura tipado fuerte y claridad de contratos.
1. Añade tests unitarios al menos para el dominio y el motor de workflow.
1. Añade documentación viva desde el principio.
1. No relegues la trazabilidad al final.
1. No supongas que todo se resuelve con prompts.
1. Si no implementas algo aún, deja la interfaz o el diseño preparados.

⸻

1. Qué espero de ti en la primera iteración

Quiero que, en tu primera respuesta y primer conjunto de cambios:

1. Identifiques los elementos principales del producto.
2. Propongas la arquitectura concreta.
3. Propongas el stack recomendado para extensión y MCP.
4. Diseñes el modelo de dominio inicial.
5. Definas la estructura de carpetas del repo.
6. Crees los artefactos base markdown necesarios.
7. Definas el contrato inicial del MCP.
8. Propongas el plan de implementación incremental.
9. Empieces a implementar solo la primera fase realista.

No quiero una implementación anárquica. Quiero que primero fijes bien el terreno.

⸻

1. Formato de salida obligatorio

En cada iteración, quiero que me devuelvas claramente:

1. Fase actual del trabajo
2. Siguiente fase propuesta
3. Elementos identificados
4. Arquitectura propuesta
5. Modelo de dominio
6. Archivos a crear o modificar
7. Cambios ejecutados
8. Riesgos y decisiones abiertas
9. Próxima acción recomendada

⸻

1. Instrucción final

Trabaja sobre SpecForge como producto serio.

No lo reduzcas a un asistente de prompts.
No lo reduzcas a una simple extensión bonita.
No lo reduzcas a un flujo rígido sin intervención humana.

Quiero una base de herramienta usable, extensible y con verdadero valor para equipos.

Empieza identificando correctamente los elementos del sistema y proponiendo la primera fase ejecutable de construcción.
