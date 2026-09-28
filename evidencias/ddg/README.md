# Roteiro: DuckDuckGo Privacy Test Pages

Como executar cada página e o que registrar. O resultado esperado vem da própria
página (texto ou "Download results"); o resultado do plugin vem do popup e do JSON
exportado. Cada linha do relatório precisa de print com a página e o popup visíveis.

## Preparação (uma vez por sessão)

1. Perfil de medição, só com o plugin carregado (`about:debugging`).
2. Anotar em `evidencias/ambiente.md` a versão do Firefox e o modo da Proteção
   Aprimorada contra Rastreamento (ETP).
3. Limpar os dados de `privacy-test-pages.site`, `third-party.site` e
   `ad-company.site` (cadeado na barra de endereço → Limpar cookies e dados do site).

Para cada página: abrir → aguardar o load → abrir o popup → print de cada aba
relevante → **Exportar JSON** → salvar em `evidencias/ddg/<teste>/`.

## Tracker Reporting (conceito C)

Cada página carrega um único rastreador de uma grande empresa. O esperado é o texto
da própria página.

| Página | Requisição de rastreador | Esperado (página) |
|---|---|---|
| `tracker-reporting/1major-via-script.html` | `<script src="//doubleclick.net/tracker.js">` | 1 major tracker loaded via script |
| `tracker-reporting/1major-with-surrogate.html` | `<script src="//doubleclick.net/instream/ad_status.js">` | 1 major tracker with surrogate |
| `tracker-reporting/1major-via-img.html` | `<img src="//facebook.com/tr?test=1">` | 1 major tracker loaded via img |
| `tracker-reporting/1major-via-fetch.html` | `fetch('https://facebook.com/tr?test=1')` | 1 major tracker loaded via fetch |
| `tracker-reporting/document-fragment.html` | `<img>` criado via document fragment para `facebook.com/tr` | tracker via document fragment |

No plugin (aba **Terceiros**): o site de terceira parte (`doubleclick.net` ou
`facebook.com`), o tipo da requisição (script, imagem, xhr/fetch), a marca
**rastreador** (classificação do Firefox) e, se houver, **bloqueado pelo Firefox**
com o erro (ex.: `NS_ERROR_SOCIALTRACKING_URI`).

Divergências prováveis a explicar:
- O ETP no modo Padrão bloqueia rastreadores sociais: a requisição a
  `facebook.com/tr` aparece com erro e marcada como bloqueada pelo Firefox, não pelo
  plugin.
- "Surrogate" é um script substituto que bloqueadores injetam no lugar do original;
  o plugin só detecta, não substitui.

## Storage blocking (conceito C)

URL: `https://privacy-test-pages.site/privacy-protections/storage-blocking/`

Fluxo (os cookies são criados no **Store**; o **Retrieve** só lê, então a aba
Cookies fica vazia depois dele):
1. Clicar em **Store data**, aguardar ~5 s e clicar no resumo para expandir a lista.
2. Popup na aba **Cookies** → print `store-cookies.png`; aba **Storage** → print
   `store-storage.png`; **Exportar JSON** → `plugin-store.json`.
3. Recarregar a página, clicar em **Retrieve data**, aguardar ~5 s e expandir a lista.
4. Popup na aba **Storage** → print `retrieve-storage.png`; **Download the result**
   → `resultados.json` (resultado esperado, reportado pela página).

O que a página testa (código em `privacy-protections/storage-blocking/`):

| Subteste | Mecanismo | Onde o plugin mostra |
|---|---|---|
| first party header cookie | `Set-Cookie` de `privacy-test-pages.site` (`top_firstparty_headerdata`) | Cookies, 1ª parte, HTTP |
| safe third party header cookie | `Set-Cookie` de `good.third-party.site` via fetch | Cookies, 3ª parte, HTTP |
| tracking third party header cookie | `Set-Cookie` de `broken.third-party.site` via fetch | Cookies, 3ª parte, HTTP |
| JS cookie / `__Host` / sem SameSite | `document.cookie` (`jsdata`, `__Host-jsdata_host`, `jsdata_no_samesite`) | Cookies, 1ª parte, JavaScript |
| JS cookie (3rd party tracking/safe script) | `document.cookie` escrito por script de `broken.`/`good.third-party.site` (`tptdata`, `tpsdata`) | Cookies, 1ª parte, JavaScript |
| localStorage, sessionStorage, IndexedDB, Cache API | chave/banco `data` | Storage, origem de topo |
| safe / tracking / ad third party iframe | iframes de `good.third-party.site`, `broken.third-party.site`, `convert.ad-company.site` repetindo os testes | Storage (iframe, 3ª parte) e Cookies (particionados) |
| WebSQL, memória, window.name, history, service worker, browser cache | outros mecanismos | fora do escopo do plugin |

Divergências prováveis a explicar:
- `tptdata`/`tpsdata` são cookies de **primeira parte** (domínio da página), mesmo
  escritos por scripts de terceiros; o plugin classifica pelo domínio do cookie. A
  atribuição ao script de origem entra com os hooks do Dia 3.
- Os iframes de teste são removidos pela página logo depois de responder; o retrato
  de storage (coletado após o load do frame) pode não pegá-los no **Store**. No
  **Retrieve** eles carregam de novo e aparecem. Os cookies deles aparecem sempre,
  via API de cookies, marcados como **particionados** (Total Cookie Protection).
- `broken.third-party.site` não está nas listas do Firefox, então não recebe a marca
  de rastreador; é rastreador só na lista de teste do DuckDuckGo.
- WebSQL não existe no Firefox; memória, window.name e history não são
  armazenamento persistente e não são monitorados.

## Fingerprinting (conceito C; canvas é conceito B)

URL: `https://privacy-test-pages.site/privacy-protections/fingerprinting/`

Fluxo:
1. Abrir a página, clicar em **Start the test** e aguardar ~15 s (a lista de
   resultados aparece; clicar no resumo para expandir).
2. Popup na aba **Alertas** → print `alertas.png`; **Exportar JSON** →
   `plugin.json`.
3. **Download the result** → `resultados.json` (valores coletados pela página).

A página coleta ~150 dados do navegador. Os que o plugin monitora:

| Teste da página | O que faz | Esperado no plugin (aba Alertas) |
|---|---|---|
| `canvas-2d-todataurl` | canvas 2000×200, texto "Cwm fjordbank glyphs…" em 2 cores, `toDataURL` | Canvas fingerprint, `toDataURL (image/png)` |
| `canvas-2d-imagedata` | mesmo desenho, `getImageData` da área toda e `toDataURL` | Canvas fingerprint, `getImageData de 2000×200` (e `toDataURL`) |
| `canvas-2d-offscreen-todataurl` | desenha num `OffscreenCanvas`, copia com `drawImage` para um canvas comum e chama `toDataURL` | Canvas fingerprint, "copiado de OffscreenCanvas" |
| `canvas-webgl` | desenha com shaders WebGL e chama `toDataURL` | WebGL fingerprint |
| `CanvasRenderingContext2D.measureText` | mede o mesmo texto em dezenas de fontes | Enumeração de fontes |

Os demais (`navigator.*`, `screen.*`, cabeçalhos HTTP, media queries CSS,
`AudioContext`, WebRTC, codecs, sensores, `Intl`, `document.fonts.check`) **não são
monitorados**: são leituras de propriedades comuns, feitas por quase todo site, e
distinguir fingerprinting de uso legítimo exigiria outra heurística. Cada um vira
uma linha de divergência no relatório, com essa justificativa.

Resultado esperado: **6 detecções**, todas atribuídas a
`fingerprinting/helpers/tests.js` (1ª parte). São 6 e não 5 porque o teste
`canvas-2d-imagedata` lê o mesmo canvas duas vezes (`getImageData` e depois
`toDataURL`), e cada leitura conta como uma detecção.

## Tracker Blocking (conceito B; bloqueio é conceito A)

URL: `https://privacy-test-pages.site/privacy-protections/request-blocking/`

A página faz ~25 tipos de requisição a `bad.third-party.site` (script, CSS, imagem,
`<picture>`, `<object>`, áudio, vídeo, iframe, fonte, background, WebSocket,
EventSource, fetch, XHR, `sendBeacon`, favicon, fetch em iframe e em iframe
aninhado, fetch em Web Worker e em Service Worker, relatório CSP, fetch
redirecionado) e espera que o domínio esteja numa lista de bloqueio.

Fluxo: **Start the test** → aguardar ~10 s → popup na aba **Terceiros** → print
`terceiros.png`; **Exportar JSON** → `plugin.json`; **Download the results** →
`resultados.json`.

Esperado no plugin: `third-party.site` com ~22 requisições e os tipos script,
stylesheet, font, image, imageset, media, object, sub_frame, websocket, beacon,
xmlhttprequest e csp_report (validado em Firefox 156).

Divergências a explicar:
- Até o Dia 5 o plugin **detecta** mas não bloqueia: a página marca as requisições
  como carregadas. Depois da lista de bloqueio (Dia 5), repetir com
  `bad.third-party.site` bloqueado (`terceiros-bloqueio.png`).
- `bad.third-party.site` não recebe a marca de rastreador: está só na lista de teste
  do DuckDuckGo, não nas listas do Firefox.
- Fetch feito pelo **Service Worker** não tem aba associada (`tabId = -1` no
  `webRequest`) e não entra no relatório da página.
- `NS_ERROR_WEBSOCKET_CONNECTION_REFUSED`: o servidor de teste recusa o WebSocket;
  a tentativa de conexão foi detectada assim mesmo.

## Storage partitioning (conceito B)

URL: `https://privacy-test-pages.site/privacy-protections/storage-partitioning/`

Não abra outra cópia da página nem use recarga forçada (a própria página avisa que
isso invalida o teste).

Fluxo: **Run Tests** → a página grava dados em vários mecanismos, **navega para
`https://www.first-party.site/privacy-protections/storage-partitioning/`** e abre
uma janela de teste; aguardar até aparecer *"Retrieved data from 21 storage
mechanisms"* → **Show Detailed Results** → na aba da página final, popup nas abas
**Storage** e **Cookies** → prints `storage.png` e `cookies.png`; **Exportar
JSON** → `plugin.json`; **Download the result** → `resultados.json`.

O que a página testa: `document.cookie`, cookie HTTP, Cookie Store API,
localStorage, sessionStorage, IndexedDB, WebSQL, Cache API, Service Worker,
BroadcastChannel, SharedWorker, Web Locks, caches HTTP (fetch, XHR, iframe,
imagem, favicon, fonte, CSS, prefetch) e HSTS, em contexto de 1ª e de 3ª parte.

Divergências a explicar:
- O particionamento é feito pelo **Firefox** (Total Cookie Protection / dFPI), não
  pelo plugin. O plugin mostra a evidência onde ela é observável: cookies com
  `partitionKey` (marca **particionado**) e o armazenamento de cada origem, inclusive
  iframes de terceiros.
- Caches HTTP, favicon, HSTS, BroadcastChannel, SharedWorker e Web Locks não são
  armazenamento que o plugin monitora; o resultado deles vem só da página.
- WebSQL não existe no Firefox.

## Bounce tracking (conceito B)

URL: `https://privacy-test-pages.site/privacy-protections/bounce-tracking/`

Cada link passa por `bad.third-party.site/.../bounce.html`, que gera ou lê um UID
(cookie e localStorage) e redireciona **por script, sem interação**, para o
destino com o UID na URL (`?bounceUIDlocalStorage=…&bounceUIDcookie=…&isNew=…`).

Fluxo, para cada um dos 4 links: clicar → na página de destino, popup na aba
**Alertas** → print `<destino>.png` (ex.: `first-party.png`) → **Exportar JSON**
→ `<destino>.json` → voltar à página de teste.

Esperado no plugin (validado em Firefox 156):
- `www.first-party.site`, `privacy-test-pages.site` e `www.publisher-company.site`:
  **Bounce via third-party.site**, redirecionamento por script, vindo de
  `privacy-test-pages.site`, poucas centenas de ms sem interação, identificador
  `bounceUID`, e **repassado na URL**: `isNew` na primeira passagem (UID recém-criado)
  ou `bounceUIDcookie`/`bounceUIDlocalStorage` nas seguintes (UID já existente).
- `good.third-party.site`: **nenhum bounce**. Pelo eTLD+1, `bad.third-party.site`
  e `good.third-party.site` são o mesmo site (`third-party.site`): o UID fica dentro
  do mesmo site e não liga identidades entre sites diferentes.

## Query parameters (conceito B)

URL: `https://privacy-test-pages.site/privacy-protections/query-parameters/`

Fluxo, para cada um dos 4 links: clicar → popup na aba **Alertas**, seção
**Parâmetros de rastreamento na URL** → print → voltar.

| Link | Esperado (página) | Plugin |
|---|---|---|
| `utm_source` + `q` | "q=other" (parâmetro removido) | detecta `utm_source` |
| `utm_source` + `utm_medium` | "" | detecta os dois |
| `fbclid` + `fb_source` + `u` | "u=14" | detecta `fbclid` e `fb_source` |
| sem rastreamento | "q=something&id=1234" | nenhum |

Divergência a explicar: a página espera que os parâmetros sejam **removidos** da URL
antes da navegação; o plugin os **detecta e mostra**, mas não reescreve a URL (o
modo Padrão do Firefox também não; a remoção de parâmetros do Firefox só atua no
modo Rigoroso e para uma lista própria).

## Tracker Blocking com a lista de bloqueio (conceito A)

Mesma página do Tracker Blocking, agora com `bad.third-party.site` na lista de
bloqueio do plugin. Pasta: `evidencias/ddg/request-blocking/`.

Fluxo: popup → aba **Bloqueio** → digitar `bad.third-party.site` → **Adicionar**
→ abrir a página → **Start the test** → aguardar ~10 s → prints com a página e o
popup nas abas **Terceiros** (`terceiros-bloqueio.png`) e **Bloqueio**
(`bloqueio.png`) → **Exportar JSON** (`plugin-bloqueio.json`) → **Download the
results** (`resultados-bloqueio.json`) → na aba Bloqueio, **Remover** o domínio.

Esperado (validado em Firefox 156): 22 requisições bloqueadas; nenhum dos 23
testes da página carregado. Os testes de elementos HTML/CSS aparecem como
"hasn't loaded" (cinza) e os de JavaScript/rede como "failed" (vermelho): ambos
são bloqueio. O fetch do Service Worker também é bloqueado.

## js-leaks (conceito A)

URL: `https://privacy-test-pages.site/security/js-leaks.html`

A página percorre as propriedades do `window` (e do `navigator`) e compara com o
perfil de um navegador de referência, listando propriedades adicionadas,
removidas e alteradas: é um detector de alterações no escopo global, como as que
um script de hook faz. Pasta: `evidencias/ddg/js-leaks/`.

Fluxo: abrir a página → **Check** (referência Firefox 92) → aguardar ~15 s →
popup na aba **Alertas**, seção **Sequestro de navegador**, expandir **Globais
adicionadas** → print `alertas.png` → **Exportar JSON** (`plugin.json`) →
**Download the results** (`resultados.json`).

Esperado:
- O plugin aponta as globais que o script da própria página cria ao rodar a
  verificação: `collectedProps` e `results`.
- A página lista ~889 propriedades adicionadas, 17 removidas e 2 alteradas em
  relação ao Firefox 92: diferenças de versão do navegador, não do plugin. Com e
  sem o plugin o resultado é idêntico (`automatizado/comparacao.json`, gerado pelo
  `tools/smoke_test.py`): a instrumentação do plugin fica nos protótipos e não é
  visível para essa verificação.

## Tabela do relatório

Modelo para `relatorio/`. Uma linha por subteste.

| Teste | Esperado (página) | Plugin | Divergência e explicação técnica | Print |
|---|---|---|---|---|
| | | | | `evidencias/ddg/<teste>/plugin.png` |
