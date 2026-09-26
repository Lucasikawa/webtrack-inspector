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

## Coletas

| Data e hora | Versão do plugin (commit) | HAR | Prints | Blacklight | uBO |
|---|---|---|---|---|---|
