# Plano de execução

Plano para cumprir todos os conceitos (C, B e A) da Avaliação Intermediária de
Cibersegurança: extensão Firefox para detecção e bloqueio de rastreadores.

## Entregáveis (obrigatórios para qualquer conceito)

1. Repositório Git com histórico de commits incrementais + extensão instalável
   (manifest.json + instruções via about:debugging).
2. Relatório nas DuckDuckGo Privacy Test Pages: teste × esperado × plugin ×
   explicação de cada divergência, com print do plugin em cada linha.
3. Análise de 3 sites reais (sorteados por matrícula): HAR + comparação com o
   Blacklight e com o uBlock Origin.
4. Pontuação de privacidade aplicada aos 3 sites, com metodologia e comparação
   com o Blacklight.

Formato: link do repositório; relatório em PDF (entregáveis 2, 3 e 4); HARs e
prints em `evidencias/`.

## 1. Matriz de rastreabilidade

| Conceito | Requisito | Implementação | Evidência |
|---|---|---|---|
| C | Instala e roda sem erro | Manifest + `web-ext lint` limpo + README | Print do about:debugging e do console |
| C | Domínios de terceira parte | `webRequest.onBeforeRequest` + eTLD+1 (`tldts`) + `details.thirdParty` | Aba "Terceiros" |
| C | Contagem de cookies | `Set-Cookie` no `onHeadersReceived` + `cookies.onChanged` | Aba "Cookies" |
| C | Armazenamento HTML5 | Content script em todos os frames: localStorage, sessionStorage, `indexedDB.databases()` | Aba "Storage" |
| C | DDG: Tracker Reporting, Storage blocking, Fingerprinting | Seção 5 | Tabela + prints |
| C | HAR dos 3 sites | DevTools → "Salvar tudo como HAR" | `evidencias/sites/*/` |
| B | Cookies 1ª × 3ª parte, sessão × persistente | eTLD+1 do domínio do cookie × o da aba; `Expires`/`Max-Age` | Aba "Cookies" |
| B | Canvas fingerprint | Hooks em `toDataURL`/`toBlob`/`getImageData` + heurística de Englehardt & Narayanan | Alerta no popup |
| B | Bounce tracking e cookie sync | Cadeia de redirects + identificadores em parâmetros de URL | Aba "Sync/Bounce" |
| B | DDG: Tracker Blocking, Storage partitioning, Bounce, Query params | Explicação técnica de cada divergência | Tabela |
| B | Reconciliação Blacklight/uBO | `tools/reconcile.py` (HAR × plugin × uBO) | Uma tabela por site |
| A | Hijacking/hook | WebSocket de 3ª parte, polling, diff de globais, keylogger; página `js-leaks` | Aba "Segurança" |
| A | Score + comparação crítica com o Blacklight | Seção 4 | Relatório |
| A | Interface por página + lista de bloqueio | Popup com abas + `onBeforeRequest` `{cancel: true}` | Prints |

## 2. Decisões técnicas

- **Manifest V2**: background persistente (estado por aba em memória) e `webRequest`
  bloqueante; o Firefox continua suportando.
- **`details.urlClassification`**: classificação de rastreadores pelas listas do ETP
  do Firefox, complementada pela lista do Disconnect e pelos domínios de teste do
  DDG (`bad.third-party.site`, `broken.third-party.site`).
- **Vários `Set-Cookie`** chegam num único cabeçalho separados por `\n` no Firefox.
- **Total Cookie Protection**: cookies de 3ª parte ficam particionados;
  `cookies.getAll()` só os retorna com `partitionKey: {}`.
- **Hooks no contexto da página**: `window.wrappedJSObject` + `exportFunction` em
  content script `document_start`, sem injetar `<script>` (não esbarra na CSP).
- **`indexedDB.databases()`** disponível no Firefox ≥ 126.

## 3. Algoritmos de detecção

- **Cookies injetados no carregamento**: janela da requisição `main_frame` até
  `load` + 10 s; deduplicação por (nome, domínio, path, partitionKey); destacar
  persistentes com validade > 1 ano.
- **Storage**: chaves e tamanho por origem, inclusive iframes de 3ª parte; hook em
  `setItem` com stack trace para atribuir o script.
- **Canvas fingerprint** (Englehardt & Narayanan, 2016; mesma heurística do OpenWPM e
  do Blacklight): canvas ≥ 16×16 px; texto com ≥ 10 caracteres distintos ou ≥ 2 cores;
  leitura por `toDataURL`/`getImageData` em formato sem perdas; script atribuído
  pelo stack trace.
- **Cookie sync**: valores com cara de identificador (≥ 8 caracteres, não timestamp)
  de cookies e URLs que aparecem em requisições para outro eTLD+1.
- **Bounce tracking**: cadeia `onBeforeRedirect` + `webNavigation.onCommitted`
  (`server_redirect`/`client_redirect`); domínio intermediário diferente da origem e
  do destino que grava dados ou repassa um UID.
- **Query params**: `utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_eid` etc.; remoção
  opcional com redirect no `onBeforeRequest`.
- **Hijacking/hook**: WebSocket/EventSource para terceiros; polling (≥ 5 requisições
  ao mesmo endpoint de 3ª parte após o `load`, intervalos regulares, CV < 0,3); diff
  de globais entre `document_start` e `load` + 5 s (globais novas, funções nativas
  sobrescritas); assinaturas (`hook.js`, global `beef`, cookie `BEEFHOOK`); listeners
  de teclado registrados por scripts de 3ª parte. Testes: página `js-leaks` do DDG e
  página local (`localhost:8000` ↔ `127.0.0.1:8001`).

## 4. Pontuação de privacidade

Começa em 100 e subtrai penalidades, com teto por categoria.

| Critério | Penalidade máx. | Regra | Justificativa |
|---|---|---|---|
| Domínios de terceira parte | 10 | 0,5 por domínio | Sinal fraco sozinho |
| Rastreadores conhecidos | 20 | 2 por rastreador | Blacklight: ad trackers |
| Cookies de terceira parte | 15 | 1,5 cada (2 se persistente > 1 ano) | Blacklight: third-party cookies |
| Storage HTML5 de terceiros | 10 | 2 por origem | Persistência fora dos cookies |
| Canvas fingerprint | 15 | 15 se 3ª parte, 8 se 1ª parte | Sem estado, contorna controles de cookies |
| Cookie sync / bounce | 15 | 5 por evento | Liga identidades entre sites |
| Hijacking, keylogging, gravação de sessão | 15 | 5 por indicador | Blacklight: key logging, session recording |

Faixas: A ≥ 85, B 70–84, C 50–69, D 30–49, F < 30. Análise de sensibilidade:
variar os pesos em ±30% e verificar se a ordem dos 3 sites muda. Comparação linha a
linha com os 7 testes do Blacklight.

## 5. Protocolo de evidências

Ver [`evidencias/README.md`](evidencias/README.md). Pontos principais:

- Perfis separados: um só com o plugin, outro só com o uBO.
- HAR e saída do plugin do **mesmo carregamento**; uBO e Blacklight no mesmo dia.
- DDG: rodar com `?run`, guardar o JSON "Download results" como resultado esperado,
  print com página e popup juntos. Rodar o Tracker Blocking duas vezes (só detecção
  e com `bad.third-party.site` na lista de bloqueio).
- Toda explicação de divergência cita uma entrada específica do HAR (URL, status,
  `Set-Cookie`) ou o subteste da página.

## 6. Cronograma

| Dia | Data | Foco |
|---|---|---|
| 1 | 26/09 | Repositório, README, manifest, estado por aba, domínios de terceira parte, popup |
| 2 | 27/09 | Cookies (todas as categorias) + storage HTML5; DDG Tracker Reporting e Storage blocking |
| 3 | 28/09 | Canvas fingerprint + classificação; DDG Fingerprinting; primeira captura dos 3 sites (tag `v0.1-C`) |
| 4 | 29/09 | Bounce, cookie sync, query params; páginas DDG do B; `har_summary.py` (tag `v0.2-B`) |
| 5 | 30/09 | Hijacking/hook + página local + js-leaks; lista de bloqueio; abas; exportação JSON |
| 6 | 01/10 | Score no plugin; captura final dos 3 sites; reconciliação (tag `v1.0-A`) |
| 7 | 02/10 | Relatório em PDF, comparação com o Blacklight, checklist final |

Commits pequenos por funcionalidade (`feat:`, `fix:`, `docs:`, `test:`,
`evidence:`), push diário, evidências versionadas conforme coletadas.

### Progresso

| Dia | Realizado em | Entregue |
|---|---|---|
| 1 | 26/09 | Repositório público, manifest MV2, estado por aba, domínios de terceira parte, popup |
| 2 | 26/09 | Cookies (HTTP/JS, 1ª/3ª parte, sessão/persistente, particionados), storage HTML5, bloqueios do Firefox, abas, exportação JSON; evidências DDG Tracker Reporting e Storage blocking |
| 3 | 27/09 | Canvas/WebGL fingerprint, enumeração de fontes, autoria de cookies e storage (hooks em `document_start`), aba Alertas; evidências DDG Fingerprinting e primeira coleta dos 3 sites (HAR, plugin, uBO 1.75.0, Blacklight com dados brutos) → tag `v0.1-C` |
| 4 | 27/09 | Teste de integração em Firefox real (`tools/smoke_test.py`, 17 verificações nas páginas do DDG) e coleta automatizada do sp.gov.br (desafio anti-bot); janela fixa de 30 s; cookie sync, bounce tracking, parâmetros de rastreamento; categorias do Blacklight; reconciliação automática (`tools/reconcile.js`); roteiro das páginas DDG do B. Evidências DDG de Tracker Blocking, Storage partitioning, Bounce e Query parameters → tag `v0.2-B` |
| 5 | 27/09 | Indícios de hijacking/hook (WebSocket/EventSource para terceiros, polling, funções nativas substituídas, globais novas, captura de teclado, assinaturas do BeEF); lista de bloqueio personalizada; js-leaks com e sem o plugin (pegada zero); 25 verificações automatizadas no DDG; evidências de js-leaks e de Tracker Blocking com bloqueio |

Achados da coleta que entram no relatório: fingerprinting anti-bot (Imperva/hCaptcha)
no sp.gov.br visto só por navegadores automatizados; rastreamento servido por
subdomínio próprio no QuintoAndar; no UOL, leilão de anúncios diferente por região
(Blacklight na Califórnia) explica a maior parte das divergências.

## 7. Pontos de atenção

| Risco | Mitigação |
|---|---|
| Commit único ou histórico concentrado no último dia | Push diário, um commit por bloco funcional, tags por conceito |
| Falta de HAR ou prints (entregáveis 2 e 3 não pontuam) | Checklist em `evidencias/README.md`, nomes padronizados |
| Explicações genéricas | Citar a entrada do HAR ou o subteste em toda divergência |
| Sites mudam entre carregamentos | Capturar tudo na mesma sessão e anotar o horário |
| HAR grande ou com dados sensíveis | Perfil limpo, sem login; compactar se passar de 50 MB |
| Proteções do Firefox distorcem os testes do DDG | Registrar o modo do ETP; separar divergências do navegador das do plugin |

## Sites reais

Escolha livre (autorizada pelo professor), cobrindo níveis crescentes de rastreamento
para que o score discrimine e o plugin seja exercitado em todas as detecções.

| Site | URL | Perfil | Por que foi escolhido |
|---|---|---|---|
| sp.gov.br | https://www.sp.gov.br/ | Pouco rastreamento | Linha de base; ainda assim envia dados ao Google com recurso de publicidade (`stats.g.doubleclick.net`) |
| quintoandar.com.br | https://www.quintoandar.com.br/ | Médio/alto | Gravação de sessão (Hotjar), cookie sync (`gum.criteo.com`), rastreamento em subdomínio próprio (`tracking.quintoandar.com.br`) |
| uol.com.br | https://www.uol.com.br/ | Alto | Publicidade programática (leilão de anúncios), sincronização de IDs (ID5, Lotame), muitos cookies e muito localStorage |

A pré-análise de cada site está em `evidencias/sites/<site>/notas.md`.

## Pendências

- [x] Escolher os 3 sites reais.
- [ ] Confirmar a data de entrega.
