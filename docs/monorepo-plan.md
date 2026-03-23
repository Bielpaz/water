# Plano Futuro de Monorepo

## Objetivo
Unificar web e mobile em uma base mais organizada, sem perder a separacao das plataformas.

## Fazer antes do monorepo
- estabilizar web
- estabilizar mobile
- alinhar identidade visual
- alinhar estrutura de telas
- alinhar modelo de dados
- mapear o que pode ser compartilhado

## O que deve virar compartilhado no futuro
- tokens visuais
- textos principais
- regras de negocio
- modelo de dados
- configuracoes de sincronizacao

## O que continua separado
- notificacoes nativas
- configuracoes iOS
- configuracoes Android
- distribuicao web
- build nativo

## Estrutura alvo sugerida
- `apps/web`
- `apps/mobile`
- `packages/shared-ui`
- `packages/shared-domain`
- `packages/shared-config`

## Criterio para migrar
Migrar para monorepo quando:
- as regras principais estiverem estaveis
- a identidade visual estiver consolidada
- os fluxos de autenticacao/sincronizacao estiverem confiaveis
