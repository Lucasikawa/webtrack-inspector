# Reconciliação: sp.gov.br

Gerado por `tools/reconcile.js` a partir das evidências desta pasta. A coluna
**Causa provável** é classificada automaticamente pelo tráfego dos HARs e deve ser
conferida; cada linha traz a evidência correspondente.

## Fontes

- **Plugin**: `final/plugin.json` (v0.7.0, exportado 2026-09-28T02:29:38.718Z); sites de 3ª parte vistos nos primeiros 30 s.
- **Nosso HAR**: `final/sp.gov.br.har`, 71 requisições, 8 sites.
- **uBlock Origin**: `ublock.txt`, 93 requisições, 1 sites com bloqueio.
- **Blacklight**: `blacklight/raw/inspection.json` (2026-09-27T23:36:48.792Z a 2026-09-27T23:37:08.290Z, HeadlessChrome/138.0.7204.0, a partir de `us-ca`; páginas: https://www.sp.gov.br/sp, https://www.sp.gov.br/sp/institucional/estrutura/prefeituras-paulistas); `blacklight/raw/requests.har` com 77 requisições.

## Resumo

| | Plugin | uBlock Origin | Blacklight |
|---|---|---|---|
| Sites rastreadores | 4 (listas do Firefox) | 1 com bloqueio | 2 (EasyList/EasyPrivacy) |
| Sites de 3ª parte | 6 | 3 | 6 (no HAR) |
| Cookies de 3ª parte | 0 | — | 2 |

Rastreadores: **1** em comum com o Blacklight; **1** só no Blacklight (0 deles ausentes do nosso HAR, ou seja, não carregados na nossa visita); **3** só no plugin.

## Rastreadores por site

| Site | Plugin | uBO | Blacklight | Nosso HAR | HAR Blacklight | Causa provável | Evidência |
|---|---|---|---|---|---|---|---|
| google.com | rastreador (tracking_analytics) | não requisitado | easyprivacy.txt (2) | 1 | 1 | concordam; não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://analytics.google.com/g/collect?v=2&tid=G-G3W3M6971H&gtm=45je69o0h2v9182002141za200` |
| doubleclick.net | rastreador (tracking_ad) | não requisitado | visto, não classificado | 1 | 1 | nas duas visitas; o Firefox classifica (tracking_ad), as listas EasyList/EasyPrivacy do Blacklight não; não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://stats.g.doubleclick.net/g/collect?v=2&tid=G-G3W3M6971H&cid=37013099.1790562110&gtm` |
| google.com.br | rastreador (tracking_content) | não requisitado | não visto | 1 | 0 | ausente do HAR do Blacklight: não carregado na visita dele (região ou momento); não requisitado no perfil com uBO (bloqueio em cascata: quem o carregaria foi bloqueado) | `https://www.google.com.br/ads/ga-audiences?v=1&t=sr&slf_rd=1&_r=4&tid=G-G3W3M6971H&cid=370` |
| jsdelivr.net | rastreador (tracking_content) | permitiu 12 | visto, não classificado | 3 | 3 | nas duas visitas; o Firefox classifica (tracking_content), as listas EasyList/EasyPrivacy do Blacklight não | `https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@v7.12.2/app/vlibras-plugin.js` |
| googletagmanager.com | visto, não classificado | bloqueou 12/12 | easyprivacy.txt (3) | 2 | 3 | nas duas visitas; a lista do Firefox (Disconnect) não o classifica, a easyprivacy.txt sim; uBO bloqueia (googletagmanager_gtm.js:5) sem classificação do Firefox | `https://www.googletagmanager.com/gtag/js?id=G-G3W3M6971H` |

## Categorias (testes do Blacklight)

Colunas "no HAR": regras do plugin (`categories.js`) aplicadas a cada HAR.

| Categoria | Blacklight reportou | No HAR do Blacklight | No nosso HAR |
|---|---|---|---|
| gravação de sessão | não | não | não |
| pixel do Facebook | não | não | não |
| pixel do TikTok | não | não | não |
| pixel do X (Twitter) | não | não | não |
| Google Analytics com remarketing | sim | sim: doubleclick.net | sim: doubleclick.net, google.com.br |
| LinkedIn Insight | (não é teste do Blacklight) | não | não |

## CNAMEs desmascarados pelo uBlock Origin

O uBO no Firefox resolve o DNS de cada host (`browser.dns`); o plugin não. Um subdomínio do
próprio site que aponta para outro serviço é rastreamento disfarçado de 1ª parte.

| Host requisitado | Aponta para | Subdomínio do próprio site? |
|---|---|---|
| cdn.jsdelivr.net | cdn.jsdelivr.net.cdn.cloudflare.net | não |

## Fingerprinting

- Blacklight, canvas: `https://newassets.hcaptcha.com/c/e6406e0dc2defc690a7a57503b6fdffb7d7908d6631a82fb4b35d04bd0b567cb/hs`, `https://www.sp.gov.br/llne-But-Darkd-furth-ther-a-Serprings-Enter-Pall/D5FamfX5qBArVrNQHII9KwAE06C-z`, `https://www.sp.gov.br/oporth-beyon-a-dispot-sengerly-is-Macb-So-shou-f`
- Blacklight, fontes: `https://www.sp.gov.br/llne-But-Darkd-furth-ther-a-Serprings-Enter-Pall/D5FamfX5qBArVrNQHII9KwAE06C-z`, `https://www.sp.gov.br/oporth-beyon-a-dispot-sengerly-is-Macb-So-shou-f`
- Plugin, coleta manual: nenhum
- Plugin, coleta automatizada (`automatizado/`, navigator.webdriver = true): webgl por `https://newassets.hcaptcha.com/c/34f102046110559ca0bcef97b204445862c4b4ce110256c`; canvas por `https://newassets.hcaptcha.com/c/34f102046110559ca0bcef97b204445862c4b4ce110256c`
