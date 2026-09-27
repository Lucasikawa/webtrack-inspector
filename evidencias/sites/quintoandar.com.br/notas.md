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

## Pré-análise no Firefox (27/09/2026, plugin 0.3.0, perfil de teste automatizado)

Também não é evidência; orienta o que conferir na coleta.

- 139 requisições, 10 sites de terceira parte (9 rastreadores pelo Firefox);
  `googletagmanager.com` não é classificado como rastreador pelo Firefox.
- 23 cookies; 7 de 1ª parte gravados por scripts de 3ª parte, ex.:
  `crto_mapped_user_id` e `crto_is_user_optout` (Criteo) gravados por
  `googletagmanager.com/gtm.js` (tag do Criteo injetada pelo GTM).
- `FPID`, `FPAU`, `FPLC` via HTTP de 1ª parte + iframe de
  `tracking.quintoandar.com.br`: indício de Google Analytics servido pelo próprio
  domínio (confirmar no HAR).
- SDKs de Braze e Amplitude vêm empacotados em `static.quintoandar.com.br`: suas
  chaves de storage aparecem como gravadas por script de 1ª parte.
- ~905 KB de localStorage; nenhum fingerprinting detectado.

## Achados da coleta de 27/09/2026

- `_fbp` (cookie do Facebook Pixel) definido via HTTP por
  `tracking.quintoandar.com.br/g/collect`: coleta servida por subdomínio próprio
  (server-side tagging), invisível como terceiro para o plugin e para o Blacklight
  ("Facebook Pixel not found").
- uBO desmascara CNAME: `id.quintoandar.com.br` → `d5tahiiw7y2sk.cloudfront.net`.
- Blacklight: 5 ad trackers, 0 cookies de terceiros, **gravação de sessão**
  (Hotjar), empresas Alphabet, Criteo, HotJar. Plugin: 9 sites de 3ª parte (8
  rastreadores), 15 cookies, todos de 1ª parte (4 gravados por scripts de 3ª parte).
- uBO: 13 bloqueios, 4 de 9 domínios conectados (amplitude, google-analytics,
  googletagmanager, hotjar, sentry bloqueados).

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
| 27/09/2026 20:05 | 0.3.0 (`82e536d`) | 20:05:34–20:08:38, 171 entradas | 20:06:56–20:07:17; JSON 20:07:14 | 20:39 (19:39 ET) | 20:26–20:27, uBO 1.75.0 |
