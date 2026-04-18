# SpecForge · Plantilla `us.md` fase 1

## Objetivo

Definir la plantilla mínima de `us.md` como artefacto fuente estable de la historia de usuario.

## Principios

- debe ser breve
- debe ser estable una vez arrancado `refinement`
- no debe intentar contener el refinement ni el diseño técnico
- debe capturar intención, alcance inicial y restricciones conocidas

## Plantilla propuesta

```md
# US-0001 · <titulo breve>

## Metadata
- Kind: `feature` | `bug` | `hotfix`

## Estado
- Estado: `draft`
- Prioridad: `alta`
- Origen: `chat` | `markdown-import`
- Creada: `2026-04-18T10:00:00Z`

## Objetivo
Describe qué valor se quiere conseguir y para quién.

## Problema
Qué problema actual existe y por qué merece resolverse.

## Alcance inicial
- Incluye:
  - ...
- No incluye:
  - ...

## Restricciones conocidas
- ...
- ...

## Supuestos iniciales
- ...
- ...

## Criterios de aceptación iniciales
- [ ] ...
- [ ] ...
- [ ] ...

## Contexto adicional
Notas, referencias, links internos o dependencias conocidas.
```

## Notas de uso

- `us.md` es el punto de entrada del workflow
- `Kind` gobierna el prefijo de la rama de trabajo futura
- tras iniciar `refinement`, su contenido deja de mutar el flujo automáticamente
- si cambia y el usuario quiere incorporarlo, debe reiniciarse la US
