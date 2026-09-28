# uol.com.br — UOL

URL analisada: https://www.uol.com.br/

## Pré-análise (26/09/2026)

Amostra preliminar em navegador Chromium, 12 s após o carregamento, sem interagir
com o banner. Serviu só para escolher o site; **não é evidência** do relatório.

- ~38 sites de terceira parte (230 recursos carregados), entre eles:
  - Leilão de anúncios: `adnxs.com`, `pubmatic.com`, `rubiconproject.com`,
    `openxcdn.net`, `smartadserver.com`, `criteo.com`/`criteo.net`,
    `amazon-adsystem.com`, `seedtag.com`, `doubleclick.net`, `googlesyndication.com`
  - Identidade e DMPs: `id5-sync.com`, `crwdcntrl.net` (Lotame), `permutive.com`,
    `cxense.com`, `mygaru.com`
  - Medição: `chartbeat.com`, `scorecardresearch.com`, `google-analytics.com`
  - Qualidade de anúncios: `adtrafficquality.google`
  - Paywall e consentimento: `piano.io`, `tinypass.com`, `privacymanager.io`
- 38 cookies em `document.cookie`; 74 chaves no localStorage
- Pontos a investigar:
  - Sincronização de IDs entre os participantes do leilão (ID5, Lotame, Criteo):
    principal alvo da detecção de cookie sync
  - Scripts de qualidade de anúncio costumam fazer fingerprinting (canvas)
  - `jsuol.com.br` é CDN do próprio UOL, mas é terceira parte pelo eTLD+1
  - O leilão muda a cada carregamento: HAR, plugin, uBO e Blacklight precisam sair
    da mesma sessão de coleta; HAR pode ficar grande (compactar se passar de 50 MB)

## Pré-análise no Firefox (27/09/2026, plugin 0.3.0, perfil de teste automatizado)

Também não é evidência; orienta o que conferir na coleta.

- 294 requisições, 43 sites de terceira parte (35 rastreadores pelo Firefox).
- 38 cookies de 1ª parte gravados por scripts de 3ª parte.
- 51 chaves de localStorage em 2 origens com dados.
- Nenhum fingerprinting detectado em 15 s no modo headless; conferir com o
  navegador normal (scripts de anúncio podem rodar mais tarde ou depender de GPU).

## Achados da coleta de 27/09/2026

- Blacklight: **82 ad trackers e 206 cookies de terceiros**, "When you visit this
  site, it tells X", Google Analytics com remarketing; 20 empresas de ad-tech.
  Plugin (coleta de 21:04): 34 sites de 3ª parte (26 rastreadores), 42 cookies:
  27 de 1ª parte (21 gravados por scripts de 3ª parte, ex.: `_ga` por
  `googletagmanager.com`, `cto_bundle` por `static.criteo.net`, `_pubcid` e
  `panoramaId` por `tags.crwdcntrl.net`) e 15 de 3ª parte, todos particionados.
  A diferença de escala é o principal ponto de reconciliação (Chrome headless nos
  EUA, sem Total Cookie Protection, leilão diferente).
- A página não para de fazer requisições (player ao vivo do Canal UOL, novos
  leilões de anúncios, sinais periódicos de medição): o evento `load` ainda não
  tinha ocorrido 2 min após a navegação (`loadedMs: null` no JSON). Por isso a
  comparação usa a janela fixa de 30 s do HAR; 39 dos 42 cookies surgiram nela
  (`__eoi`, `__gads`, `__gpi` só aos 123 s).
- Coleta anterior (20:09) descartada: o DevTools foi aberto depois da navegação e
  o HAR começou 8 s atrasado, sem o documento principal.
- uBO: 24 bloqueios, 14 de 21 domínios conectados; desmascara vários CNAMEs de
  CDN (`conteudo.imguol.com.br`, `h.jsuol.com.br`, `player.fantascope.uol.com.br`
  → `*.cloudfront.net`).

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
| 27/09/2026 21:04 | 0.3.0 (`82e536d`) | 21:04:39–21:05:11 (gravação pausada aos 32 s), 224 entradas, 63 hosts | 21:07:20–21:07:40; JSON 21:06:43 | 20:43 (19:43 ET) | 20:28–20:32, uBO 1.75.0 |
