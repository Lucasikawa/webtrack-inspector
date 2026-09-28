# Bounce tracking — notas da coleta (27/09/2026, plugin 0.4.1)

| Destino | Bounce detectado | Vindo de | Permanência no intermediário | Repassado na URL |
|---|---|---|---|---|
| `good.third-party.site` | não (mesmo site do rastreador, `third-party.site`) | — | — | — |
| `www.first-party.site` | sim, por script, via `third-party.site` | `first-party.site` (JSON, 22:08) / `privacy-test-pages.site` (print, 22:24) | 36 ms (JSON) / 41 ms (print), sem interação | `bounceUIDlocalStorage=60`, `bounceUIDcookie=60` (= cookie `bounceUID`) |
| `privacy-test-pages.site` | sim, por script, via `third-party.site` | `first-party.site` | 63 ms, sem interação | idem |
| `www.publisher-company.site` | sim, por script, via `third-party.site` | `privacy-test-pages.site` | 93 ms, sem interação | idem |

"Vindo de" é o site da página onde o link foi clicado. As páginas de destino são
cópias da página de teste, com os mesmos 4 links, em outros domínios
(`www.first-party.site/privacy-protections/bounce-tracking/?…`); nas duas primeiras
coletas o clique partiu de uma delas. O teste automatizado
(`tools/smoke_test.py ddg-bounce`) confirma que, partindo de
`privacy-test-pages.site`, o plugin mostra "vindo de privacy-test-pages.site".

O UID já existia (`isNew` vazio): foi gerado numa passagem anterior e reconhecido
pelo cabeçalho `Cookie` enviado a `bad.third-party.site`.

O print `first-party.png` foi refeito às 22:24 (o anterior tinha uma notificação do
sistema sobreposta), partindo da página de teste em `privacy-test-pages.site`; o
`first-party.json` é da visita das 22:08. As duas visitas mostram o mesmo bounce e o
mesmo UID repassado.
