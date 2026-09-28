# quintoandar.com.br: QuintoAndar

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
- Blacklight (`blacklight/raw/inspection.json`, 23:39:52Z = 20:39 BRT, Chrome
  headless a partir de `us-ca`): 5 ad trackers (60 requisições a 11 hosts, 44 pela
  EasyPrivacy e 16 pela EasyList), 0 cookies de terceiros (de 6), **gravação de
  sessão** (`script.hotjar.com`, `static.hotjar.com`), nenhum fingerprinting,
  listeners de mouse (7), teclado (6) e toque (3); empresas Alphabet, Criteo,
  HotJar. Plugin: 9 sites de 3ª parte (8
  rastreadores), 15 cookies, todos de 1ª parte (4 gravados por scripts de 3ª parte).
- uBO: 13 bloqueios, 4 de 9 domínios conectados (amplitude, google-analytics,
  googletagmanager, hotjar, sentry bloqueados).

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
| 27/09/2026 20:05 | 0.3.0 (`82e536d`) | 20:05:34–20:08:38, 171 entradas | 20:06:56–20:07:17; JSON 20:07:14 | 20:39 (19:39 ET) | 20:26–20:27, uBO 1.75.0 |
| 28/09/2026 00:18 (coleta final, `final/`) | 0.7.0 | 00:18:26–00:18:39, 157 entradas; recarga da página, com cookies de visitas anteriores | Score 00:19–00:21, Alertas 00:21–00:24; JSON 00:25:18, mesmo carregamento (início 00:18:26) | — | — |

**Visita anterior na 1ª coleta.** A primeira requisição do HAR da 1ª coleta já levava cookies do site (`5ANNEX` e outros), ou seja, houve uma visita antes da gravação sem limpar os dados: o HAR e o JSON v0.3.0 são de uma visita de retorno, enquanto o Blacklight faz sempre a primeira visita. Cookies já gravados e não regravados no carregamento não entram na contagem de injetados. O mesmo vale para a coleta final (ver abaixo).

**Coleta final também é visita de retorno.** A coleta final é uma recarga (`transition: reload`) de uma página do QuintoAndar já aberta, e a primeira requisição do HAR leva cookies gravados às 23:30–23:31 de 27/09 (`amplitude_id_…`, `FPAU=1.3.1075676241.1790562662`, `FPGCLAW` com um `gclid`): a limpeza de dados não teve efeito. O `gclid` (identificador de clique em anúncio do Google Ads) indica que uma das visitas anteriores veio de um anúncio. Os 3 repasses de `5A_gclid` para `doubleclick.net`, `google.com` e `google.com.br` no critério de sincronização são, por isso, artefato da coleta e não comportamento de uma primeira visita: sem eles o score seria 66 (C) em vez de 63 (C). Tentativas descartadas: 27/09 23:31 (HAR e prints) e 23:41 (JSON), de visitas diferentes entre si.
