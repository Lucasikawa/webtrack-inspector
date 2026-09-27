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

## Pré-análise no Firefox (27/09/2026, plugin 0.3.0, perfil de teste automatizado)

Também não é evidência; orienta o que conferir na coleta.

- `www.sp.gov.br` é o próprio site: `sp.gov.br` é sufixo público na Public Suffix
  List, então cada subdomínio do governo paulista é um site separado.
- 67 requisições, 6 sites de terceira parte (4 rastreadores pelo Firefox).
- **Fingerprinting de 1ª parte**: canvas 2D (600×160, 28 caracteres, 2 cores), WebGL,
  consulta a `UNMASKED_VENDOR/RENDERER_WEBGL` e enumeração de fontes, todos por um
  script de caminho ofuscado no próprio domínio (`/oporth-beyon-a-dispot-…`).
  Cookies `reese84` e `___utmvc` e o recurso `_Incapsula_Resource` indicam o
  **Imperva (Incapsula)**, proteção anti-bot: fingerprinting para segurança, não
  para publicidade. Ponto central para o score e para a comparação com o Blacklight.
- `_ga` e `_ga_G3W3M6971H`: cookies de 1ª parte gravados por
  `googletagmanager.com/gtag/js`.
- 4 `Set-Cookie` não gravados pelo Firefox.

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
