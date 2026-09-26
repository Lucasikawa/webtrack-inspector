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

Fluxo:
1. Clicar em **Store data**.
2. Recarregar a página (o plugin inicia um relatório novo).
3. Clicar em **Retrieve data**, aguardar e clicar em **Download the result**
   (salvar como `resultados.json`).
4. Prints das abas **Cookies** e **Storage**; exportar o JSON do plugin.

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

## Tabela do relatório

Modelo para `relatorio/`. Uma linha por subteste.

| Teste | Esperado (página) | Plugin | Divergência e explicação técnica | Print |
|---|---|---|---|---|
| | | | | `evidencias/ddg/<teste>/plugin.png` |
