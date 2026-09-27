# Ambiente de teste

Preencher antes da primeira coleta e atualizar se algo mudar.

| Item | Valor |
|---|---|
| Sistema operacional | macOS (Darwin 25.5.0) |
| Versão do Firefox (`about:support`) | 156.0.1 |
| Proteção Aprimorada contra Rastreamento (Padrão/Rigoroso/Personalizado) | Padrão (Standard) |
| Perfil de medição (`about:profiles`) | perfil dedicado, só com o plugin |
| Perfil do uBlock Origin | só o uBO, listas padrão |
| Versão do uBlock Origin | |
| Versão do plugin (commit) | 0.2.0 (`0387de9`) e 0.2.1 (`c384d1a`), ver registro |
| Rede / localização aproximada | VPN desligada |

No modo Padrão, o Firefox bloqueia rastreadores de redes sociais, cookies de
rastreamento entre sites, criptomineradores e fingerprinters conhecidos, e isola os
demais cookies de terceiros por site de topo (Total Cookie Protection). Conteúdo de
rastreamento em geral só é bloqueado em janelas privativas. Isso explica parte das
divergências nos testes (ex.: cookie `fr` do `facebook.com` não gravado; cookies de
iframes de terceiros particionados).

## Registro de coletas

| Data e hora | Alvo | Versão do plugin | Observações |
|---|---|---|---|
| 26/09/2026 21:19–21:52 | DDG Tracker Reporting (5 páginas) | 0.2.0 | Prints e JSON de cada página |
| 26/09/2026 21:36–21:58 | DDG Storage blocking (Store, Retrieve) | 0.2.0 | `store-storage.png`, `retrieve-storage.png`, `resultados.json` |
| 26/09/2026 22:42 | DDG Storage blocking (Store) | 0.2.1 | `store-cookies.png`, `plugin-store.json` (matriz corrigida) |
