# Water Reminder Mobile

Projeto separado para a versao mobile com foco em:

- notificacoes locais em background
- armazenamento local no aparelho
- Android e iPhone
- evolucao futura para sincronizacao e login

## Objetivo do MVP

Primeira versao:

- meta diaria de agua
- dose por clique
- janela de horario
- intervalo de lembrete
- historico local
- notificacoes locais

## Stack planejada

- Capacitor
- app shell web simples
- plugin de notificacoes locais

## Estrutura inicial

- `www/`: app base web para o shell do mobile
- `docs/roadmap.md`: escopo e fases

## Quando Node estiver disponivel

Na pasta `mobile`, os proximos passos serao:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init water-reminder-mobile com.bielpaz.waterreminder
```

Depois:

```bash
npx cap add android
npx cap add ios
```

## Observacao

Este projeto foi separado da versao web publicada para evitar quebrar o PWA atual.
