# Evidências

Arquivos HAR, prints e resultados usados no relatório. **Sem HAR e sem prints do
plugin em execução, os entregáveis 2 e 3 não pontuam**: confira o checklist antes
da entrega.

## Estrutura

```
evidencias/
  ambiente.md                         versão do Firefox, modo do ETP, perfis, datas
  ddg/<teste>/
    plugin.png                        print da página de teste + popup do plugin
    resultados.json                   "Download results" da própria página (esperado)
    plugin-*.json                     "Exportar JSON" do popup
  sites/<site>/
    <site>.har                        DevTools → Rede → "Salvar tudo como HAR"
    plugin-<aba>.png                  um print por aba do popup
    plugin-*.json                     "Exportar JSON" do popup
    blacklight.png | blacklight.pdf   resultado do Blacklight (mesmo dia)
    ublock.png | ublock.txt           popup e logger do uBlock Origin
    notas.md                          horário da coleta e observações
```

Roteiro de cada página do DuckDuckGo em [`ddg/README.md`](ddg/README.md).

Nomes de `<teste>`: `tracker-reporting`, `request-blocking`, `storage-blocking`,
`storage-partitioning`, `fingerprinting`, `bounce-tracking`, `query-parameters`,
`js-leaks`.

## Protocolo de coleta (sites reais)

1. Perfil dedicado só com o plugin; limpar dados do site.
2. DevTools → Rede: marcar **Persistir logs** e **Desativar cache**.
3. Carregar a URL e aguardar 30 s **sem interagir com o banner de cookies**.
4. Salvar o HAR, os prints do popup e o JSON do plugin **do mesmo carregamento**.
5. Perfil separado só com o uBlock Origin: mesma URL, print do popup e do logger.
6. Rodar o Blacklight no mesmo dia e salvar o resultado.

## Checklist

| Item | C | B | A | Feito |
|---|---|---|---|---|
| DDG Tracker Reporting | ✔ | ✔ | ✔ | ☐ |
| DDG Storage blocking | ✔ | ✔ | ✔ | ☐ |
| DDG Fingerprinting / canvas | ✔ | ✔ | ✔ | ☐ |
| DDG Tracker Blocking (request-blocking) | | ✔ | ✔ | ☐ |
| DDG Storage partitioning | | ✔ | ✔ | ☐ |
| DDG Bounce tracking | | ✔ | ✔ | ☐ |
| DDG Query parameters | | ✔ | ✔ | ☐ |
| DDG js-leaks | | | ✔ | ☐ |
| sp.gov.br: HAR + prints + Blacklight + uBO | ✔ | ✔ | ✔ | ☐ |
| quintoandar.com.br: HAR + prints + Blacklight + uBO | ✔ | ✔ | ✔ | ☐ |
| uol.com.br: HAR + prints + Blacklight + uBO | ✔ | ✔ | ✔ | ☐ |
