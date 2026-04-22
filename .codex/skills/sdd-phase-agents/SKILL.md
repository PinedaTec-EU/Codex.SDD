# SDD Phase Agents

Skill local para el workflow SDD de este repositorio.

## Logging de desarrollo

- Mientras el repositorio este en desarrollo activo, cada cambio funcional en el flujo de extension, sidebar, workflow panel o integracion MCP debe dejar trazas suficientes en `SpecForge.AI` output para depuracion operativa.
- Como minimo deben quedar registrados:
  - comando recibido;
  - decision de estado relevante;
  - transiciones de playback o autoplay;
  - llamadas backend sensibles y su resultado;
  - motivos de bloqueo, pausa o rechazo;
  - errores con contexto suficiente para reconstruir la ruta funcional.
- Si una decision automatica depende de un flag o de `workflow.controls`, registra tambien la decision tomada y el valor relevante.
- Usa `appendSpecForgeLog(...)` para eventos operativos que deban verse siempre y `appendSpecForgeDebugLog(...)` para detalle adicional orientado a desarrollo.
- No reduzcas ni ocultes logging util de diagnostico en modo desarrollo salvo que exista ruido claramente redundante y el reemplazo conserve la trazabilidad funcional.
