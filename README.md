# Detector de Rastreadores (extensão para Firefox)

Extensão para Firefox que detecta e apresenta, por página, rastreamento e violações
de privacidade no cliente web. Projeto da Avaliação Intermediária de Cibersegurança (Insper).

## Funcionalidades

| Conceito | Funcionalidade | Situação |
|---|---|---|
| C | Conexões a domínios de terceira parte (por site eTLD+1 e por host) | ✅ |
| C | Classificação de rastreadores pelas listas do Firefox (`urlClassification`) | ✅ |
| C | Contagem de cookies injetados no carregamento (HTTP e JavaScript) | ✅ |
| C | Armazenamento HTML5 (localStorage, sessionStorage, IndexedDB, Cache API) | ✅ |
| C | Requisições canceladas pela proteção do próprio Firefox | ✅ |
| B | Cookies de primeira × terceira parte, sessão × persistentes | ✅ |
| B | Canvas fingerprint (heurística de Englehardt & Narayanan), WebGL, consulta à GPU e enumeração de fontes | ✅ |
| B | Script responsável por cada cookie (`document.cookie`) e chave de storage (`setItem`) | ✅ |
| B | Sincronismo de cookies (IDs de um site na URL de outro) e bounce tracking (HTTP e por script) | ✅ |
| B | Parâmetros de rastreamento na URL (`utm_*`, `fbclid`, `gclid`…) | ✅ |
| B | Categorias dos testes do Blacklight (gravação de sessão, pixels, GA com remarketing) | ✅ |
| A | Indicadores de sequestro de navegador (hijacking/hook): conexões persistentes, polling, funções nativas substituídas, captura de teclado, assinaturas do BeEF | ✅ |
| A | Pontuação de privacidade com metodologia explícita (aba Score e nota no cabeçalho do popup) | ✅ |
| A | Lista de bloqueio personalizada (aba Bloqueio e botão Bloquear por site) | ✅ |
| — | Exportação do relatório da página em JSON | ✅ |

## Instalação no Firefox (via about:debugging)

Requer Firefox 140 ou superior.

1. Clone o repositório:
   ```bash
   git clone <url-do-repositorio>
   ```
2. No Firefox, abra `about:debugging#/runtime/this-firefox`
   (ou `about:debugging` → **Este Firefox**).
3. Clique em **Carregar extensão temporária…**.
4. Selecione o arquivo `extension/manifest.json` deste repositório.
5. O ícone do escudo aparece na barra de ferramentas (se não aparecer, fixe-o pelo
   botão de extensões, ícone de peça de quebra-cabeça).
6. Abra ou recarregue uma página e clique no ícone para ver o relatório.
   O número no ícone é a quantidade de sites de terceira parte contatados.
7. O popup tem as abas **Terceiros**, **Cookies**, **Storage**, **Alertas**
   (fingerprinting, sincronização, bounce, categorias do Blacklight, sequestro do
   navegador), **Bloqueio** (lista de bloqueio) e **Score**; a nota da página
   aparece também no cabeçalho. O botão **Exportar JSON** salva o relatório da
   página (usado nas evidências) e **Abrir em aba** mostra o mesmo relatório numa
   aba, em tamanho de página.

Extensões temporárias são removidas quando o Firefox é fechado; repita os passos 2–4
a cada nova sessão. Para ver os erros do background, use o botão **Inspecionar**
ao lado da extensão em `about:debugging`.

## Desenvolvimento

```bash
npm install      # instala tldts e web-ext
npm test         # testes unitários (node --test)
npm run lint     # valida a extensão com o web-ext lint
npm start        # abre um Firefox temporário com a extensão carregada
npm run vendor   # atualiza extension/lib/ a partir de node_modules
```

### Teste de integração num Firefox real

`tools/smoke_test.py` abre uma instância separada do Firefox (headless, perfil
temporário), carrega a extensão e verifica os resultados esperados nas páginas de
teste do DuckDuckGo (rastreadores, autoria de cookies, storage de iframes,
canvas/WebGL/fontes). Também coleta evidências automatizadas de uma URL.

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/smoke_test.py ddg
.venv/bin/python tools/smoke_test.py --out evidencias/sites/sp.gov.br/automatizado https://www.sp.gov.br/
```

O Firefox automatizado tem `navigator.webdriver = true`: sites com proteção
anti-bot o tratam como robô (como fazem com o Blacklight).

### Reconciliação com o Blacklight e o uBlock Origin

`tools/reconcile.js` cruza, para cada site, o JSON do plugin, o nosso HAR, o log do
uBlock Origin e os dados brutos do Blacklight (relatório e HAR da visita dele), e
gera `evidencias/sites/<site>/reconciliacao.md`: uma linha por site rastreador com
o que cada ferramenta viu, as requisições em cada HAR e a causa provável de cada
divergência, além das categorias do Blacklight, dos CNAMEs desmascarados pelo uBO
e do fingerprinting.

```bash
npm run reconcile
```

### Score dos sites e comparação com o Blacklight

`tools/score.js` aplica a metodologia do score (a mesma do popup) ao JSON de cada
site (coleta final em `final/plugin.json`, se existir) e gera `evidencias/score.md`:
nota e descontos por critério, análise de sensibilidade (cada peso a 0,7× e 1,3×,
verificando se a ordem dos sites muda) e comparação com o Blacklight, teste a
teste e com a mesma régua aplicada ao que o Blacklight observou.

```bash
npm run score
```

### Relatório em PDF

`relatorio/relatorio.md` é o texto do relatório (entregáveis 2, 3 e 4).
`relatorio/build.sh` reduz os prints de `evidencias/`, recorta o popup de cada
print do DuckDuckGo, converte o texto com o pandoc e imprime o PDF no Chrome sem
interface. Requer pandoc, Python com Pillow e Google Chrome.

```bash
relatorio/build.sh
```

A pasta `extension/` é carregada diretamente, sem build. As bibliotecas usadas em
tempo de execução ficam versionadas em `extension/lib/`.

## Arquitetura

```
extension/
  manifest.json            Manifest V2 (background persistente e webRequest)
  background/
    parties.js             eTLD+1 via Public Suffix List (tldts)
    cookies.js             interpretação de Set-Cookie e da API de cookies
    fingerprint.js         heurísticas de canvas/WebGL fingerprinting
    tracking.js            identificadores, cookie sync, parâmetros de rastreamento
    categories.js          categorias dos testes do Blacklight
    blocklist.js           lista de bloqueio personalizada
    score.js               pontuação de privacidade da página
    tab-report.js          relatório de uma página: hosts, cookies, storage, fingerprinting
    background.js          estado por aba e listeners (webRequest, webNavigation, cookies)
  content/
    hooks.js               instrumentação no contexto da página (document_start)
    storage.js             retrato do armazenamento HTML5 de cada frame
  popup/                   interface exibida ao clicar no ícone
  lib/                     bibliotecas de terceiros (tldts, MIT)
tests/                     testes unitários (node --test)
tools/
  smoke_test.py            teste de integração em Firefox real e coleta automatizada
  reconcile.js             reconciliação com Blacklight e uBlock Origin
  score.js                 score dos sites, sensibilidade e comparação com o Blacklight
evidencias/                HARs e prints dos testes (ver evidencias/README.md)
relatorio/                 relatório em PDF (texto, estilo e script de geração)
```

**Por que Manifest V2.** O Firefox continua suportando o MV2, que oferece background
persistente (o estado por aba fica em memória) e `webRequest` bloqueante, usado mais
adiante pela lista de bloqueio personalizada.

**Primeira × terceira parte.** Uma requisição é de terceira parte quando o site
(eTLD+1, domínio registrável segundo a Public Suffix List, incluindo a seção privada)
do host requisitado difere do site da página de topo. Ex.: em `www.uol.com.br`,
`conteudo.jsuol.com.br` é terceira parte (site `jsuol.com.br`), mesmo pertencendo à
mesma empresa. O cálculo do próprio Firefox (`details.thirdParty`) é guardado
junto, para comparação.

**Rastreadores.** Um site é marcado como rastreador quando o Firefox classifica
alguma requisição dele com uma flag de rastreamento, fingerprinting ou
criptomineração em `details.urlClassification` (listas da Proteção Aprimorada
contra Rastreamento, baseadas no Disconnect).

**Cookies.** Dois caminhos, mesclados pela chave nome|domínio|path:
- cabeçalhos `Set-Cookie` das respostas (`webRequest.onHeadersReceived`), atribuídos
  à aba pela própria requisição. O Firefox junta vários `Set-Cookie` num único
  cabeçalho separado por `\n`;
- a API `cookies.onChanged`, que mostra o que o navegador de fato gravou, inclusive
  cookies de `document.cookie`. Cookies de terceiros ficam particionados pela Total
  Cookie Protection, e a `partitionKey` diz a que site de topo pertencem; os demais
  são atribuídos às páginas do mesmo site ou que contataram o site do cookie nos
  últimos 30 s.

Primeira × terceira parte compara o eTLD+1 do domínio do cookie com o da página.
Um `Set-Cookie` com `Domain` num sufixo público (ex.: `Domain=.sp.gov.br`) é
descartado, como faz o navegador (RFC 6265, seção 5.3), salvo se o domínio for o
próprio host.
Sessão × persistente segue a presença de `Expires`/`Max-Age`. Contam como
"injetados no carregamento" os cookies vistos nos **primeiros 30 s** da navegação,
a mesma janela usada para gravar o HAR no protocolo de evidências. O evento `load`
não serve de limite: em portais com vídeo ao vivo e anúncios que se renovam ele
pode não ocorrer em minutos (no UOL, não tinha ocorrido 2 min após a navegação). Um
`Set-Cookie` sem gravação correspondente na API indica cookie bloqueado ou
rejeitado pelo navegador.

**Armazenamento HTML5.** Um content script roda em todos os frames (inclusive
iframes de terceiros) e, após o `load` e de novo em 3 s e 10 s, envia os nomes das
chaves e os tamanhos de localStorage e sessionStorage, os bancos IndexedDB
(`indexedDB.databases()`) e os caches da Cache API. Valores não são lidos. Um
`SecurityError` indica armazenamento bloqueado para aquela origem.

**Instrumentação no contexto da página.** `content/hooks.js` roda em
`document_start`, antes de qualquer script da página, em todos os frames. Com as
APIs de content script do Firefox (`window.wrappedJSObject` e `exportFunction`), ele
substitui métodos dos protótipos da página por wrappers que registram a chamada e
repassam para a função original. Nenhum `<script>` é injetado, então a CSP da
página não interfere. O script responsável por cada chamada vem da pilha
(`new Error().stack`), ignorando os frames da extensão.

Instrumentado: `HTMLCanvasElement.getContext/toDataURL/toBlob/addEventListener`,
`CanvasRenderingContext2D` e `OffscreenCanvasRenderingContext2D`
(`fillText`, `strokeText`, `save`, `restore`, `drawImage`, `getImageData`,
`measureText`), `OffscreenCanvas.getContext/transferToImageBitmap/convertToBlob`,
`WebGLRenderingContext`/`WebGL2RenderingContext` (`readPixels`, `getParameter`),
o setter de `document.cookie` e `Storage.setItem`.

**Canvas fingerprint.** Heurística de Englehardt & Narayanan, *Online Tracking: A
1-million-site Measurement and Analysis* (ACM CCS 2016, seção 6.1), a mesma do
OpenWPM e do Blacklight. Uma leitura de canvas é fingerprinting quando:
1. o canvas tem pelo menos 16 × 16 px;
2. o texto desenhado tem pelo menos 10 caracteres distintos ou 2 cores;
3. o script não usa `save`/`restore` nem listeners de eventos no canvas;
4. a imagem é extraída com `toDataURL`/`toBlob`, ou com `getImageData` de uma
   área de pelo menos 16 × 16 px.

`drawImage` de outro canvas (ou de um `ImageBitmap` de um `OffscreenCanvas`)
transfere o texto observado para o canvas de destino. Critérios próprios,
complementares: leitura de um canvas WebGL de pelo menos 16 × 16 px; consulta a
`UNMASKED_VENDOR_WEBGL`/`UNMASKED_RENDERER_WEBGL` (fabricante e modelo reais da
GPU); enumeração de fontes, com o critério da seção 6.3 do mesmo artigo (o mesmo
texto medido pelo menos 50 vezes em pelo menos 50 fontes).

**Cookie sync.** Método de Acar et al., *The Web Never Forgets* (ACM CCS 2014), e
de Englehardt & Narayanan (2016). Valores de cookies (`Set-Cookie`, cabeçalho
`Cookie`, `document.cookie`) e de `localStorage`/`sessionStorage` (`setItem`) são
divididos em trechos; um trecho com pelo menos 8 caracteres, com dígitos e que não
seja um timestamp é candidato a identificador, guardado com o site dono. Se ele
aparece na URL (caminho ou query, decodificados) de uma requisição a outro site, o
receptor passou a conhecer o ID do dono: **sincronização entre terceiros** quando
o dono é um terceiro, **ID de 1ª parte enviado a terceiro** quando é o próprio site
(ex.: `_pubcid`, `cto_bundle`). Caminhos típicos de sincronização (`/getuid`,
`/usersync`, `/match`, pixel `google_nid`…) ficam registrados como indício. Os
valores ficam só na memória; o JSON exportado traz apenas o ID repassado.

**Bounce tracking.** Duas formas: (1) redirecionamento HTTP por um site
intermediário na cadeia do `main_frame`, diferente da origem e do destino; (2)
página de outro site que ficou até 10 s **sem interação** do usuário (clique,
toque ou tecla, observados pelos hooks) e mandou a aba para um terceiro site, numa
navegação que não foi digitada, favorito, recarga nem voltar. O plugin mostra os
identificadores do intermediário e quais aparecem na URL de destino.

**Parâmetros de rastreamento.** `utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_eid` e
outros nas URLs de navegação (incluindo redirecionamentos).

**Categorias do Blacklight.** Regras por URL para gravação de sessão (Hotjar,
Clarity, FullStory…), pixels do Facebook, TikTok e X, Google Analytics com
remarketing (hit espelhado para `stats.g.doubleclick.net` ou
`google.*/ads/ga-audiences`) e LinkedIn Insight, para comparar com os testes do
Blacklight categoria a categoria.

**Sequestro de navegador (hijacking/hook).** Indícios, não prova:
- **conexão persistente com terceiro**: WebSocket (`webRequest` tipo `websocket`,
  mais o hook de `WebSocket.send` para saber se a página enviou mensagens) ou
  EventSource (cabeçalho `Accept: text/event-stream`);
- **polling**: o mesmo endpoint de terceiro (host + caminho) chamado pelo menos 5
  vezes, ao longo de 10 s ou mais, em intervalos regulares (coeficiente de
  variação até 0,35) entre 250 ms e 60 s, que é como um hook busca comandos;
- **funções nativas substituídas**: `fetch`, `XMLHttpRequest` (`open`, `send`,
  `setRequestHeader`), `WebSocket`, `EventSource`, `sendBeacon`,
  `addEventListener`, `document.write`, `createElement`, `document.cookie`,
  `appendChild`, `insertBefore`, `setAttribute`, `form.submit`, `input.value`,
  `history.pushState/replaceState`, `eval`, `Function`, `setTimeout`,
  `setInterval`, `open`, `postMessage`, `JSON.parse/stringify`,
  `Function.prototype.toString`, `Object.defineProperty`, `Storage.getItem`. A
  referência de cada uma é capturada em `document_start`, antes de qualquer script
  da página; 5 e 15 s após o `load`, uma referência diferente indica substituição
  (a comparação por identidade pega também `Proxy` e `toString` falsificado);
- **globais novas** no `window`, comparadas com o retrato de `document_start`;
- **captura de teclado**: listeners de `keydown`, `keyup`, `keypress`, `input`,
  `beforeinput`, `change` ou `paste` registrados por scripts de terceiros;
- **assinaturas conhecidas do BeEF**: script `hook.js`, global `beef`/`BeefJS` e
  cookie `BEEFHOOK`.

A instrumentação do plugin fica nos protótipos (via `exportFunction`) e não
aparece para uma verificação do escopo global: a página js-leaks do DDG dá o mesmo
resultado com e sem o plugin (`evidencias/ddg/js-leaks/automatizado/`).

**Lista de bloqueio.** Domínios (e subdomínios) cujas requisições de terceira
parte são canceladas pelo `webRequest` bloqueante. A navegação principal e os
recursos do próprio site nunca são bloqueados. Requisições sem aba (fetch de
Service Worker) são bloqueadas quando quem as disparou é de outro site. A lista
fica em `storage.local`.

**Pontuação de privacidade.** De 0 a 100 (maior é melhor): parte de 100 e desconta
pontos em 7 critérios. Cada critério tem teto, e os tetos somam 100, para que um
critério sozinho não domine a nota (um portal com 80 rastreadores não zera a nota
só por isso).

| Critério | Teto | Pontos por ocorrência | Teste do Blacklight |
|---|---|---|---|
| Rastreadores de terceira parte | 20 | 2 por site classificado como rastreador pelas listas do Firefox | Ad trackers |
| Cookies de terceira parte | 15 | 1 por cookie; 2 se a validade passa de 1 ano | Third-party cookies |
| Identificadores guardados por terceiros | 10 | 1 por cookie ou chave de storage de 1ª parte gravado por script de 3ª parte; 1 por origem de 3ª parte com storage | — |
| Fingerprinting | 15 | canvas, WebGL ou fontes: 15 por script de 3ª parte, 8 de 1ª; só consulta à GPU: 4 (3ª) ou 2 (1ª) | Canvas fingerprinting |
| Sincronização de IDs e bounce tracking | 15 | 3 por par de sincronização entre terceiros; 1 por ID de 1ª parte enviado a terceiro; 5 por bounce | — |
| Vigilância comportamental | 15 | gravação de sessão: 10; cada pixel (Facebook, TikTok, X, LinkedIn): 3; GA com remarketing: 3; cada site de 3ª parte com script ouvindo teclado: 3 | Session recording, key logging, pixels, GA remarketing |
| Sequestro do navegador | 10 | assinatura de hook conhecida: 10; WebSocket/EventSource para terceiro: 4; polling de terceiro: 2; funções nativas substituídas: 2 | — |

Faixas: A ≥ 85, B ≥ 70, C ≥ 50, D ≥ 30, F < 30.

Critérios de pesos:
- o que o usuário não consegue apagar nem bloquear com controles de cookies
  (fingerprinting, sincronização de IDs, bounce, sequestro) desconta mais por
  ocorrência do que cookies e storage, que ele apaga;
- presença em listas de rastreamento desconta; a simples presença de terceiros
  (CDN, fontes) não, porque sozinha não indica rastreamento;
- indícios descontam menos que evidências: ouvir o teclado é condição para key
  logging, não prova dele (o Blacklight só marca key logging quando o texto
  digitado sai na rede), então vale 3 por site e não 10 como a gravação de sessão;
- os critérios espelham os testes do Blacklight para permitir a comparação, e
  acrescentam o que o plugin mede além dele (sincronização, bounce, storage
  gravado por terceiros, sequestro).

O score mede o **comportamento do site**, não a proteção do navegador: cookies de
terceiros contam mesmo quando o Firefox os particiona, porque o mesmo site, num
navegador sem essa proteção, rastrearia com eles. Só entra o que foi observado nos
primeiros 30 s da navegação (a janela do HAR). A análise de sensibilidade
(`tools/score.js`) multiplica o peso de cada critério por 0,7 e 1,3 e verifica se a
ordem dos sites muda.

**Autoria de cookies e storage.** O primeiro script que grava cada cookie via
`document.cookie` e cada chave via `setItem` aparece no popup. Um cookie de
primeira parte gravado por script de terceiro (ex.: `_ga`, gravado por
`googletagmanager.com`) é marcado.

**Limitações da instrumentação.**
- Workers não recebem content scripts: canvas em `OffscreenCanvas` dentro de um
  Web Worker não é observado.
- Um iframe `about:blank` recém-criado pode ser usado antes de a instrumentação
  chegar a ele.
- SDKs de terceiros empacotados no JavaScript do próprio site aparecem como
  script de primeira parte (a pilha mostra a URL do arquivo, não a origem do
  código).
- Escritas diretas em propriedades (`localStorage.chave = valor`) não passam por
  `setItem` e não têm autor identificado.

**Atribuição de requisições à página.** Uma navegação começa na requisição
`main_frame` (acompanhando redirecionamentos) e só passa a ser a página exibida
quando é confirmada (`webNavigation.onCommitted`) ou quando chega o primeiro
subrecurso do novo documento. Assim, requisições tardias da página anterior não
contaminam o relatório da nova.

## Permissões

| Permissão | Uso |
|---|---|
| `webRequest`, `<all_urls>` | observar requisições, cabeçalhos `Cookie`/`Set-Cookie` e erros de rede |
| `webRequestBlocking` | cancelar requisições da lista de bloqueio |
| `storage` | guardar a lista de bloqueio |
| `webNavigation` | início, confirmação e `load` de cada navegação |
| `tabs` | aba ativa no popup e mensagens aos content scripts |
| `cookies` | cookies gravados de fato, inclusive particionados e de JavaScript |
| content scripts em `<all_urls>` | retrato do storage e instrumentação de canvas, cookies e storage |
| `downloads` | salvar o relatório exportado em JSON |

Nenhum dado sai do navegador: tudo fica em memória e só é gravado em disco quando
o usuário exporta o relatório.
