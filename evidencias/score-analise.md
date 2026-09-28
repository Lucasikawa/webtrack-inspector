# Score dos sites: análise crítica e comparação com o Blacklight

Tabelas completas (descontos por critério, ocorrências, sensibilidade e comparação
teste a teste) em [`score.md`](score.md), gerado por `npm run score` a partir da
coleta final de cada site (`sites/<site>/final/`). Metodologia no README
(seção **Pontuação de privacidade**).

## Resultado

| | sp.gov.br | quintoandar.com.br | uol.com.br |
|---|---|---|---|
| Score do plugin (v0.7.1, coleta final) | **85 (A)** | **63 (C)** | **23 (F)** |
| Popup no momento da coleta (v0.7.0) | 81 (B) | 63 (C) | 23 (F) |
| Mesma régua aplicada ao que o Blacklight observou | 76 (B) | 77 (B) | 50 (C) |

- A ordem dos sites (sp.gov.br > QuintoAndar > UOL) se mantém nas 14 variações da
  análise de sensibilidade (cada peso a 0,7× e 1,3×). A letra do sp.gov.br, não: ele
  fica entre 84 e 87, na fronteira A/B.
- A diferença entre o popup (81) e o score final (85) do sp.gov.br é uma correção
  feita a partir desta comparação (item 6 abaixo).
- O Blacklight não dá nota. A terceira linha aplica o score do plugin às contagens
  dele (ad trackers, cookies de terceiros, canvas, gravação de sessão, pixels, GA
  com remarketing e listeners de teclado do dado bruto), para separar o que cada
  ferramenta **viu** do que cada uma **mede**.

## Onde as duas ferramentas concordam

- O **UOL** é o pior site nas duas. Rastreadores e cookies de terceiros atingem o
  teto (−20 e −15) tanto com os dados do plugin quanto com os do Blacklight.
- **Gravação de sessão** no QuintoAndar (Hotjar: `static.hotjar.com/c/hotjar-1203740.js`
  e `script.hotjar.com/modules.*.js`, presentes nos dois HARs).
- **Google Analytics com remarketing** no sp.gov.br e no UOL (`stats.g.doubleclick.net/g/collect`
  e `www.google.com.br/ads/ga-audiences` em `final/<site>.har`).
- Nenhum dos três tem pixel do Facebook ou do TikTok.

## De onde vem a diferença de nota

A diferença entre a nota do plugin e a da mesma régua com os dados do Blacklight se
decompõe exatamente pelos critérios:

| Site | Plugin | Blacklight | Decomposição da diferença |
|---|---|---|---|
| sp.gov.br | 85 | 76 | Blacklight: +15 fingerprinting e +2 cookies (hCaptcha, item 1). Plugin: +4 rastreadores (item 3), +2 storage e +2 sequestro (item 7) |
| quintoandar.com.br | 63 | 77 | Plugin: +6 rastreadores (item 3), +3 storage, +6 sincronização e +2 sequestro (item 7). Blacklight: +3 teclado (item 5) |
| uol.com.br | 23 | 50 | Só critérios que o Blacklight não mede: +10 storage, +15 sincronização e +2 sequestro (item 7) |

### 1. Navegador automatizado × pessoa (sp.gov.br)

O Blacklight marca canvas fingerprinting no sp.gov.br (`hcaptcha.com` e scripts de
`www.sp.gov.br` com nomes aleatórios, do Imperva) e 2 cookies de terceiros
(`__cf_bm` de `hcaptcha.com`). Na coleta manual o plugin não vê nada disso: o HAR
final não tem nenhuma requisição ao `hcaptcha.com`. Na coleta automatizada
(`sites/sp.gov.br/automatizado/`, Firefox com `navigator.webdriver = true`), o
plugin detecta canvas e WebGL por `newassets.hcaptcha.com`, como o Blacklight.

O site só faz esse fingerprinting para quem parece robô: é a proteção anti-bot do
Imperva, e o Blacklight é um Chrome automatizado. Isso custa 17 pontos na régua do
Blacklight. Sem eles, o sp.gov.br ficaria com 93 e a ordem seria a mesma do plugin.
Essa é a única inversão de ordem entre as duas ferramentas.

Não se trata de erro de nenhuma das duas: o fingerprinting é real, mas atinge
robôs, não o visitante comum.

### 2. Escala: uma página em 30 s × duas páginas nos EUA (UOL)

- **Blacklight:** 82 ad trackers e 206 cookies de terceiros, em 67 s e 2 páginas
  (`/` e `/nossa/viagem/fora-da-rota/`), a partir da Califórnia, num Chrome sem
  particionamento de cookies.
- **Plugin:** 43 sites rastreadores e 33 cookies de terceiros nos primeiros 30 s da
  página inicial.

O leilão de anúncios muda com o tempo, a página e a geografia. Com a aba aberta por
mais tempo, o plugin chegou a 82 sites rastreadores (`totals.trackerSites` no JSON).
O score é insensível a essa diferença por construção: 10 rastreadores e 15 cookies
já atingem o teto. Isso é intencional (nenhum critério domina a nota), mas comprime
o fim da escala: o score não distingue o UOL de um site ainda pior.

A segunda página do Blacklight explica também duas detecções que só ele tem no UOL:

- **pixel do X:** `static.ads-twitter.com/uwt.js` e `analytics.twitter.com/1/i/adsct`;
- **Microsoft Clarity**, gravador de sessão que aparece no dado bruto de listeners.

As requisições dos dois têm como `Referer` a página
`https://www.uol.com.br/nossa/viagem/fora-da-rota/`, em `blacklight/raw/requests.har`.

### 3. Listas de classificação diferentes

O plugin usa as listas do Firefox (Disconnect), incluindo a categoria "conteúdo" da
proteção rigorosa. O Blacklight usa a EasyList e a EasyPrivacy.

- **sp.gov.br:**
  - plugin: 4 sites. `jsdelivr.net` e `google.com.br` são marcados só como
    `tracking_content`/`any_strict_tracking`; o `jsdelivr.net` é uma CDN.
  - Blacklight: 2 sites.
- **QuintoAndar:**
  - plugin: 8 sites;
  - Blacklight: 5 no relatório; 9 sites com requisições casadas no `inspection.json`;
  - só o plugin: `braze.com` e `google.com.br`;
  - só o Blacklight: `googletagmanager.com`, `googleadservices.com` e `criteo.com`.

A lista rigorosa do Firefox é mais abrangente em analytics e CDNs, e as listas do
Blacklight são mais abrangentes em publicidade. A reconciliação por site
(`sites/<site>/reconciliacao.md`) mostra a regra de cada lista.

### 4. Primeira visita × visita de retorno

O Blacklight sempre faz a primeira visita. Na 1ª coleta do plugin (v0.3.0), os três
HARs já começavam com cookies do site: eram visitas de retorno (ver `notas.md` de
cada site). No sp.gov.br isso escondia o GA com remarketing:

- a 1ª coleta só tem `analytics.google.com/g/collect`;
- a coleta final, feita com os dados limpos, tem também `stats.g.doubleclick.net/g/collect`
  e `www.google.com.br/ads/ga-audiences`.

O hit de publicidade do GA não sai em toda visita: na de retorno, não saiu. A
divergência que aparecia na 1ª reconciliação vinha da coleta, não do detector.

No QuintoAndar, a coleta final também é uma visita de retorno, com cookies de uma
visita anterior que veio de um anúncio do Google (`FPGCLAW` com um `gclid`). Os 3
repasses de `5A_gclid` a `doubleclick.net`, `google.com` e `google.com.br` são
artefato da coleta. Sem eles, o score seria 66 (C).

### 5. Autoria de listeners de teclado (QuintoAndar)

O Blacklight atribui um listener de `keypress` ao Hotjar (`script.hotjar.com/modules.*.js`).
O plugin atribui todos os listeners de teclado a scripts do próprio QuintoAndar.

A causa: o Sentry, empacotado no JavaScript do site (`static.quintoandar.com.br/.../4563-*.js`,
com `__sentry_wrapped__`), substitui `EventTarget.prototype.addEventListener`. O plugin
aponta essa substituição em **Sequestro do navegador** (`hijack.globals.overridden`).
Depois dela, o chamador imediato de todo `addEventListener` é o wrapper do Sentry, e
o plugin atribui a autoria pelo chamador imediato.

É uma limitação da atribuição pela pilha, já listada no README para SDKs
empacotados. Custaria 3 pontos (score 60).

### 6. Cookies num sufixo público (sp.gov.br): erro do plugin corrigido

O popup da v0.7.0 contava 4 cookies de terceira parte no sp.gov.br (`visid_incap_3308181`,
`nlbi_3308181`, `incap_ses_987_3308181`, `nlbi_3308181_2147483392`).

- O Imperva os envia com `Domain=.sp.gov.br`, e `sp.gov.br` é um sufixo público.
- Pela RFC 6265 (seção 5.3, passo 5), nenhum navegador grava esses cookies: o JSON
  mostra `stored: false`, e o Blacklight (Chrome) também não os tem.

A v0.7.1 descarta esses cookies ao interpretar o `Set-Cookie`, e `tools/score.js`
os desconsidera nos JSONs já exportados. Resultado: sp.gov.br passa de 81 (B) para 85 (A).

### 7. O que só o plugin mede

O Blacklight não mede três critérios do score:

- **Sincronização de IDs.** No UOL, 16 repasses de identificadores de 1ª parte a
  terceiros nos primeiros 30 s. Exemplos: `UOLID` → `doubleclick.net`, `google.com`
  e `cxense.com`; `permutive-id` → `doubleclick.net`; `_pcid` → `cxense.com`. No
  QuintoAndar, `FPAU` (ID de publicidade do Google em cookie de 1ª parte, gravado
  pelo servidor de tagueamento `tracking.quintoandar.com.br`) → `doubleclick.net`,
  `google.com` e `google.com.br`.
- **Identificadores guardados por terceiros.** No UOL, 97 cookies e chaves de
  storage de 1ª parte gravados por scripts de terceiros: Chartbeat, Piano/Tinypass,
  Marfeel, Lotame, Google.
- **Sequestro do navegador.** Funções nativas substituídas nos três sites: 7 no
  QuintoAndar, 2 no sp.gov.br, 1 no UOL. No QuintoAndar, o código-fonte das
  substituições mostra quem as fez: o Sentry (`addEventListener`, `setTimeout`,
  `setInterval`, `Function.prototype.toString`) e o rastreamento do Grafana Faro
  (`fetch` e `XMLHttpRequest`); as globais `__SENTRY__` e `faro` confirmam. Vale pouco (2
  pontos): substituir `fetch` e `addEventListener` é o que fazem SDKs de
  observabilidade, e é só indício de hook.

No UOL, esses critérios são toda a diferença entre 23 e 50. É onde o plugin
acrescenta ao Blacklight: rastreamento que liga a identidade do usuário entre sites
sem depender de cookies de terceiros, e por isso sobrevive ao particionamento do
Firefox.

## Limitações do score

- **Uma visita, uma página, 30 s, a partir do Brasil, no Firefox.** O Blacklight faz
  duas páginas, de 19 a 67 s, a partir dos EUA, no Chrome. Os itens 1, 2 e 4 mostram
  que a coleta muda o resultado mais do que a metodologia.
- **Tetos comprimem o fim da escala** (UOL com 4 dos 7 critérios no teto). Por outro
  lado, um único critério não derruba um site sozinho.
- **Presença não é dano.** Listeners de teclado e funções substituídas são indícios.
  Por isso valem 3 e 2 pontos, contra 10 da gravação de sessão, que o Blacklight
  confirma pelo tráfego.
- **Pesos são escolhas.** A análise de sensibilidade mostra que a ordem dos sites
  não depende deles; a letra de um site na fronteira (sp.gov.br) depende.
