# Detector de Rastreadores

Extensão para Firefox que detecta e apresenta, por página, rastreamento e violações
de privacidade no cliente web: conexões a terceiros, cookies, armazenamento HTML5,
sincronização de cookies e bounce tracking, canvas fingerprinting, indícios de
sequestro do navegador e uma pontuação de privacidade. Também bloqueia domínios de
uma lista definida pelo usuário.

Projeto da Avaliação Intermediária de Cibersegurança do Insper. A extensão foi
validada nas DuckDuckGo Privacy Test Pages e em três sites reais (sp.gov.br,
quintoandar.com.br e uol.com.br), com comparação ao Blacklight (The Markup) e ao
uBlock Origin.

## Relatório

Os resultados estão em [relatorio/relatorio.pdf](relatorio/relatorio.pdf). As
evidências (HARs, prints e relatórios exportados pela extensão) estão em
[evidencias/](evidencias/).

## Instalação

Requer Firefox 140 ou superior.

1. Clone o repositório.
2. No Firefox, abra `about:debugging` e escolha **Este Firefox**.
3. Clique em **Carregar extensão temporária** e selecione `extension/manifest.json`.
4. Abra uma página e clique no ícone da extensão para ver o relatório.
