# Reconciliação: quintoandar.com.br

Gerado por `tools/reconcile.js` a partir das evidências desta pasta. A coluna
**Causa provável** é classificada automaticamente pelo tráfego dos HARs e deve ser
conferida; cada linha traz a evidência correspondente.

## Fontes

- **Plugin**: `final/plugin.json` (v0.7.0, exportado 2026-09-28T03:25:18.625Z); sites de 3ª parte vistos nos primeiros 30 s.
- **Nosso HAR**: `final/quintoandar.com.br.har`, 157 requisições, 10 sites.
- **uBlock Origin**: `ublock.txt`, 349 requisições, 5 sites com bloqueio.
- **Blacklight**: `blacklight/raw/inspection.json` (2026-09-27T23:39:52.064Z a 2026-09-27T23:40:22.671Z, HeadlessChrome/138.0.7204.0, a partir de `us-ca`; páginas: https://www.quintoandar.com.br/, https://www.quintoandar.com.br/condominios/sao-bernardo-do-campo-sp-brasil); `blacklight/raw/requests.har` com 233 requisições.

## Resumo

| | Plugin | uBlock Origin | Blacklight |
|---|---|---|---|
| Sites rastreadores | 8 (listas do Firefox) | 5 com bloqueio | 9 (EasyList/EasyPrivacy) |
| Sites de 3ª parte | 9 | 7 | 10 (no HAR) |
| Cookies de 3ª parte | 0 | — | 0 |

Rastreadores: **6** em comum com o Blacklight; **3** só no Blacklight (2 deles ausentes do nosso HAR, ou seja, não carregados na nossa visita); **2** só no plugin.

## Rastreadores por site

| Site | Plugin | uBO | Blacklight | Nosso HAR | HAR Blacklight | Causa provável | Evidência |
|---|---|---|---|---|---|---|---|
| amplitude.com | rastreador (tracking_analytics) | bloqueou 15/15 | easyprivacy.txt (12) | 3 | 11 | concordam | `https://api.amplitude.com/` |
| google-analytics.com | rastreador (tracking_analytics) | bloqueou 6/6 | easyprivacy.txt (3) | 1 | 1 | concordam | `https://www.google-analytics.com/analytics.js` |
| hotjar.com | rastreador (tracking_analytics) | bloqueou 2/2 | easyprivacy.txt (2) | 2 | 2 | concordam | `https://static.hotjar.com/c/hotjar-1203740.js?sv=6` |
| sentry.io | rastreador (tracking_analytics) | bloqueou 3/3 | easyprivacy.txt (4) | 1 | 2 | concordam | `https://o105464.ingest.sentry.io/api/6200094/envelope/?sentry_key=588948a2a3b541049f0b5f34` |
| doubleclick.net | rastreador (tracking_ad) | não requisitado | easylist.txt, easyprivacy.txt (16) | 4 | 17 | concordam; não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://googleads.g.doubleclick.net/pagead/viewthroughconversion/928881125/?random=1191742` |
| google.com | rastreador (tracking_content) | não requisitado | easylist.txt (12) | 6 | 25 | concordam; não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://www.google.com/rmkt/collect/928881125/?random=1191742211&fst=1790565508690&cv=10&f` |
| braze.com | rastreador (tracking_ad) | permitiu 16 | visto, não classificado | 4 | 4 | nas duas visitas; o Firefox classifica (tracking_ad), as listas EasyList/EasyPrivacy do Blacklight não | `https://customer.iad-03.braze.com/api/v3/data/` |
| google.com.br | rastreador (tracking_content) | não requisitado | não visto | 3 | 0 | ausente do HAR do Blacklight: não carregado na visita dele (região ou momento); não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://www.google.com.br/pagead/1p-user-list/928881125/?random=879145921&fst=179056440000` |
| googletagmanager.com | visto, não classificado | bloqueou 6/6 | easyprivacy.txt (5) | 2 | 3 | nas duas visitas; a lista do Firefox (Disconnect) não o classifica, a easyprivacy.txt sim; uBO bloqueia (googletagmanager_gtm.js:5) sem classificação do Firefox | `https://www.googletagmanager.com/gtm.js?id=GTM-M6VG8FQ` |
| criteo.com | não visto | não requisitado | easyprivacy.txt (2) | 0 | 2 | ausente do nosso HAR; no HAR do Blacklight foi disparado por googletagmanager.com (leilão/sincronização da visita a partir dos EUA) | `https://gum.criteo.com/sync?c=803&r=2&a=1&j=crto_callback` |
| googleadservices.com | não visto | não requisitado | easyprivacy.txt (4) | 0 | 4 | ausente do nosso HAR: não carregado na visita a partir do Brasil (anúncio/segmentação por região ou momento) | `https://www.googleadservices.com/pagead/conversion/928881125/?random=2116417422&fst=179055` |

## Categorias (testes do Blacklight)

Colunas "no HAR": regras do plugin (`categories.js`) aplicadas a cada HAR.

| Categoria | Blacklight reportou | No HAR do Blacklight | No nosso HAR |
|---|---|---|---|
| gravação de sessão | sim | sim: hotjar.com | sim: hotjar.com |
| pixel do Facebook | não | não | não |
| pixel do TikTok | não | não | não |
| pixel do X (Twitter) | não | não | não |
| Google Analytics com remarketing | não | sim: doubleclick.net | não |
| LinkedIn Insight | (não é teste do Blacklight) | não | não |

## CNAMEs desmascarados pelo uBlock Origin

O uBO no Firefox resolve o DNS de cada host (`browser.dns`); o plugin não. Um subdomínio do
próprio site que aponta para outro serviço é rastreamento disfarçado de 1ª parte.

| Host requisitado | Aponta para | Subdomínio do próprio site? |
|---|---|---|
| customer.iad-03.braze.com | cf.iad-03.braze.com.cdn.cloudflare.net | não |
| id.quintoandar.com.br | d5tahiiw7y2sk.cloudfront.net | **sim** |

## Fingerprinting

- Blacklight, canvas: nenhum
- Blacklight, fontes: nenhum
- Plugin, coleta manual: nenhum
