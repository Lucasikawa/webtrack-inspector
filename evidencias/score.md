# Score de privacidade dos sites analisados

Análise crítica e comparação com o Blacklight: [`score-analise.md`](score-analise.md).

Gerado por `tools/score.js` com a metodologia de `extension/background/score.js`
(a mesma do popup). Parte de 100 e desconta pontos em 7 critérios; cada critério tem
teto, e os tetos somam 100. Só entra o que foi observado nos primeiros 30 s.

## Metodologia

| Critério | Teto | Regra | Teste equivalente no Blacklight |
|---|---|---|---|
| Rastreadores de terceira parte | 20 | 2 por site classificado como rastreador pelas listas do Firefox | Ad trackers |
| Cookies de terceira parte | 15 | 1 por cookie; 2 se a validade passa de 1 ano | Third-party cookies |
| Identificadores guardados por terceiros | 10 | 1 por cookie ou chave de storage de 1ª parte gravado por script de 3ª parte; 1 por origem de 3ª parte com storage | — |
| Fingerprinting | 15 | canvas, WebGL ou fontes: 15 se por script de 3ª parte, 8 se de 1ª; só consulta à GPU: 4 (3ª) ou 2 (1ª) | Tracking that evades cookie blockers |
| Sincronização de IDs e bounce tracking | 15 | 3 por par de sincronização entre terceiros; 1 por ID de 1ª parte enviado a terceiro; 5 por bounce | — |
| Vigilância comportamental | 15 | gravação de sessão: 10; cada pixel (Facebook, TikTok, X, LinkedIn): 3; GA com remarketing: 3; cada site de 3ª parte com script ouvindo teclado: 3 | Session recording, key logging, Facebook/TikTok/X pixels, GA remarketing |
| Sequestro do navegador | 10 | assinatura de hook conhecida: 10; WebSocket/EventSource para terceiro: 4; polling de terceiro: 2; funções nativas substituídas: 2 | — |

Faixas: A ≥ 85, B ≥ 70, C ≥ 50, D ≥ 30, F ≥ 0.

## Resultado

| Critério (teto) | sp.gov.br | quintoandar.com.br | uol.com.br |
|---|---|---|---|
| Rastreadores de terceira parte (20) | −8 | −16 | −20 |
| Cookies de terceira parte (15) | −0 | −0 | −15 |
| Identificadores guardados por terceiros (10) | −2 | −3 | −10 |
| Fingerprinting (15) | −0 | −0 | −0 |
| Sincronização de IDs e bounce tracking (15) | −0 | −6 | −15 |
| Vigilância comportamental (15) | −3 | −10 | −15 |
| Sequestro do navegador (10) | −2 | −2 | −2 |
| **Score** | **85 (A)** | **63 (C)** | **23 (F)** |

- **sp.gov.br**: `evidencias/sites/sp.gov.br/final/plugin.json` (plugin v0.7.0, exportado 2026-09-28T02:29:38.718Z); 4 cookies com Domain no sufixo público `sp.gov.br` desconsiderados (`incap_ses_987_3308181`, `nlbi_3308181`, `nlbi_3308181_2147483392`, `visid_incap_3308181`): nenhum navegador os grava (RFC 6265, seção 5.3); o popup e o JSON mostram 81 (B), calculado pela v0.7.0 antes da correção acima.
- **quintoandar.com.br**: `evidencias/sites/quintoandar.com.br/final/plugin.json` (plugin v0.7.0, exportado 2026-09-28T03:25:18.625Z).
- **uol.com.br**: `evidencias/sites/uol.com.br/final/plugin.json` (plugin v0.7.0, exportado 2026-09-28T03:12:32.626Z).

### Ocorrências que descontaram pontos

#### sp.gov.br

- **Rastreadores de terceira parte** (−8 de 20): jsdelivr.net (−2); doubleclick.net (−2); google.com (−2); google.com.br (−2)
- **Identificadores guardados por terceiros** (−2 de 10): cookie _ga gravado por googletagmanager.com (−1); cookie _ga_G3W3M6971H gravado por googletagmanager.com (−1)
- **Vigilância comportamental** (−3 de 15): Google Analytics com remarketing (−3)
- **Sequestro do navegador** (−2 de 10): 2 funções nativas substituídas (−2)

#### quintoandar.com.br

- **Rastreadores de terceira parte** (−16 de 20): braze.com (−2); google.com (−2); amplitude.com (−2); doubleclick.net (−2); google.com.br (−2); hotjar.com (−2); google-analytics.com (−2); sentry.io (−2)
- **Identificadores guardados por terceiros** (−3 de 10): cookie _ga_E2JVTQ7D7Q gravado por googletagmanager.com (−1); cookie _hjSessionUser_1203740 gravado por hotjar.com (−1); cookie _hjTLDTest gravado por hotjar.com (−1)
- **Sincronização de IDs e bounce tracking** (−6 de 15): ID de 1ª parte FPAU → doubleclick.net (−1); ID de 1ª parte 5A_gclid → doubleclick.net (−1); ID de 1ª parte FPAU → google.com (−1); ID de 1ª parte 5A_gclid → google.com (−1); ID de 1ª parte FPAU → google.com.br (−1); ID de 1ª parte 5A_gclid → google.com.br (−1)
- **Vigilância comportamental** (−10 de 15): gravação de sessão (hotjar.com) (−10)
- **Sequestro do navegador** (−2 de 10): 7 funções nativas substituídas (−2)

#### uol.com.br

- **Rastreadores de terceira parte** (−20 de 20): googlesyndication.com (−2); doubleclick.net (−2); scorecardresearch.com (−2); newsroom.bi (−2); permutive.com (−2); adnxs.com (−2); google.com (−2); chartbeat.net (−2); 2mdn.net (−2); rubiconproject.com (−2); seedtag.com (−2); smartadserver.com (−2); e mais 31
- **Cookies de terceira parte** (−15 de 15): tluid (3lift.com) (−1); anj (adnxs.com) (−1); uuid2 (adnxs.com) (−1); uid (criteo.com) (−2); _cc_dc (crwdcntrl.net) (−1); _cc_id (crwdcntrl.net) (−1); gckp (cxense.com) (−2); browser_data (dnacdn.net) (−2); IDE (doubleclick.net) (−2); test_cookie (doubleclick.net) (−1); tp_cookie_test (jsuol.com.br) (−1); __cf_bm (linkedin.com) (−1); e mais 21
- **Identificadores guardados por terceiros** (−10 de 10): cookie ___nrbi gravado por mrf.io (−1); cookie ___nrbic gravado por mrf.io (−1); cookie __pat gravado por tinypass.com (−1); cookie __pvi gravado por tinypass.com (−1); cookie __tbc gravado por tinypass.com (−1); cookie _cb gravado por chartbeat.com (−1); cookie _cb_svref gravado por chartbeat.com (−1); cookie _cbt gravado por chartbeat.com (−1); cookie _cc_id gravado por crwdcntrl.net (−1); cookie _chartbeat2 gravado por chartbeat.com (−1); cookie _cookie_test gravado por tinypass.com (−1); cookie _ga gravado por googletagmanager.com (−1); e mais 85
- **Sincronização de IDs e bounce tracking** (−15 de 15): ID de 1ª parte _cb → chartbeat.net (−1); ID de 1ª parte _chartbeat2 → chartbeat.net (−1); ID de 1ª parte _pcid → cxense.com (−1); ID de 1ª parte UOLID → cxense.com (−1); ID de 1ª parte permutive-id → doubleclick.net (−1); ID de 1ª parte UOLID → doubleclick.net (−1); ID de 1ª parte __gads → doubleclick.net (−1); ID de 1ª parte __gpi → doubleclick.net (−1); ID de 1ª parte __eoi → doubleclick.net (−1); ID de 1ª parte _gcl_au → google.com (−1); ID de 1ª parte UOLID → google.com (−1); ID de 1ª parte permutive-id → permutive.com (−1); e mais 4
- **Vigilância comportamental** (−15 de 15): Google Analytics com remarketing (−3); LinkedIn Insight (−3); teclado ouvido por script de googlesyndication.com (−3); teclado ouvido por script de cxense.com (−3); teclado ouvido por script de doubleverify.com (−3); teclado ouvido por script de tinypass.com (−3); teclado ouvido por script de jsuol.com.br (−3); teclado ouvido por script de imasdk.googleapis.com (−3); teclado ouvido por script de mrf.io (−3); teclado ouvido por script de doubleclick.net (−3); teclado ouvido por script de chartbeat.com (−3)
- **Sequestro do navegador** (−2 de 10): 1 funções nativas substituídas (−2)

## Análise de sensibilidade

Cada peso (teto e pontos por ocorrência do critério) multiplicado por 0,7 e por 1,3, um de cada vez; a nota é renormalizada para 0–100.

| Critério | Fator | sp.gov.br | quintoandar.com.br | uol.com.br | Mesma ordem? |
|---|---|---|---|---|---|
| (pesos originais) | 1 | 85 | 63 | 23 | — |
| Rastreadores de terceira parte | 0,7 | 87 | 66 | 24 | sim |
| Rastreadores de terceira parte | 1,3 | 84 | 61 | 22 | sim |
| Cookies de terceira parte | 0,7 | 84 | 61 | 24 | sim |
| Cookies de terceira parte | 1,3 | 86 | 65 | 22 | sim |
| Identificadores guardados por terceiros | 0,7 | 85 | 63 | 24 | sim |
| Identificadores guardados por terceiros | 1,3 | 85 | 63 | 22 | sim |
| Fingerprinting | 0,7 | 84 | 61 | 19 | sim |
| Fingerprinting | 1,3 | 86 | 65 | 26 | sim |
| Sincronização de IDs e bounce tracking | 0,7 | 84 | 63 | 24 | sim |
| Sincronização de IDs e bounce tracking | 1,3 | 86 | 63 | 22 | sim |
| Vigilância comportamental | 0,7 | 85 | 64 | 24 | sim |
| Vigilância comportamental | 1,3 | 85 | 62 | 22 | sim |
| Sequestro do navegador | 0,7 | 85 | 62 | 21 | sim |
| Sequestro do navegador | 1,3 | 85 | 63 | 25 | sim |

A ordem dos sites se mantém nas 14 variações.

## Comparação com o Blacklight

### Mesma régua aplicada ao que o Blacklight observou

O Blacklight não dá nota. Aqui o score do plugin é aplicado às contagens do Blacklight
(ad trackers, cookies de terceiros, canvas, gravação de sessão, pixels, GA remarketing e
listeners de teclado do dado bruto). Critérios que o Blacklight não mede ficam em 0 e aparecem como "não mede".

| Critério (teto) | sp.gov.br: plugin | sp.gov.br: Blacklight | quintoandar.com.br: plugin | quintoandar.com.br: Blacklight | uol.com.br: plugin | uol.com.br: Blacklight |
|---|---|---|---|---|---|---|
| Rastreadores de terceira parte (20) | −8 | −4 | −16 | −10 | −20 | −20 |
| Cookies de terceira parte (15) | −0 | −2 | −0 | −0 | −15 | −15 |
| Identificadores guardados por terceiros (10) | −2 | não mede | −3 | não mede | −10 | não mede |
| Fingerprinting (15) | −0 | −15 | −0 | −0 | −0 | −0 |
| Sincronização de IDs e bounce tracking (15) | −0 | não mede | −6 | não mede | −15 | não mede |
| Vigilância comportamental (15) | −3 | −3 | −10 | −13 | −15 | −15 |
| Sequestro do navegador (10) | −2 | não mede | −2 | não mede | −2 | não mede |
| **Score** | **85 (A)** | **76 (B)** | **63 (C)** | **77 (B)** | **23 (F)** | **50 (C)** |

### sp.gov.br

Blacklight: análise de 2026-09-27T23:36:48.792Z (19 s, 2 páginas: https://www.sp.gov.br/sp, https://www.sp.gov.br/sp/institucional/estrutura/prefeituras-paulistas), a partir de `us-ca`.

| Teste do Blacklight | Blacklight | Plugin | |
|---|---|---|---|
| Ad trackers | 2 | 4 sites rastreadores (listas do Firefox) | presença concorda, contagem diverge |
| Cookies de terceiros | 2 | 0 (particionados pelo Firefox) | divergem |
| Canvas fingerprinting | sim (hcaptcha.com, www.sp.gov.br) | não; automatizado: sim (hcaptcha.com) | divergem na coleta manual, concordam na automatizada |
| Gravação de sessão | não | não | concordam |
| Captura de teclado | não | não medido (o plugin não digita nos campos) | — |
| Listeners de teclado de 3ª parte (dado bruto) | não | não | concordam |
| Pixel do Facebook | não | não | concordam |
| Pixel do TikTok | não | não | concordam |
| Pixel do X | não | não | concordam |
| GA com remarketing | sim | sim (doubleclick.net, google.com.br) | concordam |

### quintoandar.com.br

Blacklight: análise de 2026-09-27T23:39:52.064Z (31 s, 2 páginas: https://www.quintoandar.com.br/, https://www.quintoandar.com.br/condominios/sao-bernardo-do-campo-sp-brasil), a partir de `us-ca`.

| Teste do Blacklight | Blacklight | Plugin | |
|---|---|---|---|
| Ad trackers | 5 | 8 sites rastreadores (listas do Firefox) | presença concorda, contagem diverge |
| Cookies de terceiros | 0 | 0 (particionados pelo Firefox) | concordam |
| Canvas fingerprinting | não | não | concordam |
| Gravação de sessão | sim (script.hotjar.com, static.hotjar.com) | sim (hotjar.com) | concordam |
| Captura de teclado | não | não medido (o plugin não digita nos campos) | — |
| Listeners de teclado de 3ª parte (dado bruto) | sim (hotjar.com) | não | divergem |
| Pixel do Facebook | não | não | concordam |
| Pixel do TikTok | não | não | concordam |
| Pixel do X | não | não | concordam |
| GA com remarketing | não | não | concordam |

### uol.com.br

Blacklight: análise de 2026-09-27T23:43:56.983Z (67 s, 2 páginas: https://www.uol.com.br/, https://www.uol.com.br/nossa/viagem/fora-da-rota/), a partir de `us-ca`.

| Teste do Blacklight | Blacklight | Plugin | |
|---|---|---|---|
| Ad trackers | 82 | 43 sites rastreadores (listas do Firefox) | presença concorda, contagem diverge |
| Cookies de terceiros | 206 | 33 (particionados pelo Firefox) | presença concorda, contagem diverge |
| Canvas fingerprinting | não | não | concordam |
| Gravação de sessão | não | não | concordam |
| Captura de teclado | não | não medido (o plugin não digita nos campos) | — |
| Listeners de teclado de 3ª parte (dado bruto) | sim (doubleverify.com, cxense.com, jsuol.com.br, tinypass.com, mrf.io, clarity.ms, imasdk.googleapis.com, doubleclick.net) | sim (googlesyndication.com, cxense.com, doubleverify.com, tinypass.com, jsuol.com.br, imasdk.googleapis.com, mrf.io, doubleclick.net, chartbeat.com) | concordam |
| Pixel do Facebook | não | não | concordam |
| Pixel do TikTok | não | não | concordam |
| Pixel do X | sim | não | divergem |
| GA com remarketing | sim | sim (doubleclick.net, google.com.br) | concordam |
