# Roteiro: coleta nos sites reais

Para cada site (`sp.gov.br`, `quintoandar.com.br`, `uol.com.br`), tudo na **mesma
sessão**: HAR e plugin do mesmo carregamento, uBlock Origin e Blacklight logo em
seguida. Os sites mudam a cada carregamento (principalmente o leilão de anúncios
do UOL); coletar junto é o que permite comparar.

Arquivos de cada site ficam em `evidencias/sites/<site>/`.

## 0. Preparação (uma vez)

**Perfil do plugin** (o dedicado que você já usa):
- Plugin carregado em `about:debugging` (confira a versão no rodapé do popup).
- Nenhuma outra extensão.

**Perfil do uBlock Origin** (novo):
1. `about:profiles` → **Criar um novo perfil** → nome `ublock` → Concluir.
2. Na linha do perfil `ublock`, **Abrir perfil em novo navegador**.
3. Nessa janela, instale o uBlock Origin pela loja oficial
   (addons.mozilla.org, autor Raymond Hill) e mantenha as listas padrão.
4. Anote a versão do uBO em `evidencias/ambiente.md`.

## 1. Plugin + HAR (perfil do plugin)

1. Limpe todos os dados: **Cmd + Shift + Delete** → intervalo **Tudo** → marque
   Cookies e dados de sites e Cache → Limpar. (O perfil é dedicado, não há nada a
   perder.)
2. Abra uma aba vazia e o DevTools na aba **Rede**: **Cmd + Option + E**.
   **O DevTools precisa estar aberto antes de digitar a URL**: requisições feitas
   antes de ele abrir não entram no HAR (o primeiro item do HAR tem de ser o
   documento principal do site).
3. No DevTools, marque **Desativar cache**; na engrenagem (⚙), marque **Persistir
   logs**.
4. Digite a URL do site e aguarde **30 s sem mexer na página** (não clique no
   banner de cookies: o Blacklight também não aceita).
5. Salve o HAR: clique com o botão direito em qualquer requisição → **Salvar tudo
   como HAR** → `<site>.har`.
6. Abra o popup do plugin e tire um print de cada aba, com a página ao fundo:
   `plugin-terceiros.png`, `plugin-cookies.png`, `plugin-storage.png`,
   `plugin-alertas.png`.
7. **Exportar JSON** → `plugin.json`, logo após o último print (páginas com
   anúncios continuam carregando e os números mudam em segundos).

## 2. uBlock Origin (perfil `ublock`)

1. Limpe os dados como no passo 1.1.
2. Abra a URL e aguarde 30 s sem interagir.
3. Clique no ícone do uBO: ele mostra quantas requisições foram bloqueadas.
   Clique em **Mais** (ou nos três pontos) para expandir a lista de domínios
   conectados e bloqueados → print `ublock.png`.
4. Abra o **Registro** (ícone de lista no popup do uBO), filtre pela aba do site e
   tire um print → `ublock-logger.png`. Se o logger oferecer exportação para a área
   de transferência, cole o texto em `ublock.txt`.

## 3. Blacklight

1. Abra `https://themarkup.org/blacklight`, informe a URL do site e inicie a
   análise (leva cerca de 1 minuto).
2. **Expanda as seções** (seta à direita de cada uma) que tiverem resultado:
   ad trackers, cookies de terceiros, "evade cookie blockers", gravação de sessão,
   pixels e Google Analytics, e também as empresas listadas em "ad-tech companies".
   As listas de domínios só aparecem expandidas e são o que a reconciliação usa.
3. Salve o resultado completo: **Cmd + P** → **Salvar como PDF** →
   `blacklight.pdf`.
4. Copie a URL da página de resultado para o `notas.md` do site.

## 4. Registro

No `notas.md` do site, preencha a linha da tabela **Coletas**: data e hora, versão
do plugin (rodapé do popup) e observações (ex.: banner de cookies apareceu,
página demorou, Blacklight falhou).

## Checklist por site

- [ ] `<site>.har`
- [ ] `plugin-terceiros.png`, `plugin-cookies.png`, `plugin-storage.png`, `plugin-alertas.png`
- [ ] `plugin.json`
- [ ] `ublock.png`, `ublock-logger.png` (e `ublock.txt`, se exportou)
- [ ] `blacklight.pdf`
- [ ] linha preenchida em `notas.md`
