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
| B | Sincronismo de cookies e bounce tracking | ⏳ |
| A | Indicadores de sequestro de navegador (hijacking/hook) | ⏳ |
| A | Pontuação de privacidade com metodologia explícita | ⏳ |
| A | Lista de bloqueio personalizada | ⏳ |
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
7. O popup tem as abas **Terceiros**, **Cookies**, **Storage** e **Alertas**
   (fingerprinting); o botão **Exportar JSON** salva o relatório da página (usado
   nas evidências) e **Abrir em aba** mostra o mesmo relatório numa aba, em
   tamanho de página.

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
    tab-report.js          relatório de uma página: hosts, cookies, storage, fingerprinting
    background.js          estado por aba e listeners (webRequest, webNavigation, cookies)
  content/
    hooks.js               instrumentação no contexto da página (document_start)
    storage.js             retrato do armazenamento HTML5 de cada frame
  popup/                   interface exibida ao clicar no ícone
  lib/                     bibliotecas de terceiros (tldts, MIT)
tests/                     testes unitários da lógica de classificação
evidencias/                HARs e prints dos testes (ver evidencias/README.md)
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
| `webRequest`, `<all_urls>` | observar requisições, cabeçalhos `Set-Cookie` e erros de rede |
| `webNavigation` | início, confirmação e `load` de cada navegação |
| `tabs` | aba ativa no popup e mensagens aos content scripts |
| `cookies` | cookies gravados de fato, inclusive particionados e de JavaScript |
| content scripts em `<all_urls>` | retrato do storage e instrumentação de canvas, cookies e storage |
| `downloads` | salvar o relatório exportado em JSON |

Nenhum dado sai do navegador: tudo fica em memória e só é gravado em disco quando
o usuário exporta o relatório.
