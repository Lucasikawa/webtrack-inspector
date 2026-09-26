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
| B | Canvas fingerprint | ⏳ |
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
7. O popup tem as abas **Terceiros**, **Cookies** e **Storage**; o botão
   **Exportar JSON** salva o relatório da página (usado nas evidências).

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

A pasta `extension/` é carregada diretamente, sem build. As bibliotecas usadas em
tempo de execução ficam versionadas em `extension/lib/`.

## Arquitetura

```
extension/
  manifest.json            Manifest V2 (background persistente e webRequest)
  background/
    parties.js             eTLD+1 via Public Suffix List (tldts)
    cookies.js             interpretação de Set-Cookie e da API de cookies
    tab-report.js          relatório de uma página: hosts, cookies, storage
    background.js          estado por aba e listeners (webRequest, webNavigation, cookies)
  content/
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
"injetados no carregamento" os cookies vistos até 10 s após o evento `load`. Um
`Set-Cookie` sem gravação correspondente na API indica cookie bloqueado ou
rejeitado pelo navegador.

**Armazenamento HTML5.** Um content script roda em todos os frames (inclusive
iframes de terceiros) e, após o `load` e de novo em 3 s e 10 s, envia os nomes das
chaves e os tamanhos de localStorage e sessionStorage, os bancos IndexedDB
(`indexedDB.databases()`) e os caches da Cache API. Valores não são lidos. Um
`SecurityError` indica armazenamento bloqueado para aquela origem.

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
| `downloads` | salvar o relatório exportado em JSON |

Nenhum dado sai do navegador: tudo fica em memória e só é gravado em disco quando
o usuário exporta o relatório.
