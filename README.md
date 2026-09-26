# Detector de Rastreadores (extensão para Firefox)

Extensão para Firefox que detecta e apresenta, por página, rastreamento e violações
de privacidade no cliente web. Projeto da Avaliação Intermediária de Cibersegurança (Insper).

## Funcionalidades

| Conceito | Funcionalidade | Situação |
|---|---|---|
| C | Conexões a domínios de terceira parte (por site eTLD+1 e por host) | ✅ |
| C | Classificação de rastreadores pelas listas do Firefox (`urlClassification`) | ✅ |
| C | Contagem de cookies injetados no carregamento | ⏳ |
| C | Armazenamento HTML5 (localStorage, sessionStorage, IndexedDB) | ⏳ |
| B | Cookies de primeira × terceira parte, sessão × persistentes | ⏳ |
| B | Canvas fingerprint | ⏳ |
| B | Sincronismo de cookies e bounce tracking | ⏳ |
| A | Indicadores de sequestro de navegador (hijacking/hook) | ⏳ |
| A | Pontuação de privacidade com metodologia explícita | ⏳ |
| A | Lista de bloqueio personalizada | ⏳ |

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
    tab-report.js          relatório de uma página: hosts, sites, classificação
    background.js          estado por aba e listeners de webRequest/webNavigation
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

**Atribuição de requisições à página.** Uma navegação começa na requisição
`main_frame` (acompanhando redirecionamentos) e só passa a ser a página exibida
quando é confirmada (`webNavigation.onCommitted`) ou quando chega o primeiro
subrecurso do novo documento. Assim, requisições tardias da página anterior não
contaminam o relatório da nova.
