# Checklist de Mudanca Compartilhada

Use este checklist sempre que uma mudanca puder afetar web e mobile.

## 1. Escopo
- a mudanca e so visual?
- a mudanca altera regra de negocio?
- a mudanca altera autenticacao?
- a mudanca altera sincronizacao?
- a mudanca altera analytics?
- a mudanca altera notificacoes?

## 2. Avaliar impacto em Web
- precisa mudar textos?
- precisa mudar layout?
- precisa mudar autenticacao?
- precisa mudar leitura/escrita no Firestore?
- precisa mudar fluxo de download/distribuicao?

## 3. Avaliar impacto em Mobile
- precisa mudar textos?
- precisa mudar layout?
- precisa mudar autenticacao?
- precisa mudar leitura/escrita no Firestore?
- precisa mudar notificacoes?
- precisa rebuildar iOS?
- precisa rebuildar Android?

## 4. Avaliar impacto em Dados
- muda estrutura do documento no Firestore?
- precisa migrar dados antigos?
- muda alguma chave persistida localmente?
- muda alguma regra de negocio de historico/meta/progresso?

## 5. Validacao minima
### Web
- login
- sincronizacao
- configuracao
- progresso de hoje
- analytics
- download Android

### Mobile
- login
- sincronizacao
- configuracao
- progresso de hoje
- analytics
- notificacoes

## 6. Publicacao
### Web
- git add
- git commit
- git push
- validar Vercel
- refresh forcado para validar cache

### Mobile
- npm run build
- cap sync
- validar iOS
- validar Android
- gerar APK se necessario

## 7. Decisao
Antes de implementar, classificar a mudanca como:
- so web
- so mobile
- compartilhada
