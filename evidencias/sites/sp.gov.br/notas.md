# sp.gov.br — Governo do Estado de São Paulo

URL analisada: https://www.sp.gov.br/ (redireciona para https://www.sp.gov.br/sp)

## Pré-análise (26/09/2026)

Amostra preliminar em navegador Chromium, 10 s após o carregamento, sem interagir
com o banner. Serviu só para escolher o site; **não é evidência** do relatório.

- 5 sites de terceira parte: `googletagmanager.com`, `google.com` (`analytics.google.com`),
  `doubleclick.net` (`stats.g.doubleclick.net`), `google.com.br`, `vlibras.gov.br`
- 3 cookies em `document.cookie`; 2 chaves no localStorage; 0 no sessionStorage
- Pontos a investigar:
  - `stats.g.doubleclick.net` indica Google Analytics com recursos de publicidade
    (teste "Google Analytics remarketing" do Blacklight)
  - VLibras (widget de acessibilidade do governo federal) é terceira parte pelo
    eTLD+1, mas não é rastreador: bom exemplo de falso positivo de "terceiro"
  - Redirecionamento `/` → `/sp` aparece na cadeia do main_frame

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
