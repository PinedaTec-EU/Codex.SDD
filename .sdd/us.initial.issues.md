# SpecForge · Lista de trabajo Red Team / Blue Team

Documento auxiliar para resolver punto a punto los hallazgos sobre [.sdd/us.initial.md](.sdd/us.initial.md).

## Estado

- Fecha: 2026-04-17
- Fuente analizada: [.sdd/us.initial.md](.sdd/us.initial.md)
- Objetivo: cerrar riesgos y convertir la vision en especificacion ejecutable

## Red Team Findings (riesgos y debilidades)

### RT-01 · Critico · Maquina de estados no operativa

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L313), [.sdd/us.initial.md](.sdd/us.initial.md#L327), [.sdd/us.initial.md](.sdd/us.initial.md#L338)
- Problema:
  - Hay listado de estados, pero no hay tabla formal de transiciones validas, precondiciones, postcondiciones, idempotencia ni recovery policy.
- Impacto:
  - Riesgo de estados imposibles, bloqueos y comportamiento no determinista.
- Criterio de cierre:
  - Existe un State Model v1 con transiciones, invariantes y reglas de error/cancelacion.

### RT-02 · Critico · Repo como fuente de verdad sin politica de concurrencia

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L68), [.sdd/us.initial.md](.sdd/us.initial.md#L70), [.sdd/us.initial.md](.sdd/us.initial.md#L236)
- Problema:
  - No se define control de escrituras concurrentes sobre artefactos por UH.
- Impacto:
  - Colisiones en paralelo, corrupcion de estado y conflictos de merge sin estrategia.
- Criterio de cierre:
  - Definida politica de locking/versionado + resolucion de conflictos.

### RT-03 · Alto · Seguridad y cumplimiento no definidos

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L485), [.sdd/us.initial.md](.sdd/us.initial.md#L496), [.sdd/us.initial.md](.sdd/us.initial.md#L523)
- Problema:
  - Faltan controles para secretos, prompt injection, autorizacion de tools MCP y auditoria.
- Impacto:
  - Riesgo de fuga de datos, acciones no autorizadas y trazabilidad insuficiente.
- Criterio de cierre:
  - Baseline de seguridad documentado e integrado en Fase 1.

### RT-04 · Alto · Contrato MCP sin semantica operacional completa

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L502)
- Problema:
  - No hay estandar de errores, reintentos, correlacion, idempotencia, cancelacion ni timeouts.
- Impacto:
  - Acoplamiento accidental extension-servidor y errores ambiguos.
- Criterio de cierre:
  - MCP Contract v1 con envelope, errores tipados y comportamiento de retries.

### RT-05 · Alto · Metricas sin formulas ni gobernanza de calidad

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L342), [.sdd/us.initial.md](.sdd/us.initial.md#L371)
- Problema:
  - Metricas listadas por nombre pero no definidas con formula, unidad, fuente y ventanas.
- Impacto:
  - Inconsistencia, sesgo y baja comparabilidad entre equipos/proyectos.
- Criterio de cierre:
  - Metrics Dictionary v1 completo (observable vs inferida).

### RT-06 · Medio-alto · Workflows sin versionado ni migraciones

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L159), [.sdd/us.initial.md](.sdd/us.initial.md#L272), [.sdd/us.initial.md](.sdd/us.initial.md#L559)
- Problema:
  - Cambios de workflow pueden romper UHs en curso.
- Impacto:
  - Ejecuciones huerfanas o incompatibles.
- Criterio de cierre:
  - WorkflowVersion + Migration Rules definidos.

### RT-07 · Medio · Intervencion humana sin gobernanza de permisos

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L185), [.sdd/us.initial.md](.sdd/us.initial.md#L200), [.sdd/us.initial.md](.sdd/us.initial.md#L222)
- Problema:
  - No se define quien puede aprobar, forzar regresion o desbloquear.
- Impacto:
  - Riesgo operativo y de cumplimiento en equipos.
- Criterio de cierre:
  - Modelo de roles/permisos minimo definido.

### RT-08 · Medio · Fases incrementales sin Definition of Done

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L527), [.sdd/us.initial.md](.sdd/us.initial.md#L573)
- Problema:
  - Falta criterio objetivo de cierre por fase.
- Impacto:
  - Progreso subjetivo y deuda tecnica acumulada.
- Criterio de cierre:
  - DoD por fase y gates de calidad definidos.

### RT-09 · Medio · Decision de stack MCP sin scorecard objetivo

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md#L465), [.sdd/us.initial.md](.sdd/us.initial.md#L477)
- Problema:
  - Falta matriz de decision con criterios ponderados.
- Impacto:
  - Riesgo de reversal cost alto en fases futuras.
- Criterio de cierre:
  - Decision record con scorecard trazable.

### RT-10 · Medio · Edicion de workflows en sistema sin alcance tecnico cerrado

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md)
- Problema:
  - Se incorpora la capacidad de disenar/editar workflows SDD (incluido el principal), pero falta definir restricciones, versionado de cambios y validaciones de guardarrailes.
- Impacto:
  - Riesgo de romper UHs en curso o de generar configuraciones invalidas.
- Criterio de cierre:
  - Especificacion de editor de workflows + validaciones + politica de versionado aplicadas.

### RT-11 · Medio · Detalle de fase y apertura de ficheros sin contrato UX-tecnico

- Estado: [ ] Pendiente
- Referencias: [.sdd/us.initial.md](.sdd/us.initial.md)
- Problema:
  - Se incorpora panel con detalle de fase y apertura de ficheros relacionados, pero falta contrato de descubrimiento de ficheros, orden, filtros y estado de inexistentes.
- Impacto:
  - Experiencia inconsistente y riesgo de errores de navegacion/contexto.
- Criterio de cierre:
  - Contrato funcional de phase-file panel y comportamiento de apertura definido y probado.

## Blue Team Improvements (acciones de refuerzo)

### BT-01 · State Model v1

- Estado: [ ] Pendiente
- Accion:
  - Definir transiciones validas, invariantes, acciones permitidas y eventos por estado.
- Entregable:
  - Especificacion de maquina de estados y tests unitarios de transicion.

### BT-02 · Event Sourcing ligero para trazabilidad

- Estado: [ ] Pendiente
- Accion:
  - Persistir eventos append-only y proyectar state.json y vistas derivadas.
- Entregable:
  - Modelo de eventos + proyecciones iniciales.

### BT-03 · MCP Contract v1 con envelope estandar

- Estado: [ ] Pendiente
- Accion:
  - Definir requestId, correlationId, actor, toolVersion, idempotencyKey, status, errorCode, retryable, timestamp.
- Entregable:
  - Contrato json schema + guia de errores.

### BT-04 · Politica de concurrencia en repo

- Estado: [ ] Pendiente
- Accion:
  - Implementar lease por UH con expiracion + control de version de artefactos.
- Entregable:
  - Concurrency policy y estrategia de conflicto.

### BT-05 · Diccionario de metricas v1

- Estado: [ ] Pendiente
- Accion:
  - Definir formula, unidad, origen, ventana temporal y calidad del dato para cada metrica.
- Entregable:
  - Metrics dictionary en markdown + validaciones minimas.

### BT-06 · Versionado de workflows y agentes

- Estado: [ ] Pendiente
- Accion:
  - Introducir WorkflowVersion y reglas de migracion para UHs en curso.
- Entregable:
  - Especificacion de versionado + politica de compatibilidad.

### BT-07 · Modelo de permisos operativo

- Estado: [ ] Pendiente
- Accion:
  - Definir roles minimos (owner, reviewer, operator) y autorizaciones por accion.
- Entregable:
  - Matriz de permisos + enforcement en tools sensibles.

### BT-08 · Gates de calidad por fase

- Estado: [ ] Pendiente
- Accion:
  - Definir checklist minimo y pruebas obligatorias para salida de cada fase.
- Entregable:
  - DoD por fase + reglas de bloqueo de transicion.

### BT-09 · Scorecard de decision tecnologica MCP

- Estado: [ ] Pendiente
- Accion:
  - Evaluar TypeScript vs C# con criterios ponderados: robustez, velocidad, coste, observabilidad, testabilidad.
- Entregable:
  - ADR con decision final y trade-offs.

### BT-10 · Baseline de seguridad desde Fase 1

- Estado: [ ] Pendiente
- Accion:
  - Definir controles minimos: secretos, sanitizacion, allowlists de tools, redaccion de logs.
- Entregable:
  - Security baseline v1 y lista de controles implementados.

### BT-11 · Workflow Designer/Editor en sistema

- Estado: [ ] Pendiente
- Accion:
  - Definir e implementar capacidades de crear, editar y validar workflows SDD desde el propio sistema, incluyendo el workflow principal por defecto.
- Entregable:
  - Contrato de editor de workflow + validaciones + persistencia versionada.

### BT-12 · Panel de detalle de fase con ficheros relacionados

- Estado: [ ] Pendiente
- Accion:
  - Definir e implementar vista de detalle por fase con listado de ficheros relacionados y apertura en ventana/editor independiente al seleccionar un fichero.
- Entregable:
  - Especificacion UX + integracion extension para apertura de archivos desde panel de fase.

## Plan de implementacion fase a fase

### Fase 0 · Alineacion y decisiones base

- Objetivo:
  - Reducir ambiguedad inicial y desbloquear decisiones estructurales.
- Carencias atacadas:
  - RT-09, Q-01, Q-02, Q-03.
- Alcance:
  - Definir decision de stack MCP con scorecard.
  - Cerrar alcance de gobernanza (single-repo o multi-repo).
  - Cerrar modelo de permisos (repo, UH o mixto).
- Entregables:
  - ADR de stack MCP con criterios ponderados y recomendacion final.
  - Decision de scope de ejecucion y scope de permisos.
  - Lista de decisiones reversibles y no reversibles.
- Validacion:
  - Existe acuerdo explicito sobre stack y governance.
  - Ningun punto critico de arquitectura queda sin owner.
- Dependencias:
  - Ninguna.

### Fase 1 · Fundacion operativa del motor

- Objetivo:
  - Convertir la vision en un nucleo ejecutable y verificable.
- Carencias atacadas:
  - RT-01, RT-04, RT-05, RT-08.
- Alcance:
  - State Model v1 con transiciones e invariantes.
  - Contrato MCP v1 con semantica de errores e idempotencia.
  - Metrics Dictionary v1 con formulas y fuentes.
  - DoD y gates minimos para transiciones de fase.
- Entregables:
  - Especificacion de estados y eventos.
  - Contrato de tools MCP con envelope estandar.
  - Diccionario de metricas (observable/inferida).
  - Criterios de salida por fase base del workflow.
- Validacion:
  - Tests unitarios del motor de transiciones en verde.
  - Casos de error MCP cubiertos (timeout, retry, conflicto).
  - Metricas calculables con datos minimos reales.
- Dependencias:
  - Fase 0 cerrada.

### Fase 2 · Persistencia robusta y concurrencia

- Objetivo:
  - Asegurar consistencia de estado en trabajo real de equipo.
- Carencias atacadas:
  - RT-02, BT-02.
- Alcance:
  - Politica de lease por UH y control de version de artefactos.
  - Registro de eventos append-only y proyecciones de estado.
  - Estrategia de deteccion y resolucion de conflictos.
- Entregables:
  - Concurrency policy operativa.
  - Modelo de eventos de dominio minimo.
  - Reglas de reconciliacion en colisiones.
- Validacion:
  - Simulaciones de concurrencia sin corrupcion de estado.
  - Recuperacion correcta tras caida en mitad de ejecucion.
- Dependencias:
  - Fase 1 cerrada.

### Fase 3 · Gobernanza de workflow y permisos

- Objetivo:
  - Hacer segura y sostenible la personalizacion del proceso.
- Carencias atacadas:
  - RT-06, RT-07, BT-06, BT-07.
- Alcance:
  - Versionado de workflows y agentes con reglas de migracion.
  - Modelo de permisos por accion sensible.
  - Enforcement en herramientas de aprobacion/regresion/pausa.
  - Definir guardarrailes del editor de workflows (transiciones validas, regresiones, aprobaciones y compatibilidad).
- Entregables:
  - Politica de compatibilidad y migraciones.
  - Matriz de permisos operativa.
  - Auditoria de acciones humanas criticas.
  - Contrato funcional para edicion de workflows dentro del sistema.
- Validacion:
  - UHs en curso migran sin perder trazabilidad.
  - Acciones no autorizadas son bloqueadas y auditadas.
- Dependencias:
  - Fase 2 cerrada.

### Fase 4 · Seguridad y hardening

- Objetivo:
  - Minimizar riesgo de seguridad antes de escalar uso.
- Carencias atacadas:
  - RT-03, BT-10.
- Alcance:
  - Baseline de seguridad en prompts, tools y logs.
  - Sanitizacion de entradas markdown y control de secretos.
  - Politica de allowlist para herramientas de ejecucion.
- Entregables:
  - Security baseline v1 aplicado.
  - Checklist de controles tecnicos activos.
  - Evidencias de trazabilidad y redaccion de datos sensibles.
- Validacion:
  - Pruebas de abuso basicas superadas.
  - No aparecen secretos en logs ni artefactos de estado.
- Dependencias:
  - Fase 3 cerrada.

### Fase 5 · Consolidacion y readiness

- Objetivo:
  - Cerrar gaps finales y dejar la base lista para iterar producto.
- Carencias atacadas:
  - Cierre integral de RT/BT abiertos.
- Alcance:
  - Revisar deuda tecnica residual y riesgos abiertos.
  - Alinear roadmap de extension VS Code con capacidades del MCP.
  - Definir backlog de evolutivos (paralelizacion avanzada, PR/issues).
  - Cerrar experiencia de panel de fase con apertura de ficheros y validacion de UX operativa.
- Entregables:
  - Informe de cierre de carencias.
  - Roadmap priorizado por impacto/riesgo.
  - Plan de siguientes iteraciones.
  - Acceptance criteria de navegacion por fase/ficheros cumplidos.
- Validacion:
  - No hay criticos abiertos sin fecha o responsable.
  - Existe plan claro para Fase 2-5 del producto original.
- Dependencias:
  - Fase 4 cerrada.

## Matriz de trazabilidad carencia -> fase

- RT-01 -> Fase 1
- RT-02 -> Fase 2
- RT-03 -> Fase 4
- RT-04 -> Fase 1
- RT-05 -> Fase 1
- RT-06 -> Fase 3
- RT-07 -> Fase 3
- RT-08 -> Fase 1
- RT-09 -> Fase 0
- RT-10 -> Fase 3
- RT-11 -> Fase 5
- BT-01 -> Fase 1
- BT-02 -> Fase 2
- BT-03 -> Fase 1
- BT-04 -> Fase 2
- BT-05 -> Fase 1
- BT-06 -> Fase 3
- BT-07 -> Fase 3
- BT-08 -> Fase 1
- BT-09 -> Fase 0
- BT-10 -> Fase 4
- BT-11 -> Fase 3
- BT-12 -> Fase 5

## Ritual de ejecucion por iteracion

1. Planificacion:
   - Seleccionar 1 a 3 items RT/BT de la fase activa.
   - Definir resultado verificable por item.
2. Implementacion:
   - Aplicar cambios minimos y trazables.
   - Registrar decisiones y trade-offs.
3. Verificacion:
   - Ejecutar pruebas y checks definidos para la fase.
   - Marcar estado de cada item (hecho, bloqueado, diferido).
4. Cierre:
   - Actualizar riesgos y siguiente lote.
   - Publicar resumen de avance.

## Criterios de paso entre fases

- Gate G0 (entrada a Fase 1):
  - Q-01, Q-02, Q-03 cerradas.
- Gate G1 (entrada a Fase 2):
  - State model, MCP contract, metricas y DoD aprobados.
- Gate G2 (entrada a Fase 3):
  - Concurrencia y event sourcing validados con escenarios de colision.
- Gate G3 (entrada a Fase 4):
  - Versionado/migracion y permisos auditables activos.
- Gate G4 (entrada a Fase 5):
  - Baseline de seguridad aplicado y comprobado.
- Gate G5 (cierre del plan):
  - Sin riesgos criticos abiertos sin plan.

## Preguntas abiertas (a resolver)

### Q-01 · Scope de ejecucion

- Estado: [ ] Pendiente
- Pregunta:
  - La gobernanza sera single-repo o multi-repo por UH?

### Q-02 · Scope de permisos

- Estado: [ ] Pendiente
- Pregunta:
  - Los permisos aplican por repo, por UH o mixto?

### Q-03 · Prioridad inicial

- Estado: [ ] Pendiente
- Pregunta:
  - Se prioriza robustez MCP (C#) o time-to-market (TypeScript) en Fase 1?

## Orden recomendado de resolucion

1. RT-01 + BT-01 (state model)
2. RT-04 + BT-03 (contrato MCP)
3. RT-05 + BT-05 (metricas)
4. RT-02 + BT-04 (concurrencia)
5. RT-08 + BT-08 (DoD por fase)
6. RT-06 + BT-06 (versionado workflows/agentes)
7. RT-07 + BT-07 (permisos)
8. RT-09 + BT-09 (decision stack)
9. RT-03 + BT-10 (seguridad)
10. Cierre de Q-01/Q-02/Q-03

## Registro de avance

- [ ] Iteracion 1: checklist creado
- [ ] Iteracion 2: state model y MCP contract definidos
- [ ] Iteracion 3: metricas + concurrencia definidos
- [ ] Iteracion 4: versionado + permisos + DoD cerrados
- [ ] Iteracion 5: security baseline y ADR stack cerrados
