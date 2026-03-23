# Arquitetura Atual

## Web
Pasta: `water-reminder-web`

Responsabilidades:
- login Google
- sincronizacao com Firestore
- dashboard no navegador
- pagina publica com acesso ao app
- botao para baixar APK Android

Tecnologias:
- HTML
- CSS
- JavaScript
- Firebase Auth
- Firestore
- Vercel

## Mobile
Pasta: `water-reminder-mobile`

Responsabilidades:
- uso principal do produto
- notificacoes locais
- rotina de hidratacao
- historico e analytics
- sincronizacao com Firestore
- login Google

Tecnologias:
- Capacitor
- iOS / Xcode
- Android / Android Studio
- Firebase Auth
- Firestore

## Backend
Servico atual:
- Firebase Authentication
- Firestore

Responsabilidades:
- autenticacao Google
- persistencia por usuario
- sincronizacao entre web e mobile

## Regra principal
Web e mobile devem compartilhar:
- identidade visual
- textos principais
- modelo de dados
- regras de negocio de hidratacao
- sincronizacao de conta
