# quintoandar.com.br — QuintoAndar

URL analisada: https://www.quintoandar.com.br/

## Pré-análise (26/09/2026)

Amostra preliminar em navegador Chromium, 10 s após o carregamento, sem interagir
com o banner. Serviu só para escolher o site; **não é evidência** do relatório.

- 10 sites de terceira parte: `googletagmanager.com`, `google-analytics.com`,
  `google.com`, `doubleclick.net` (`ad.` e `googleads.g.`), `criteo.com`
  (`gum.criteo.com`), `hotjar.com`, `amplitude.com`, `braze.com`, `appsflyer.com`,
  `sentry.io`
- 25 cookies em `document.cookie`; 30 chaves no localStorage; 4 no sessionStorage
- Pontos a investigar:
  - Hotjar: gravação de sessão (teste "session recording" do Blacklight)
  - `gum.criteo.com`: endpoint de sincronização de usuários do Criteo (cookie sync)
  - `tracking.quintoandar.com.br` e `event-gateway.quintoandar.com.br`: coleta de
    eventos em subdomínio próprio; verificar CNAME (possível rastreamento disfarçado
    de primeira parte, que o uBlock Origin desmascara no Firefox e o plugin não)
  - Amplitude, Braze e AppsFlyer: analytics de produto e atribuição de marketing

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
