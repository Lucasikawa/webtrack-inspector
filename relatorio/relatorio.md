---
title: Detector de Rastreadores
---

<div class="capa">
<div class="inst"><img src="insper.png" alt="Insper"></div>
<div class="titulo">Detector de Rastreadores<br>Extensão para Firefox de detecção e bloqueio de rastreadores</div>
<div class="sub">Avaliação Intermediária de Cibersegurança<br>Relatório dos entregáveis 2, 3 e 4</div>
<div class="dados">
Aluno: Lucas Ikawa<br>
Professor: João Eduardo Luisi<br>
Repositório: <a href="https://github.com/Lucasikawa/webtrack-inspector">github.com/Lucasikawa/webtrack-inspector</a><br>
Versão do plugin: 0.7.1<br>
São Paulo, 28 de setembro de 2026
</div>
</div>

<div class="quebra"></div>

# 1. Introdução

Este relatório documenta a validação do **Detector de Rastreadores**, uma extensão
para Firefox que detecta e apresenta, por página, conexões a terceiros, cookies,
armazenamento HTML5, sincronização de identificadores, bounce tracking, canvas
fingerprinting, indícios de sequestro do navegador e uma pontuação de privacidade.
A extensão também bloqueia domínios de uma lista definida pelo usuário.

O relatório segue os entregáveis do enunciado. A seção 3 traz a execução nas
DuckDuckGo Privacy Test Pages (entregável 2), a seção 4 a análise de três sites
reais comparada ao Blacklight e ao uBlock Origin (entregável 3) e a seção 5 a
pontuação de privacidade e a comparação crítica com o Blacklight (entregável 4). O
código, as instruções de instalação via `about:debugging` e todas as evidências
(HARs, prints e JSONs exportados pelo plugin) estão no repositório, na pasta
`evidencias/`.

## 1.1 Ambiente de teste

| Item | Valor |
|--------------|-------------------------------------------------------------|
| Sistema | macOS (Darwin 25.5.0) |
| Navegador | Firefox 156.0.1, Proteção Aprimorada contra Rastreamento no modo Padrão |
| Perfil de medição | perfil dedicado, só com o plugin; VPN desligada, acesso a partir do Brasil |
| Perfil de comparação | perfil separado, só com o uBlock Origin 1.75.0 e as listas padrão |
| Blacklight | análise em themarkup.org/blacklight no mesmo dia (Chrome sem interface, a partir da Califórnia) |
| Versões do plugin nas coletas | 0.2.0 a 0.6.0 nas páginas do DDG; 0.3.0 na 1ª coleta dos sites; 0.7.0 na coleta final |

No modo Padrão, o Firefox bloqueia cookies de rastreadores de redes sociais,
criptomineradores e fingerprinters conhecidos, e isola os demais cookies de
terceiros por site de topo (Total Cookie Protection). Conteúdo de rastreamento só é
bloqueado em janelas privativas. Essa configuração explica parte das divergências
nos testes e está registrada em `evidencias/ambiente.md`.

## 1.2 Como o plugin detecta

A tabela resume o método de cada detecção. A descrição completa está no README do
repositório.

| Detecção | Método |
|--------------|-------------------------------------------------------------|
| Terceiros | Toda requisição passa por `webRequest`. É de terceira parte quando o site (eTLD+1 pela Public Suffix List) difere do site da página. É rastreador quando o Firefox a classifica em `urlClassification` (listas Disconnect). |
| Cookies | Cabeçalhos `Set-Cookie` e a API `cookies`, que mostra o que foi gravado, inclusive por JavaScript e com `partitionKey`. Classifica em 1ª ou 3ª parte e sessão ou persistente, e conta os injetados nos primeiros 30 s. |
| Armazenamento HTML5 | Content script em todos os frames lê chaves e tamanhos de localStorage, sessionStorage, IndexedDB e Cache API. |
| Autoria | Hooks em `document_start` (via `exportFunction`) no setter de `document.cookie` e em `setItem` identificam pela pilha o script que gravou cada cookie e chave. |
| Canvas fingerprint | Heurística de Englehardt e Narayanan (CCS 2016), também usada pelo OpenWPM e pelo Blacklight, mais leitura de canvas WebGL, consulta ao modelo da GPU e enumeração de fontes. |
| Cookie sync | Identificadores (8 ou mais caracteres, com dígitos, sem ser timestamp) de cookies e storage procurados na URL de requisições a outros sites (Acar et al., CCS 2014). |
| Bounce tracking | Redirecionamento HTTP por site intermediário, ou página de outro site que redireciona por script em até 10 s sem interação do usuário. |
| Sequestro do navegador | WebSocket ou EventSource para terceiros, polling regular, funções nativas substituídas (comparação por identidade com a referência de `document_start`), globais novas, listeners de teclado de terceiros e assinaturas do BeEF. |
| Bloqueio | `webRequest` bloqueante cancela requisições de terceira parte aos domínios da lista do usuário. |

A interface (Figura 24 em diante) mostra o relatório da página nas abas Terceiros,
Cookies, Storage, Alertas, Bloqueio e Score, e exporta o relatório em JSON.

# 2. Método de análise das divergências

Para cada teste do DuckDuckGo, o **resultado esperado** vem da própria página (texto
exibido ou arquivo "Download results", salvo como `resultados.json`) e o
**resultado do plugin** vem do JSON exportado pelo popup na mesma execução. Cada
divergência é explicada a partir do tráfego registrado: tipo e destino da
requisição, erro de rede, cookie gravado ou chave de armazenamento. Nos sites reais,
a mesma lógica usa o HAR exportado do DevTools, o registro do uBlock Origin e os
dados brutos do Blacklight (`inspection.json` e o HAR da visita dele).

Os prints mostram a página de teste e o popup do plugin abertos ao mesmo tempo. Os
originais, em resolução de tela cheia, estão em `evidencias/ddg/<teste>/`.

# 3. Entregável 2: DuckDuckGo Privacy Test Pages

## 3.1 Tracker Reporting

Cada página carrega um único recurso de um rastreador de grande empresa. O esperado
é que a ferramenta reporte esse rastreador.

| Página | Esperado (página) | Plugin | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| `1major-via-script` | 1 rastreador, `doubleclick.net`, carregado por `<script>` | `doubleclick.net`, tipo `script`, rastreador (`tracking_ad`) | Sem divergência na detecção. A requisição terminou com `NS_ERROR_CORRUPTED_CONTENT` (registrado em `webRequest.onErrorOccurred`): o Firefox descartou a resposta do endereço de teste, que não é um script válido. Não houve bloqueio, que no modo Padrão não se aplica a rastreadores de anúncio. | Fig. 1 |
| `1major-with-surrogate` | 1 rastreador, `doubleclick.net`, com script substituto (surrogate) | `doubleclick.net`, tipo `script`, rastreador (`tracking_ad`) | O substituto é um script inerte que bloqueadores injetam no lugar do original. O plugin detecta e não substitui, e o Firefox no modo Padrão também não. A requisição original aparece com o mesmo erro do caso anterior. | Fig. 2 |
| `1major-via-img` | 1 rastreador, `facebook.com/tr`, por `<img>` | `facebook.com`, tipo `image`, rastreador (`tracking_social`) | Sem divergência. O modo Padrão bloqueia os cookies de rastreadores sociais, não a requisição, por isso ela aparece carregada. | Fig. 3 |
| `1major-via-fetch` | 1 rastreador, `facebook.com/tr`, por `fetch` | `facebook.com`, tipo `xmlhttprequest`, rastreador (`tracking_social`) | Sem divergência. O `webRequest` do Firefox reporta `fetch` com o tipo `xmlhttprequest`. | Fig. 4 |
| `document-fragment` | 1 rastreador, `facebook.com/tr`, por `<img>` criado num document fragment | `facebook.com`, tipo `image`, rastreador (`tracking_social`) | Sem divergência. A observação é na rede, então não importa como o elemento foi criado. | Fig. 5 |

<figure class="duo"><img src="img/ddg-tr-1major-via-script.jpg" alt="Print completo"><img class="det" src="img/ddg-tr-1major-via-script-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 1. Tracker Reporting, <code>1major-via-script</code>: aba Terceiros com <code>doubleclick.net</code> marcado como rastreador. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-tr-1major-with-surrogate.jpg" alt="Print completo"><img class="det" src="img/ddg-tr-1major-with-surrogate-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 2. Tracker Reporting, <code>1major-with-surrogate</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-tr-1major-via-img.jpg" alt="Print completo"><img class="det" src="img/ddg-tr-1major-via-img-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 3. Tracker Reporting, <code>1major-via-img</code>: <code>facebook.com</code> como rastreador social. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-tr-1major-via-fetch.jpg" alt="Print completo"><img class="det" src="img/ddg-tr-1major-via-fetch-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 4. Tracker Reporting, <code>1major-via-fetch</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-tr-document-fragment.jpg" alt="Print completo"><img class="det" src="img/ddg-tr-document-fragment-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 5. Tracker Reporting, <code>document-fragment</code>. À direita, detalhe do popup.</figcaption></figure>
## 3.2 Storage blocking

A página grava um valor (677 nesta execução) em vários mecanismos, no contexto de
topo e em iframes de três terceiros (`good.third-party.site`,
`broken.third-party.site`, este tratado como rastreador pela lista de teste do
DuckDuckGo, e `convert.ad-company.site`). Depois, em **Retrieve**, lê de volta. O
valor recuperado significa que o mecanismo não foi bloqueado. O plugin foi lido
depois do **Store**, quando os dados são criados.

| Subteste | Esperado (página) | Plugin | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| Cookies de 1ª parte: `first party header cookie`, `JS cookie`, `JS cookie (__Host)`, `JS cookie (no SameSite)`, `CookieStore` | 677 em todos | `top_firstparty_headerdata` (HTTP), `jsdata`, `__Host-jsdata_host`, `jsdata_no_samesite` e `cookiestoredata` (JavaScript), todos de 1ª parte e persistentes | Sem divergência. | Fig. 6 |
| `JS cookie (3rd party tracking script)` e `(3rd party safe script)` | 677 | `tptdata` e `tpsdata` como cookies de **1ª parte** | O cookie pertence ao domínio da página, embora seja escrito por um script de terceiro, e o plugin classifica pelo domínio do cookie. A partir da v0.3.0, os hooks de `document.cookie` mostram o autor: `tptdata` gravado por `broken.third-party.site` (verificação automática do cenário `ddg-storage` em `tools/smoke_test.py`). | Fig. 6 |
| Cookies HTTP de terceiros no topo: `safe` e `tracking third party header cookie` | 677 | `top_thirdparty_headerdata` (`good.third-party.site`) e `top_tracker_headerdata` (`broken.third-party.site`), 3ª parte, **particionados** | O Firefox não bloqueia esses cookies no modo Padrão: grava na partição de `privacy-test-pages.site` (`partitionKey`). A página os lê de volta porque a leitura acontece na mesma partição. | Fig. 6 |
| Cookies nos três iframes (HTTP e JavaScript) | 677, exceto `ad third party iframe: first party header cookie` (vazio) | 15 cookies de terceiros particionados, de `broken.`, `good.third-party.site` e `convert.ad-company.site`; nenhum cookie HTTP do próprio `convert.ad-company.site` | Sem divergência. O único subteste vazio na página corresponde ao único cookie que o plugin também não viu: não houve `Set-Cookie` correspondente. Total: 25 cookies, 8 de 1ª parte e 17 de 3ª parte, todos persistentes. | Fig. 6 |
| localStorage, sessionStorage, IndexedDB e Cache API no topo | 677 | Origem `privacy-test-pages.site`: chave `data` em localStorage e sessionStorage, banco `data` no IndexedDB, 1 cache (4 itens) | Sem divergência. | Fig. 7 |
| Os mesmos mecanismos nos iframes | 677, exceto IndexedDB no iframe de anúncio (vazio) | No Retrieve: `broken.third-party.site` e `good.third-party.site` com localStorage, sessionStorage, 1 banco IndexedDB e 1 cache; `convert.ad-company.site` sem IndexedDB | Sem divergência, inclusive no IndexedDB ausente do iframe de anúncio. No print do Store (Fig. 7, v0.2.0) o IndexedDB dos iframes aparece zerado: o retrato do frame foi tirado antes de o banco ser criado, e os iframes são removidos logo depois de responder. No Retrieve eles carregam de novo e o banco aparece. | Fig. 7 e 8 |
| WebSQL e `service worker cookieStore` | vazio | não mostrados | O Firefox não implementa WebSQL nem a Cookie Store API em service workers; a página também reporta vazio. | Fig. 8 |
| `memory`, `window.name`, `history`, `browser cache`, `service worker` | 677 | não monitorados | Fora do escopo: variáveis em memória, `window.name` e o histórico não são armazenamento HTML5 persistente, e o cache HTTP e o armazenamento do service worker não são lidos pelo content script. | Fig. 8 |

<figure class="duo"><img src="img/ddg-sb-store-cookies.jpg" alt="Print completo"><img class="det" src="img/ddg-sb-store-cookies-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 6. Storage blocking após Store: aba Cookies com a matriz de 1ª e 3ª parte e os cookies particionados dos iframes. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-sb-store-storage.jpg" alt="Print completo"><img class="det" src="img/ddg-sb-store-storage-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 7. Storage blocking após Store: aba Storage com a origem de topo e as origens dos iframes. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-sb-retrieve-storage.jpg" alt="Print completo"><img class="det" src="img/ddg-sb-retrieve-storage-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 8. Storage blocking após Retrieve: aba Storage e resultado da página. À direita, detalhe do popup.</figcaption></figure>
## 3.3 Fingerprinting

A página coleta 124 atributos do navegador. O plugin monitora as técnicas de
extração ativa: canvas 2D, canvas WebGL e enumeração de fontes. Todas as detecções
foram atribuídas ao script da própria página,
`privacy-protections/fingerprinting/helpers/tests.js` (1ª parte).

| Teste da página | Esperado (página) | Plugin | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| `canvas-2d-todataurl` | imagem PNG do canvas (data URL) | canvas 2000 × 200, `toDataURL` | Sem divergência: texto com mais de 10 caracteres distintos, sem `save`/`restore`, extraído por `toDataURL`. | Fig. 9 |
| `canvas-2d-imagedata` | hash dos pixels | 2 detecções: `getImageData` de 2000 × 200 e `toDataURL` | O mesmo canvas é lido duas vezes e cada leitura conta como uma detecção. Por isso o total é 6 detecções para 5 testes. | Fig. 9 |
| `canvas-2d-offscreen-todataurl` | imagem PNG | canvas `toDataURL`, com o conteúdo copiado de um `OffscreenCanvas` | Sem divergência. O `drawImage` do bitmap do `OffscreenCanvas` transfere ao canvas de destino o texto observado. | Fig. 9 |
| `canvas-webgl` | imagem PNG do canvas WebGL | WebGL, `toDataURL` | Sem divergência. | Fig. 9 |
| `CanvasRenderingContext2D.measureText` | medidas do texto em dezenas de fontes | enumeração de fontes | Sem divergência: o mesmo texto medido 50 ou mais vezes em 50 ou mais fontes. | Fig. 9 |
| `WebGLRenderingContext.getParameter()` e outros 4 testes WebGL | parâmetros e extensões da GPU | não reportado | A página lê só parâmetros padrão. O plugin reporta consulta à GPU apenas para `UNMASKED_VENDOR_WEBGL` e `UNMASKED_RENDERER_WEBGL`, que revelam o modelo real, e o `resultados.json` não tem nenhuma delas. | Fig. 9 |
| `document.fonts.check` e os demais 113 atributos (`navigator`, `screen`, cabeçalhos, CSS, `Intl`, codecs, sensores, WebRTC) | valores dos atributos | não monitorados | São leituras de propriedades que quase todo site faz. Distinguir essas leituras de fingerprinting exigiria outra heurística, e marcar toda leitura geraria alertas em qualquer página. | Fig. 9 |

<figure class="duo"><img src="img/ddg-fp-alertas.jpg" alt="Print completo"><img class="det" src="img/ddg-fp-alertas-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 9. Fingerprinting: aba Alertas com 6 detecções (4 de canvas, 1 de WebGL e 1 de fontes), todas do script da página. À direita, detalhe do popup.</figcaption></figure>
## 3.4 Tracker Blocking

A página faz 23 tipos de requisição a `bad.third-party.site` (script, CSS, imagem,
`<picture>`, `<object>`, áudio, vídeo, iframe, fonte, background, WebSocket,
EventSource, fetch, XHR, `sendBeacon`, favicon, fetch em iframe e em iframe
aninhado, fetch em Web Worker e em Service Worker, relatório CSP e fetch
redirecionado). Ela espera que o domínio esteja numa lista de bloqueio. O teste foi
executado duas vezes: sem e com o domínio na lista de bloqueio do plugin.

| Execução | Esperado (página) | Plugin | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| Sem lista de bloqueio (v0.4.1) | 22 testes carregados; `websocket` falhou | `third-party.site`: 22 requisições de 12 tipos (`script`, `stylesheet`, `font`, `image`, `imageset`, `media`, `object`, `sub_frame`, `websocket`, `beacon`, `xmlhttprequest`, `csp_report`); não marcado como rastreador; 1 erro `NS_ERROR_WEBSOCKET_CONNECTION_REFUSED` | A página reporta os recursos como carregados porque nesse modo o plugin só detecta. `bad.third-party.site` não recebe a marca de rastreador por estar só na lista de teste do DuckDuckGo, não nas listas do Firefox. O WebSocket falhou porque o servidor de teste recusa a conexão, e o plugin registrou a tentativa. O fetch do Service Worker não entra no relatório da aba: o `webRequest` o entrega com `tabId = -1`. | Fig. 10 |
| Com `bad.third-party.site` na lista (v0.6.0) | nenhum dos 23 testes carregado (`not loaded` ou `failed`) | 22 requisições canceladas pelo plugin (`NS_ERROR_ABORT`); aba Bloqueio com a regra ativa | Sem divergência. O fetch do Service Worker também foi bloqueado: requisições sem aba são canceladas quando o documento que as originou (`originUrl`) é de outro site. A diferença entre `not loaded` (elementos HTML e CSS) e `failed` (JavaScript e rede) é só a forma como a página reporta cada tipo. | Fig. 11 e 12 |

<figure class="duo"><img src="img/ddg-rb-terceiros.jpg" alt="Print completo"><img class="det" src="img/ddg-rb-terceiros-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 10. Tracker Blocking sem lista de bloqueio: aba Terceiros com as 22 requisições a <code>third-party.site</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-rb-terceiros-bloqueio.jpg" alt="Print completo"><img class="det" src="img/ddg-rb-terceiros-bloqueio-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 11. Tracker Blocking com <code>bad.third-party.site</code> na lista: aba Terceiros com as requisições bloqueadas pelo plugin. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-rb-bloqueio.jpg" alt="Print completo"><img class="det" src="img/ddg-rb-bloqueio-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 12. Aba Bloqueio com a regra <code>bad.third-party.site</code>. À direita, detalhe do popup.</figcaption></figure>
## 3.5 Storage partitioning

A página grava um identificador em 21 mecanismos em `privacy-test-pages.site`,
navega para `www.first-party.site` e tenta ler os mesmos dados num contexto de
outro site. O resultado `pass` significa que o dado lido em contexto de outro site
veio vazio, ou seja, o armazenamento é particionado.

| Mecanismo | Esperado (página) | Plugin | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| `document.cookie`, cookie HTTP, Cookie Store API | `pass` | Na página final, 3 cookies de 1ª parte de `www.first-party.site` (`partition_test` por JavaScript e `partition_test_http` por HTTP) e nenhum cookie de terceiro | O particionamento é feito pelo Firefox (Total Cookie Protection), não pelo plugin. A leitura em contexto de outro site acontece na janela de teste que a página abre, que tem relatório próprio no plugin. Nesta aba, o plugin mostra os dados gravados pela página (valores iguais aos da coluna `same-site`) e nenhuma origem de terceiro com dados. A evidência direta de particionamento aparece no Storage blocking (3.2), onde os 17 cookies de terceiros têm `partitionKey`. | Fig. 13 e 14 |
| localStorage, sessionStorage, IndexedDB, Cache API | `pass` | Origem `www.first-party.site` com 4 itens: 1 chave em localStorage, 1 em sessionStorage, 1 banco IndexedDB e 1 cache | Sem divergência no que o plugin monitora. | Fig. 13 |
| WebSQL | `unsupported` | não mostrado | O Firefox não implementa WebSQL. | Fig. 13 |
| ServiceWorker, BroadcastChannel, SharedWorker, Web Locks, caches HTTP (fetch, XHR, iframe, imagem, favicon, fonte, CSS, prefetch) e HSTS | `pass` | 3 requisições de imagem a `privacy-test-pages.site` (testes de cache) | Fora do escopo: não são armazenamento HTML5 lido pelo content script. O plugin vê só as requisições de rede dos testes de cache. | Fig. 13 |

<figure class="duo"><img src="img/ddg-sp-storage.jpg" alt="Print completo"><img class="det" src="img/ddg-sp-storage-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 13. Storage partitioning na página final (<code>www.first-party.site</code>): resultado da página e aba Storage. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-sp-cookies.jpg" alt="Print completo"><img class="det" src="img/ddg-sp-cookies-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 14. Storage partitioning: aba Cookies com os 3 cookies de 1ª parte e nenhum particionado nesta aba. À direita, detalhe do popup.</figcaption></figure>
## 3.6 Bounce tracking

Cada link passa por `bad.third-party.site/privacy-protections/bounce-tracking/bounce.html`,
que grava ou lê um identificador (`bounceUID`, em cookie e localStorage) e
redireciona por script, sem interação, para o destino com o identificador na URL
(`bounceUIDlocalStorage`, `bounceUIDcookie` e `isNew`). O esperado é que a
passagem pelo rastreador seja reconhecida como bounce tracking.

| Destino | Esperado | Plugin (v0.4.1) | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| `www.first-party.site` | bounce por `third-party.site` | Bounce por script via `third-party.site`, 36 ms no intermediário sem interação, identificador `bounceUID` repassado em `bounceUIDlocalStorage=60` e `bounceUIDcookie=60` | Sem divergência. O print foi refeito às 22:24 partindo de `privacy-test-pages.site`; o JSON é da visita das 22:08, que partiu de `first-party.site`. As duas mostram o mesmo bounce e o mesmo UID. | Fig. 15 |
| `privacy-test-pages.site` | bounce por `third-party.site` | Bounce por script via `third-party.site`, 63 ms, mesmo UID repassado | Sem divergência. | Fig. 16 |
| `www.publisher-company.site` | bounce por `third-party.site` | Bounce por script via `third-party.site`, vindo de `privacy-test-pages.site`, 93 ms, mesmo UID repassado | Sem divergência. | Fig. 17 |
| `good.third-party.site` | passagem por `bad.third-party.site` | nenhum bounce | Pelo eTLD+1, `bad.third-party.site` e `good.third-party.site` são o mesmo site (`third-party.site`). O identificador não sai do site que o criou, então não há ligação de identidade entre sites diferentes, que é o que caracteriza bounce tracking. | Fig. 18 |

O UID já existia (`isNew` vazio): tinha sido criado numa passagem anterior e foi
reconhecido pelo cabeçalho `Cookie` enviado a `bad.third-party.site`. O teste
automatizado (`tools/smoke_test.py`, cenário `ddg-bounce`) confirma o caso de UID
recém-criado, com `isNew` repassado na URL.

<figure class="duo"><img src="img/ddg-bt-first-party.jpg" alt="Print completo"><img class="det" src="img/ddg-bt-first-party-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 15. Bounce tracking para <code>www.first-party.site</code>: aba Alertas com o bounce e o UID repassado. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-bt-privacy-test-pages.jpg" alt="Print completo"><img class="det" src="img/ddg-bt-privacy-test-pages-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 16. Bounce tracking para <code>privacy-test-pages.site</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-bt-publisher-company.jpg" alt="Print completo"><img class="det" src="img/ddg-bt-publisher-company-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 17. Bounce tracking para <code>www.publisher-company.site</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-bt-good-third-party.jpg" alt="Print completo"><img class="det" src="img/ddg-bt-good-third-party-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 18. Passagem para <code>good.third-party.site</code>: nenhum bounce, pois origem e intermediário são o mesmo site. À direita, detalhe do popup.</figcaption></figure>
## 3.7 Query parameters

Cada link navega para uma URL com parâmetros de rastreamento. A página espera que
eles sejam removidos antes da navegação e mostra o que sobrou.

| Link | Esperado (página) | Plugin (v0.4.1) | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| `utm_source=something&q=other` | `q=other` | detecta `utm_source` | O plugin detecta e mostra o parâmetro, mas não reescreve a URL. O Firefox no modo Padrão também não remove: a remoção de parâmetros dele só atua no modo Rigoroso e para uma lista própria. | Fig. 19 |
| `utm_source=something&utm_medium=somethingelse` | vazio | detecta `utm_source` e `utm_medium` | Mesma explicação. | Fig. 20 |
| `fbclid=12345&fb_source=someting&u=14` | `u=14` | detecta `fbclid` e `fb_source` | Mesma explicação. O parâmetro `u` não é de rastreamento e não é apontado. | Fig. 21 |
| `q=something&id=1234` | `q=something&id=1234` | nenhum parâmetro | Sem divergência: `q` e `id` são parâmetros funcionais. | Fig. 22 |

<figure class="duo"><img src="img/ddg-qp-utm-source.jpg" alt="Print completo"><img class="det" src="img/ddg-qp-utm-source-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 19. Query parameters, <code>utm_source</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-qp-utm-source-medium.jpg" alt="Print completo"><img class="det" src="img/ddg-qp-utm-source-medium-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 20. Query parameters, <code>utm_source</code> e <code>utm_medium</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-qp-fbclid.jpg" alt="Print completo"><img class="det" src="img/ddg-qp-fbclid-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 21. Query parameters, <code>fbclid</code> e <code>fb_source</code>. À direita, detalhe do popup.</figcaption></figure>
<figure class="duo"><img src="img/ddg-qp-sem-rastreamento.jpg" alt="Print completo"><img class="det" src="img/ddg-qp-sem-rastreamento-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 22. Query parameters sem rastreamento. À direita, detalhe do popup.</figcaption></figure>
## 3.8 js-leaks

A página percorre as propriedades de `window` e `navigator` e compara com o perfil
de um navegador de referência (Firefox 92), listando o que foi adicionado,
removido ou alterado. Ela detecta alterações no escopo global, como as feitas por
um script de hook, e serve de teste para os indicadores de sequestro do navegador.

| Aspecto | Esperado (página) | Plugin (v0.6.0) | Divergência e explicação | Print |
|--------------|------------|------------------|--------------------------|-------|
| Globais criadas pela página | a verificação cria variáveis globais ao rodar | aba Alertas, Sequestro do navegador: 2 globais adicionadas, `collectedProps` e `results`; nenhuma função nativa substituída | Sem divergência. O plugin compara o `window` com o retrato de `document_start` e aponta exatamente o que o script da página criou. | Fig. 23 |
| Diferenças em relação ao Firefox 92 | 889 adicionadas, 17 removidas, 2 alteradas | não reportadas | São diferenças de versão do navegador (APIs novas desde o Firefox 92), não alterações feitas por script. O plugin compara com o próprio navegador, não com uma referência externa. | Fig. 23 |
| Pegada do próprio plugin | a página não deve encontrar a instrumentação | resultado idêntico com e sem o plugin: 889, 17 e 2 nas duas execuções | Os hooks ficam nos protótipos (via `exportFunction`) e não criam globais. A comparação automática está em `evidencias/ddg/js-leaks/automatizado/comparacao.json`. | Fig. 23 |

<figure class="duo"><img src="img/ddg-jl-alertas.jpg" alt="Print completo"><img class="det" src="img/ddg-jl-alertas-popup.jpg" alt="Detalhe do popup"><figcaption>Figura 23. js-leaks: aba Alertas com as globais <code>collectedProps</code> e <code>results</code> criadas pela página. À direita, detalhe do popup.</figcaption></figure>
<div class="quebra"></div>

# 4. Entregável 3: análise de três sites reais

## 4.1 Sites e protocolo de coleta

| Site | Perfil esperado | Motivo da escolha |
|--------------|------------|-----------------------------------------------------|
| `www.sp.gov.br` | pouco rastreamento | portal do governo estadual, linha de base |
| `www.quintoandar.com.br` | médio | gravação de sessão, analytics de produto, tagueamento no próprio domínio |
| `www.uol.com.br` | alto | portal de notícias com publicidade programática |

Para cada site foram coletados, no perfil do plugin: dados do site limpos, DevTools
aberto antes de digitar a URL, 30 s sem interagir (sem aceitar o banner de
cookies, como o Blacklight), HAR exportado, prints do popup e JSON do plugin do
mesmo carregamento. Em seguida, no perfil do uBlock Origin, a mesma URL com print
do popup e exportação do registro (`ublock.txt`), e a análise do Blacklight com
download dos dados brutos.

Houve duas coletas com o plugin. A primeira (v0.3.0, 27/09 entre 19:53 e 21:07) foi
feita junto com o uBlock Origin e o Blacklight. A segunda, **coleta final**
(v0.7.0, 27/09 às 23:21 e 23:38 e 28/09 às 00:18), usa o plugin completo e é a
base desta seção e do score. A primeira requisição dos HARs da 1ª coleta já levava
cookies do site, sinal de uma visita anterior sem limpeza de dados: eram visitas de
retorno, enquanto o Blacklight sempre faz a primeira visita. Nas coletas finais do
sp.gov.br e do UOL a primeira requisição sai sem cookies. A do QuintoAndar
continuou sendo uma visita de retorno (seção 4.3). Tudo está registrado no
`notas.md` de cada site.

A reconciliação foi gerada por `tools/reconcile.js`, que cruza o JSON do plugin,
o nosso HAR, o registro do uBlock Origin e os dados brutos do Blacklight. Cada site
rastreador visto por alguma das ferramentas tem uma linha com a regra que o
classificou, o número de requisições em cada HAR, uma URL de exemplo e a causa da
divergência. As tabelas completas estão em `evidencias/sites/<site>/reconciliacao.md`;
abaixo, cada divergência aparece com a explicação e a evidência de tráfego.

Critérios de classificação de cada ferramenta: o plugin usa as listas do Firefox
(Disconnect, incluindo a categoria de conteúdo da proteção rigorosa); o Blacklight
usa EasyList e EasyPrivacy; o uBlock Origin usa as listas padrão dele e mostra o
que bloqueou. Quando o uBO bloqueia um script, as requisições que esse script
faria não acontecem ("bloqueio em cascata"), e por isso vários rastreadores não
aparecem no registro dele.

## 4.2 sp.gov.br

**Coleta final**: `final/sp.gov.br.har` com 71 requisições entre 23:21:47 e
23:21:50 (a página para de fazer requisições em 4 s), primeira requisição sem
cookies. O endereço digitado, `sp.gov.br`, redireciona para
`www.sp.gov.br/sp`. Como `sp.gov.br` é um sufixo público, o site da página é
`www.sp.gov.br`.

| | Plugin | uBlock Origin | Blacklight |
|---|---|---|---|
| Sites de 3ª parte | 6 | 3 | 6 (no HAR dele) |
| Sites rastreadores | 4 (listas do Firefox) | 1 com bloqueio | 2 (EasyList/EasyPrivacy) |
| Cookies de 3ª parte | 0 | não informa | 2 |
| Canvas fingerprinting | não | não informa | sim |
| GA com remarketing | sim | não informa | sim |

| Site | Plugin | uBO | Blacklight | Explicação e evidência |
|--------------|---------------|-----------|-----------|------------------------------------|
| `google.com` | rastreador (`tracking_analytics`) | não requisitado | EasyPrivacy | Concordam. `analytics.google.com/g/collect?...tid=G-G3W3M6971H`, 1 requisição em cada HAR. No perfil do uBO a requisição não existe porque o `gtag.js` que a faria foi bloqueado. |
| `doubleclick.net` | rastreador (`tracking_ad`) | não requisitado | visto, não classificado | Presente nos dois HARs (`stats.g.doubleclick.net/g/collect`, hit de remarketing do GA). O Firefox classifica como anúncio; nas listas do Blacklight esse endereço não conta como ad tracker, mas o teste de GA com remarketing dele o identifica. |
| `google.com.br` | rastreador (`tracking_content`) | não requisitado | não visto | `www.google.com.br/ads/ga-audiences`, só no nosso HAR. Na visita do Blacklight, o hit de remarketing parou em `stats.g.doubleclick.net`, sem a requisição de audiência. |
| `jsdelivr.net` | rastreador (`tracking_content`) | permitiu 12 | visto, não classificado | Nos dois HARs (`cdn.jsdelivr.net/gh/spbgovbr-vlibras/...`, plugin de acessibilidade VLibras). A lista rigorosa do Firefox marca a CDN como conteúdo de rastreamento; EasyList e EasyPrivacy não. |
| `googletagmanager.com` | visto, não classificado | bloqueou 12 de 12 | EasyPrivacy | O Firefox não classifica o Tag Manager; EasyPrivacy e uBO sim. |

**Cookies**: o Blacklight conta 2 cookies de terceiros, ambos `__cf_bm` de
`hcaptcha.com`. Eles vêm do desafio anti-bot, que só aparece para navegador
automatizado (item abaixo); o nosso HAR não tem nenhuma requisição a
`hcaptcha.com`. O Imperva ainda tenta gravar 4 cookies com `Domain=.sp.gov.br`
(`visid_incap_3308181`, `nlbi_3308181`, `incap_ses_987_3308181`,
`nlbi_3308181_2147483392`), que nenhum navegador grava por `sp.gov.br` ser sufixo
público (RFC 6265, seção 5.3). A v0.7.0 os contava como cookies de terceiros; a
v0.7.1 os descarta (seção 5.4, item 6).

**Fingerprinting**: o Blacklight detectou canvas por `newassets.hcaptcha.com` e
por scripts do Imperva servidos em `www.sp.gov.br` com caminhos aleatórios. Na
coleta manual o plugin não detectou nada, e o HAR não tem essas requisições. Numa
coleta automatizada com o plugin (`automatizado/`, Firefox controlado por
Selenium, com `navigator.webdriver = true`), o plugin detectou canvas e WebGL por
`newassets.hcaptcha.com`, como o Blacklight. O fingerprinting existe, mas é a
proteção anti-bot do Imperva e só atinge navegadores automatizados.

**CNAME**: o uBO resolve o DNS e mostra `cdn.jsdelivr.net` apontando para a
Cloudflare; não há subdomínio do próprio site disfarçando um terceiro.

![Figura 24. sp.gov.br, coleta final: aba Score (81 na v0.7.0; 85 na v0.7.1, ver seção 5).](img/sp-score.jpg)

![Figura 25. sp.gov.br, coleta final: aba Alertas com GA com remarketing e funções nativas substituídas.](img/sp-alertas.jpg)

![Figura 26. sp.gov.br no Blacklight.](img/sp-blacklight.jpg){.tall}

![Figura 27. sp.gov.br no uBlock Origin.](img/sp-ublock.jpg)

## 4.3 quintoandar.com.br

**Coleta final**: `final/quintoandar.com.br.har` com 157 requisições entre
00:18:26 e 00:18:39. Esta coleta foi uma recarga de uma página já aberta, e a
primeira requisição levava cookies de visitas anteriores (`FPAU`,
`amplitude_id_...` e `FPGCLAW`, este com um `gclid` de clique em anúncio do
Google). É uma visita de retorno, e os repasses do `5A_gclid` a terceiros são
artefato da coleta (seção 5.4, item 4).

| | Plugin | uBlock Origin | Blacklight |
|---|---|---|---|
| Sites de 3ª parte | 9 | 7 | 10 (no HAR dele) |
| Sites rastreadores | 8 (listas do Firefox) | 5 com bloqueio | 9 no `inspection.json` (5 no relatório) |
| Cookies de 3ª parte | 0 | não informa | 0 |
| Gravação de sessão | sim (Hotjar) | não informa | sim (Hotjar) |

| Site | Plugin | uBO | Blacklight | Explicação e evidência |
|--------------|---------------|-----------|-----------|------------------------------------|
| `amplitude.com`, `google-analytics.com`, `hotjar.com`, `sentry.io` | rastreadores (`tracking_analytics`) | bloqueou todos | EasyPrivacy | Concordam as três ferramentas. Ex.: `api.amplitude.com`, `static.hotjar.com/c/hotjar-1203740.js`. |
| `doubleclick.net`, `google.com` | rastreadores (`tracking_ad`, `tracking_content`) | não requisitados | EasyList, EasyPrivacy | Concordam plugin e Blacklight (`googleads.g.doubleclick.net/pagead/viewthroughconversion/928881125/`, `www.google.com/rmkt/collect/928881125/`). No perfil do uBO, bloqueio em cascata. |
| `braze.com` | rastreador (`tracking_ad`) | permitiu 16 | visto, não classificado | Nos dois HARs (`customer.iad-03.braze.com/api/v3/data/`). O Firefox classifica a Braze (automação de marketing) como anúncio; EasyList e EasyPrivacy não. |
| `google.com.br` | rastreador (`tracking_content`) | não requisitado | não visto | `www.google.com.br/pagead/1p-user-list/928881125/`, lista de remarketing. Na visita do Blacklight, a partir dos EUA, a mesma requisição foi para `www.google.com/pagead/1p-user-list/928881125/`: o Google usa o domínio do país do visitante. |
| `googletagmanager.com` | visto, não classificado | bloqueou 6 de 6 | EasyPrivacy | O Firefox não classifica o Tag Manager (`gtm.js?id=GTM-M6VG8FQ`). |
| `criteo.com` | não visto | não requisitado | EasyPrivacy | `gum.criteo.com/sync?c=803`: no HAR do Blacklight, disparado pelo `googletagmanager.com`; ausente do nosso HAR. Sincronização que não ocorreu na nossa visita. |
| `googleadservices.com` | não visto | não requisitado | EasyPrivacy | `www.googleadservices.com/pagead/conversion/928881125/`, ausente do nosso HAR: tag de conversão não disparada na visita a partir do Brasil. |

**Rastreamento pelo próprio domínio**: o cookie `FPAU` (identificador de
publicidade do Google em cookie de 1ª parte) é gravado por
`tracking.quintoandar.com.br/g/collect`, um servidor de tagueamento do Google
hospedado no domínio do site. O plugin o trata como 1ª parte pela URL, mas a
sincronização o revela: o valor do `FPAU` vai na URL de requisições a
`doubleclick.net`, `google.com` e `google.com.br`. O uBO, que resolve DNS, mostra
também `id.quintoandar.com.br` apontando para a CloudFront.

**Gravação de sessão e teclado**: as duas ferramentas detectam o Hotjar. O
Blacklight atribui ao Hotjar um listener de `keypress`; o plugin atribui todos os
listeners de teclado a scripts do próprio site. A causa é o Sentry, empacotado no
JavaScript do site, que substitui `EventTarget.prototype.addEventListener` (o
plugin aponta essa substituição). Depois disso, o chamador imediato de todo
`addEventListener` é o wrapper do Sentry. É uma limitação da atribuição pela
pilha, discutida na seção 5.4.

![Figura 28. QuintoAndar, coleta final: aba Score.](img/qa-score.jpg)

![Figura 29. QuintoAndar, coleta final: aba Alertas com gravação de sessão, sincronização de IDs e funções nativas substituídas.](img/qa-alertas.jpg){.tall}

![Figura 30. QuintoAndar no Blacklight.](img/qa-blacklight.jpg){.tall}

![Figura 31. QuintoAndar no uBlock Origin.](img/qa-ublock.jpg)

## 4.4 uol.com.br

**Coleta final**: `final/uol.com.br.har` com 372 requisições entre 23:38:53 e
23:40:08 (a gravação foi pausada aos 75 s; o plugin considera os primeiros 30 s),
primeira requisição sem cookies.

| | Plugin | uBlock Origin | Blacklight |
|---|---|---|---|
| Sites de 3ª parte | 51 | 23 | 127 (no HAR dele) |
| Sites rastreadores | 43 (listas do Firefox) | 15 com bloqueio | 114 no `inspection.json` (82 no relatório) |
| Cookies de 3ª parte | 33 (32 particionados) | não informa | 206 |
| Pixel do X, gravação de sessão | não | não informa | pixel do X sim; Clarity só no dado bruto |

A diferença de escala tem três causas verificáveis no tráfego. O Blacklight
visitou duas páginas (`/` e `/nossa/viagem/fora-da-rota/`) em 67 s, a partir dos
EUA, num Chrome sem particionamento de cookies; o plugin considera 30 s da página
inicial, a partir do Brasil. O leilão de anúncios dispara cadeias de sincronização
que variam a cada visita. Com a aba aberta por mais tempo, o plugin chegou a 82
sites rastreadores (`totals.trackerSites` no JSON). A tabela agrupa os 125 sites
rastreadores pela causa; a linha de cada site, com URL de exemplo, está em
`evidencias/sites/uol.com.br/reconciliacao.md`.

| Grupo | Sites | Explicação e evidência |
|--------------|------------------------------|----------------------------------------|
| Concordam plugin, Blacklight e uBO (8) | `adtrafficquality.google`, `chartbeat.com`, `cxense.com`, `doubleclick.net`, `google-analytics.com`, `google.com`, `permutive.app`, `scorecardresearch.com` | Presentes nos dois HARs e classificados pelas três ferramentas. |
| Concordam plugin e Blacklight (27) | `2mdn.net`, `3lift.com`, `adnxs.com`, `amazon-adsystem.com`, `chartbeat.net`, `creativecdn.com`, `criteo.com`, `criteo.net`, `crwdcntrl.net`, `googlesyndication.com`, `gstatic.com`, `id5-sync.com`, `im-apps.net`, `imasdk.googleapis.com`, `linkedin.com`, `loopme.me`, `newsroom.bi`, `openxcdn.net`, `permutive.com`, `pubmatic.com`, `rfihub.com`, `rubiconproject.com`, `seedtag.com`, `smartadserver.com`, `turner.com`, `yahoo.com`, `yieldmo.com` | No perfil do uBO não foram requisitados: o uBO troca o `gpt.js` do Google Ad Manager (`securepubads.g.doubleclick.net/tag/js/gpt.js`) por um substituto inerte (`googletagservices_gpt.js`), e o leilão que carregaria esses participantes não acontece. |
| Só no Blacklight, disparados por leilão e sincronização (57) | `1rx.io`, `33across.com`, `adform.net`, `adsrvr.org`, `bidswitch.net`, `demdex.net`, `doubleverify.com`, `gumgum.com`, `lijit.com`, `openx.net`, `outbrain.com`, `rlcdn.com`, `tapad.com` e outros 44 | Ausentes do nosso HAR. No HAR do Blacklight, o iniciador de cada um é outro terceiro: `amazon-adsystem.com` em 31, `cadent.com` em 20, `gumgum.com` em 14. São cadeias do leilão e da sincronização da visita a partir dos EUA, que não se repetiram na nossa. |
| Só no Blacklight, 2ª página (7) | `ads-twitter.com`, `t.co`, `twitter.com`, `facebook.com`, `facebook.net`, `clarity.ms`, `dv.tech` | Requisições cujo `Referer` no HAR do Blacklight é `https://www.uol.com.br/nossa/viagem/fora-da-rota/`, a segunda página que ele visitou (ex.: `static.ads-twitter.com/uwt.js`, `analytics.twitter.com/1/i/adsct`, `www.clarity.ms/tag/k0p1ivolq3`). |
| Só no Blacklight, sincronização fora do HAR dele (9) | `adkernel.com`, `agkn.com`, `blismedia.com`, `cognitivlabs.com`, `mathtag.com`, `mxptint.net`, `onaudience.com`, `semasio.net`, `tribalfusion.com` | Não estão em nenhum dos dois HARs. O Blacklight os registrou no `inspection.json` a partir de iframes e redirecionamentos de sincronização (ex.: `ads.pubmatic.com/AdServer/js/user_sync.html`; `sync.mathtag.com/sync/img?...&redir=`). Não ocorreram na nossa visita. |
| Só no Blacklight, não carregados do Brasil (3) | `a-mo.net`, `gvt1.com`, `nrich.ai` | Ausentes do nosso HAR e sem iniciador de terceiro no HAR do Blacklight: anúncio ou segmentação por região. |
| Blacklight e uBO, não classificados pelo Firefox (3) | `googletagmanager.com`, `jsuol.com.br`, `imguol.com.br` | Nos dois HARs. O Firefox não classifica esses domínios; EasyList e EasyPrivacy sim (ex.: regra de EasyList para `/publicidade/` em `imguol.com.br`). São CDNs do próprio UOL em outro eTLD+1. |
| Só no plugin, classificados só pelo Firefox (6) | `mrf.io`, `youtube.com`, `piano.io`, `privacymanager.io`, `prmutv.co`, `tinypass.com` | Nos dois HARs. O Firefox os classifica como anúncio ou conteúdo (Marfeel, Piano/Tinypass, Permutive); EasyList e EasyPrivacy não. |
| Só no plugin, ausentes do HAR do Blacklight (2) | `admaster.cc`, `google.com.br` | Carregados só na nossa visita (ex.: `www.google.com.br/ads/ga-audiences`); o HAR do Blacklight não tem requisição de audiência do GA. |
| Só no uBO (3) | `googleadservices.com`, `csp.withgoogle.com`, `logger.uol.com.br` | O uBO bloqueia por regras próprias (`||googleadservices.com^`, `no-csp-reports`, `||logger.uol.com.br^`) domínios que o Firefox não classifica. |

**Cookies**: o plugin conta 33 cookies de terceiros nos primeiros 30 s, 32 deles
particionados pela Total Cookie Protection. O Blacklight conta 206 em 67 s e duas
páginas, num Chrome sem particionamento, em que cada participante do leilão grava e
lê o próprio cookie entre sites.

**Sincronização**: só o plugin mede. Nos primeiros 30 s, 13 identificadores de 1ª
parte foram enviados a terceiros, por exemplo o `UOLID` na URL de
`securepubads.g.doubleclick.net/gampad/ads`, `analytics.google.com/g/collect` e
`comcluster.cxense.com/Repo/rep.gif`, e o `permutive-id` em
`cm.g.doubleclick.net/pixel` e `googlesync.permutive.com/v2.0/px/sync`. Houve
também 3 pares de sincronização entre terceiros: `st_uid` do `seedtag.com` e
`viewer_token` do `loopme.me` enviados a `cm.g.doubleclick.net/pixel` (cookie
matching do Google) e `browser_data` do `dnacdn.net` enviado a
`gum.criteo.com/sid/json`.

![Figura 32. UOL, coleta final: aba Score (23, F).](img/uol-score.jpg)

![Figura 33. UOL, coleta final: aba Alertas, parte 1.](img/uol-alertas-1.jpg){.tall}

![Figura 34. UOL, coleta final: aba Alertas, parte 2 (sincronização de IDs).](img/uol-alertas-2.jpg){.tall}

![Figura 35. UOL, coleta final: aba Alertas, parte 3 (sequestro do navegador e listeners de teclado).](img/uol-alertas-3.jpg){.tall}

![Figura 36. UOL no Blacklight.](img/uol-blacklight.jpg){.tall}

![Figura 37. UOL no uBlock Origin.](img/uol-ublock.jpg)

## 4.5 Síntese das causas de divergência

As divergências entre as ferramentas se explicam por cinco causas, todas visíveis
no tráfego:

1. **Visita diferente**: o Blacklight visita duas páginas, por mais tempo, a partir
   dos EUA; o leilão de anúncios e as sincronizações mudam a cada visita. É a causa
   de 76 dos 79 rastreadores vistos só pelo Blacklight no UOL.
2. **Navegador automatizado**: o anti-bot do sp.gov.br só faz fingerprinting para
   robôs, como o Blacklight e a nossa coleta com Selenium.
3. **Listas diferentes**: Disconnect (Firefox) é mais abrangente em analytics e
   CDNs; EasyList e EasyPrivacy, em publicidade e no Tag Manager.
4. **Bloqueio em cascata**: o uBO bloqueia o script que carregaria os demais, e por
   isso muitos rastreadores nem chegam a ser requisitados no perfil dele.
5. **Proteção do navegador**: o Firefox particiona os cookies de terceiros que o
   Chrome do Blacklight grava sem particionar.

<div class="quebra"></div>

# 5. Entregável 4: pontuação de privacidade

## 5.1 Metodologia

A pontuação vai de 0 a 100 (maior é melhor). Parte de 100 e desconta pontos em 7
critérios. Cada critério tem um teto, e os tetos somam 100, para que um critério
sozinho não domine a nota: um portal com 80 rastreadores não zera a nota só por
isso. Só entra o que foi observado nos primeiros 30 s da navegação, a mesma janela
do HAR. O cálculo está em `extension/background/score.js` e é o mesmo no popup e
na ferramenta `tools/score.js`, que aplica o score aos três sites.

| Critério | Teto | Pontos por ocorrência | Teste do Blacklight |
|-------------------|------|--------------------------------------|-------------------|
| Rastreadores de terceira parte | 20 | 2 por site classificado como rastreador pelas listas do Firefox | Ad trackers |
| Cookies de terceira parte | 15 | 1 por cookie; 2 se a validade passa de 1 ano | Third-party cookies |
| Identificadores guardados por terceiros | 10 | 1 por cookie ou chave de storage de 1ª parte gravado por script de 3ª parte; 1 por origem de 3ª parte com storage | não mede |
| Fingerprinting | 15 | canvas, WebGL ou fontes: 15 por script de 3ª parte, 8 de 1ª; só consulta à GPU: 4 (3ª) ou 2 (1ª) | Canvas fingerprinting |
| Sincronização de IDs e bounce tracking | 15 | 3 por par de sincronização entre terceiros; 1 por ID de 1ª parte enviado a terceiro; 5 por bounce | não mede |
| Vigilância comportamental | 15 | gravação de sessão: 10; cada pixel (Facebook, TikTok, X, LinkedIn): 3; GA com remarketing: 3; cada site de 3ª parte com script ouvindo o teclado: 3 | Session recording, key logging, pixels, GA remarketing |
| Sequestro do navegador | 10 | assinatura de hook conhecida: 10; WebSocket ou EventSource para terceiro: 4; polling de terceiro: 2; funções nativas substituídas: 2 | não mede |

Faixas: A a partir de 85, B a partir de 70, C a partir de 50, D a partir de 30 e F
abaixo de 30.

**Justificativa dos pesos.** O que o usuário não consegue apagar nem bloquear com
controles de cookies (fingerprinting, sincronização de IDs, bounce e sequestro do
navegador) desconta mais por ocorrência do que cookies e storage, que ele apaga.
A presença em listas de rastreamento desconta; a simples presença de terceiros
(CDN, fontes) não, porque sozinha não indica rastreamento. Indícios descontam menos
que evidências: ouvir o teclado é condição para key logging, não prova dele (o
Blacklight só marca key logging quando o texto digitado sai na rede), por isso vale
3 por site, contra 10 da gravação de sessão. Os critérios espelham os testes do
Blacklight, para permitir a comparação, e acrescentam o que o plugin mede além
dele.

O score mede o **comportamento do site**, não a proteção do navegador: cookies de
terceiros contam mesmo quando o Firefox os particiona, porque o mesmo site, num
navegador sem essa proteção, rastrearia com eles.

## 5.2 Resultado

Coleta final de cada site, desconto por critério:

| Critério (teto) | sp.gov.br | quintoandar.com.br | uol.com.br |
|------------------------|---------|---------|---------|
| Rastreadores de terceira parte (20) | 8 | 16 | 20 |
| Cookies de terceira parte (15) | 0 | 0 | 15 |
| Identificadores guardados por terceiros (10) | 2 | 3 | 10 |
| Fingerprinting (15) | 0 | 0 | 0 |
| Sincronização de IDs e bounce tracking (15) | 0 | 6 | 15 |
| Vigilância comportamental (15) | 3 | 10 | 15 |
| Sequestro do navegador (10) | 2 | 2 | 2 |
| **Score** | **85 (A)** | **63 (C)** | **23 (F)** |

As ocorrências de cada desconto:

- **sp.gov.br**: 4 rastreadores (`jsdelivr.net`, `doubleclick.net`, `google.com`,
  `google.com.br`); `_ga` e `_ga_G3W3M6971H` gravados pelo `googletagmanager.com`;
  GA com remarketing; 2 funções nativas substituídas.
- **quintoandar.com.br**: 8 rastreadores; 3 cookies de 1ª parte gravados por
  terceiros (`_ga_E2JVTQ7D7Q` pelo Google, `_hjSessionUser_1203740` e `_hjTLDTest`
  pelo Hotjar); 6 envios de ID de 1ª parte (`FPAU` e `5A_gclid` a `doubleclick.net`,
  `google.com` e `google.com.br`); gravação de sessão (Hotjar); 7 funções nativas
  substituídas (Sentry e Grafana Faro).
- **uol.com.br**: 43 rastreadores; 33 cookies de terceiros; 97 cookies e chaves de 1ª
  parte gravados por terceiros (Chartbeat, Piano/Tinypass, Marfeel, Lotame, Google);
  13 IDs de 1ª parte enviados a terceiros e 3 pares de sincronização entre
  terceiros; GA com remarketing, LinkedIn Insight e listeners de teclado de 9 sites
  de terceiros; 1 função nativa substituída.

O popup da coleta mostrava 81 (B) para o sp.gov.br. A diferença para 85 vem da
correção descrita na seção 5.4, item 6. No QuintoAndar, 3 dos 6 pontos de
sincronização vêm do `5A_gclid`, artefato da visita de retorno (item 4); sem eles, o
score seria 66 (C).

## 5.3 Análise de sensibilidade

Cada peso (teto e pontos por ocorrência do critério) foi multiplicado por 0,7 e por
1,3, um de cada vez, com a nota renormalizada para 0 a 100.

| Critério variado | Fator | sp.gov.br | QuintoAndar | UOL | Mesma ordem |
|------------------------|-----|-------|-------|-------|-------|
| (pesos originais) | 1 | 85 | 63 | 23 | |
| Rastreadores | 0,7 | 87 | 66 | 24 | sim |
| Rastreadores | 1,3 | 84 | 61 | 22 | sim |
| Cookies de terceiros | 0,7 | 84 | 61 | 24 | sim |
| Cookies de terceiros | 1,3 | 86 | 65 | 22 | sim |
| Identificadores de terceiros | 0,7 | 85 | 63 | 24 | sim |
| Identificadores de terceiros | 1,3 | 85 | 63 | 22 | sim |
| Fingerprinting | 0,7 | 84 | 61 | 19 | sim |
| Fingerprinting | 1,3 | 86 | 65 | 26 | sim |
| Sincronização e bounce | 0,7 | 84 | 63 | 24 | sim |
| Sincronização e bounce | 1,3 | 86 | 63 | 22 | sim |
| Vigilância comportamental | 0,7 | 85 | 64 | 24 | sim |
| Vigilância comportamental | 1,3 | 85 | 62 | 22 | sim |
| Sequestro do navegador | 0,7 | 85 | 62 | 21 | sim |
| Sequestro do navegador | 1,3 | 85 | 63 | 25 | sim |

A ordem dos sites se mantém nas 14 variações. A letra do sp.gov.br, não: ele fica
entre 84 e 87, na fronteira entre A e B.

## 5.4 Comparação crítica com o Blacklight

O Blacklight não dá nota. Para comparar, o score do plugin foi aplicado também às
contagens do Blacklight: ad trackers, cookies de terceiros, canvas, gravação de
sessão, pixels, GA com remarketing e listeners de teclado do dado bruto
(`behaviour_event_listeners`). Os critérios que o Blacklight não mede ficam em
zero. Assim, a diferença entre as duas notas se separa em diferença do que cada
ferramenta **viu** e diferença do que cada uma **mede**.

| Critério (teto) | sp.gov.br plugin | sp.gov.br Blacklight | Quinto Andar plugin | Quinto Andar Blacklight | UOL plugin | UOL Blacklight |
|----------------------|------|------|------|------|------|------|
| Rastreadores (20) | 8 | 4 | 16 | 10 | 20 | 20 |
| Cookies de terceiros (15) | 0 | 2 | 0 | 0 | 15 | 15 |
| Identificadores de terceiros (10) | 2 | não mede | 3 | não mede | 10 | não mede |
| Fingerprinting (15) | 0 | 15 | 0 | 0 | 0 | 0 |
| Sincronização e bounce (15) | 0 | não mede | 6 | não mede | 15 | não mede |
| Vigilância comportamental (15) | 3 | 3 | 10 | 13 | 15 | 15 |
| Sequestro do navegador (10) | 2 | não mede | 2 | não mede | 2 | não mede |
| **Score** | **85 (A)** | **76 (B)** | **63 (C)** | **77 (B)** | **23 (F)** | **50 (C)** |

**Onde concordam.** O UOL é o pior site nas duas medições, com rastreadores e
cookies de terceiros no teto. As duas ferramentas encontram gravação de sessão
(Hotjar) no QuintoAndar e GA com remarketing no sp.gov.br e no UOL, e nenhuma
encontra pixel do Facebook ou do TikTok na página inicial.

**Onde divergem e por quê.** A diferença de nota se decompõe exatamente pelos
critérios:

| Site | Plugin | Blacklight | Decomposição da diferença |
|--------------|-------|---------|-----------------------------------------------|
| sp.gov.br | 85 | 76 | O Blacklight desconta 15 de fingerprinting e 2 de cookies (hCaptcha, item 1). O plugin desconta 4 a mais de rastreadores (item 3), 2 de storage e 2 de sequestro (item 7). |
| quintoandar.com.br | 63 | 77 | O plugin desconta 6 a mais de rastreadores (item 3), 3 de storage, 6 de sincronização e 2 de sequestro (item 7). O Blacklight desconta 3 a mais de teclado (item 5). |
| uol.com.br | 23 | 50 | Só critérios que o Blacklight não mede: 10 de storage, 15 de sincronização e 2 de sequestro (item 7). |

1. **Navegador automatizado.** O fingerprinting e os cookies do hCaptcha no
   sp.gov.br só aparecem para robôs (seção 4.2). Custam 17 pontos na régua do
   Blacklight; sem eles o sp.gov.br teria 93 e a ordem seria a mesma do plugin.
   Essa é a única inversão de ordem entre as ferramentas. Nenhuma das duas erra: o
   fingerprinting é real, mas atinge robôs, não o visitante comum.
2. **Escala.** No UOL o Blacklight viu 82 ad trackers e 206 cookies; o plugin, 43 e
   33 em 30 s. O score é insensível a essa diferença por construção, porque 10
   rastreadores e 15 cookies já atingem o teto.
3. **Listas.** O plugin conta `jsdelivr.net` e `google.com.br` no sp.gov.br e
   `braze.com` no QuintoAndar, que EasyList e EasyPrivacy não classificam.
4. **Primeira visita e visita de retorno.** Na 1ª coleta, visita de retorno, o
   sp.gov.br não enviou o hit de remarketing do GA (só
   `analytics.google.com/g/collect`). Na coleta final, limpa, enviou o hit a
   `stats.g.doubleclick.net/g/collect`, como na visita do Blacklight, e ainda a
   `www.google.com.br/ads/ga-audiences`. A divergência da 1ª reconciliação vinha da coleta,
   não do detector. No QuintoAndar, a visita de retorno trouxe o `gclid` de um
   clique anterior em anúncio e 3 pontos de artefato.
5. **Autoria de listeners.** O Blacklight atribui ao Hotjar um listener de teclado
   que o plugin atribui ao Sentry do próprio site, porque o Sentry substituiu
   `addEventListener` (seção 4.3). A limitação custaria 3 pontos ao QuintoAndar.
6. **Erro do plugin encontrado na comparação.** A v0.7.0 contava como cookies de
   terceiros os 4 cookies do Imperva com `Domain=.sp.gov.br`, que nenhum navegador
   grava. O JSON mostra `stored: false` e o Blacklight não os tem. A v0.7.1 descarta
   `Set-Cookie` com domínio em sufixo público, como manda a RFC 6265 (seção 5.3), e
   o sp.gov.br passou de 81 para 85.
7. **O que só o plugin mede.** Sincronização de IDs, identificadores gravados por
   terceiros e indícios de sequestro. No UOL, esses critérios são toda a diferença
   entre 23 e 50: é rastreamento que liga a identidade do usuário entre sites sem
   depender de cookies de terceiros e, por isso, continua funcionando com o
   particionamento do Firefox.

## 5.5 Limitações

A medição cobre uma visita, uma página e 30 s, a partir do Brasil, no Firefox. O
Blacklight cobre duas páginas, de 19 a 67 s, a partir dos EUA, num Chrome. Os
itens 1, 2 e 4 acima mostram que a forma da coleta muda o resultado mais do que a
metodologia.

Os tetos comprimem o fim da escala: o UOL tem 4 dos 7 critérios no teto, e o score
não distingue o UOL de um site ainda pior. Em troca, um único critério não derruba
um site sozinho.

Presença não é dano. Listeners de teclado e funções nativas substituídas são
indícios, comuns em SDKs de observabilidade como o Sentry, e por isso valem 3 e 2
pontos. A atribuição de autoria pela pilha falha quando um SDK substitui a função
instrumentada (item 5), e canvas em Web Workers não é observado, porque workers não
recebem content scripts.

Os pesos são escolhas. A análise de sensibilidade mostra que a ordem dos sites não
depende deles; a letra de um site na fronteira, como o sp.gov.br, depende.

# 6. Conclusão

O plugin reproduziu o esperado em todas as páginas do DuckDuckGo que se referem ao
que ele monitora. As divergências vêm de três fontes documentadas: proteções do
próprio Firefox (particionamento, cookies de rastreadores sociais), mecanismos fora
do escopo do plugin (caches HTTP, WebSQL, atributos simples de fingerprinting) e a
diferença entre detectar e bloquear, resolvida pela lista de bloqueio, que impediu
os 23 testes do Tracker Blocking.

Nos sites reais, as três ferramentas concordam no essencial. Onde divergem, o
tráfego registrado explica a diferença: visitas diferentes, navegador automatizado,
listas de classificação e bloqueio em cascata. A comparação com o Blacklight também
revelou um erro do plugin (cookies em sufixo público), corrigido na v0.7.1, e uma
limitação de autoria de listeners.

O score ordena os sites de forma estável (sp.gov.br 85, QuintoAndar 63, UOL 23) e
acrescenta ao Blacklight o que ele não mede. No UOL, a sincronização de
identificadores e os identificadores gravados por terceiros respondem por toda a
diferença entre as duas notas.

# Apêndice: onde estão as evidências

| Conteúdo | Caminho no repositório |
|-------------------------|---------------------------------------------|
| Ambiente e registro de coletas | `evidencias/ambiente.md` |
| DDG: prints, `resultados.json` da página e JSON do plugin | `evidencias/ddg/<teste>/` |
| Roteiro de execução das páginas do DDG | `evidencias/ddg/README.md` |
| Sites, 1ª coleta: HAR, prints, JSON, uBO e Blacklight | `evidencias/sites/<site>/` |
| Sites, coleta final: HAR, prints e JSON | `evidencias/sites/<site>/final/` |
| Dados brutos do Blacklight | `evidencias/sites/<site>/blacklight/raw/` |
| Coleta automatizada do sp.gov.br | `evidencias/sites/sp.gov.br/automatizado/` |
| Reconciliação por site | `evidencias/sites/<site>/reconciliacao.md` (`npm run reconcile`) |
| Score, sensibilidade e comparação | `evidencias/score.md` (`npm run score`) e `evidencias/score-analise.md` |
| Observações de cada coleta | `evidencias/sites/<site>/notas.md` |
