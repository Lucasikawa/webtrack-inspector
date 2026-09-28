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

## Achados da coleta de 27/09/2026

- **Fingerprinting depende de quem visita.** Na coleta manual o plugin não viu
  fingerprinting, mas o Blacklight (navegador automatizado) marcou "trackers
  designed to evade third-party cookie blockers", e o Firefox automatizado do
  teste de 27/09 registrou canvas, WebGL, GPU e fontes pelo script do Imperva
  (`/oporth-beyon-…`). Hipótese: a proteção anti-bot só faz o fingerprinting
  pesado quando detecta automação (`navigator.webdriver`).
- Blacklight (`blacklight/raw/inspection.json`, 23:36:48Z = 20:36 BRT, Chrome
  headless a partir de `us-ca`): visitou `/sp` e depois
  `/sp/institucional/estrutura/prefeituras-paulistas`; **a segunda página foi
  bloqueada pelo Imperva** (`html/2.html`: iframe de desafio,
  "Request unsuccessful. Incapsula incident ID …", IP do cliente `54.241.50.121`,
  AWS). Canvas fingerprinting por 3 scripts: `newassets.hcaptcha.com/.../hsw.js`
  (hCaptcha) e dois caminhos ofuscados do Imperva em `www.sp.gov.br`
  (`/oporth-beyon-…`, `/llne-But-Darkd-…`), além de fingerprinting de fontes.
  Conclusão: o fingerprinting é do desafio anti-bot, disparado para um navegador
  automatizado vindo de datacenter; não aparece para um visitante comum.
- **Coleta automatizada** (`automatizado/`, 27/09/2026 21:27, `tools/smoke_test.py`,
  Firefox 156 headless com `navigator.webdriver = true`, mesma máquina e mesmo IP da
  coleta manual): o Imperva respondeu com a página "Additional security check is
  required" e um hCaptcha (`automatizado/pagina.png`). O plugin detectou canvas
  fingerprint (96×48, 39 caracteres, 5 cores, `toDataURL`) e WebGL fingerprint
  (300×150) pelo script `newassets.hcaptcha.com/.../hsw.js`, no iframe do hCaptcha
  (`automatizado/relatorio-alertas.png`), e descartou outras 4 leituras de canvas.
  Como a coleta manual da mesma máquina e IP não recebeu desafio, o gatilho é o
  sinal de automação, não o endereço de origem.
- Blacklight: 2 ad trackers (5 requisições casando com a EasyPrivacy), 2 cookies
  de terceiros (de 6), Google Analytics com "remarketing audiences". Plugin: 4 sites de 3ª parte (2 rastreadores pelo
  Firefox: `jsdelivr.net` como `tracking_content`, `google.com`), 8 cookies,
  4 `Set-Cookie` não gravados.
- uBO: 2 bloqueios (`googletagmanager.com/gtm.js` e `gtag/js`, substituídos por
  scripts neutros `<<`); mostra o CNAME de `cdn.jsdelivr.net` →
  `cdn.jsdelivr.net.cdn.cloudflare.net`.
- Ordem da coleta: plugin + HAR dos 3 sites, depois uBO dos 3, depois Blacklight
  dos 3 (intervalo de ~45 min entre plugin e Blacklight).

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
| 27/09/2026 21:27 (automatizada) | 0.3.0 (`6498d9e`) | — | `automatizado/` (página + 4 abas) | — | — |
| 27/09/2026 19:53 | 0.3.0 (`82e536d`) | 19:53:20–19:53:28, 66 entradas | 19:55–19:58; JSON 19:55:43 | 20:36 (19:36 ET) | 20:15–20:24, uBO 1.75.0 |
