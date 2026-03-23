# Lembrete de Agua no Navegador

Aplicacao web local para controlar hidratacao com:

- meta diaria em ml
- mensagem personalizada
- janela de horario
- intervalo entre lembretes
- progresso salvo no `localStorage`
- notificacoes do navegador
- historico diario persistente
- visualizacao por dia, semana, mes e ano
- calendario mensal com meta vs realizado
- graficos de barras e linhas
- instalacao como PWA no Android e iPhone

## Rodar localmente

Opcao 1:

```bash
cd /Users/biel/Desktop/Codex
python3 -m http.server 4173
```

Opcao 2:

```bash
cd /Users/biel/Desktop/Codex
npm start
```

Abra:

```text
http://localhost:4173
```

## Instalar no celular

`localhost` so funciona no proprio computador. Para abrir no celular, ele precisa acessar o IP local do seu Mac na mesma rede Wi-Fi.

1. No Mac, rode:

```bash
cd /Users/biel/Desktop/Codex
python3 -m http.server 4173
```

2. Descubra o IP local do Mac:

```bash
ipconfig getifaddr en0
```

Se `en0` nao funcionar, tente:

```bash
ipconfig getifaddr en1
```

3. No celular, conectado na mesma rede Wi-Fi, abra:

```text
http://SEU_IP_AQUI:4173
```

Exemplo:

```text
http://192.168.0.15:4173
```

### Android

1. Abra o link no Chrome.
2. Aguarde o botao `Instalar app` aparecer, ou abra o menu do Chrome.
3. Toque em `Instalar app` ou `Adicionar a tela inicial`.

### iPhone

1. Abra o link no Safari.
2. Toque no botao de compartilhar.
3. Toque em `Adicionar a Tela de Inicio`.

## Observacao importante sobre notificacoes

- O PWA pode ser instalado no Android e iPhone.
- As notificacoes e execucao em segundo plano no iPhone sao mais limitadas que em Android.
- Para um app com notificacoes locais mais confiaveis nas duas plataformas, o proximo passo seria empacotar com `Capacitor`.

## Publicar no Vercel

Sim. O `Vercel` eh um hospedador de sites e frontends. Para este projeto, ele funciona bem porque a aplicacao eh estatica.

### Jeito mais simples

1. Acesse [https://vercel.com](https://vercel.com)
2. Crie conta ou entre
3. Clique em `Add New...` > `Project`
4. Importe este projeto via GitHub
5. Clique em `Deploy`

Depois do deploy, o Vercel gera uma URL publica parecida com:

```text
https://water-reminder-web.vercel.app
```

### Fluxo recomendado

1. Crie um repositorio no GitHub com os arquivos desta pasta
2. Conecte esse repositorio no Vercel
3. Deixe o `Framework Preset` como `Other`
4. Nao precisa configurar `Build Command`
5. Nao precisa configurar `Output Directory`
6. Clique em `Deploy`

O arquivo `vercel.json` ja foi adicionado para ajudar no comportamento do `service worker` e do `manifest`.

## Como testar

1. Clique em `Ativar notificacoes`.
2. Defina meta, dose, mensagem, janela e intervalo.
3. Clique em `Salvar configuracao`.
4. Use `Testar lembrete` para validar a notificacao.
5. Use `Registrar agua` para somar a dose no progresso do dia.
6. Use o filtro `Diario/Semanal/Mes/Ano` para explorar o historico.

## Como funciona

- O estado fica salvo no navegador com `localStorage`.
- O app verifica a cada 30 segundos se ja chegou a hora do proximo lembrete.
- O progresso diario eh resetado automaticamente quando vira o dia.
- Quando a meta eh atingida, os lembretes param.
- Cada registro diario fica salvo no historico com consumo e eventos do dia.
- O painel analitico agrega meta versus realizado por periodo.

## Arquivos

- `index.html`: interface
- `style.css`: visual
- `app.js`: logica de lembretes, persistencia e progresso
