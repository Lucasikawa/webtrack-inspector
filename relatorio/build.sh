#!/bin/sh
# Gera relatorio/relatorio.pdf a partir de relatorio/relatorio.md.
# Requer pandoc, Python com Pillow e Google Chrome (impressão em PDF headless).
# Os prints entram no PDF como cópias em JPEG reduzidas (relatorio/img/); os
# originais ficam em evidencias/.
set -e
cd "$(dirname "$0")"
EV=../evidencias
mkdir -p img
POPUPS=""

img() { # origem destino [altura largura offsetY offsetX]
  [ img/"$2".jpg -nt "$EV/$1" ] && [ img/"$2".jpg -nt "$0" ] && return
  if [ -n "$3" ]; then
    sips -c "$3" "$4" --cropOffset "$5" "$6" "$EV/$1" --out img/"$2".png >/dev/null
    sips -s format jpeg -s formatOptions 70 -Z 2200 img/"$2".png --out img/"$2".jpg >/dev/null
    rm img/"$2".png
  else
    sips -s format jpeg -s formatOptions 70 -Z 2200 "$EV/$1" --out img/"$2".jpg >/dev/null
  fi
}

ddg() { # print de tela cheia do DDG: reduzido e com o detalhe do popup
  img "$1" "$2"
  POPUPS="$POPUPS$1 $2
"
}

for t in 1major-via-script 1major-with-surrogate 1major-via-img 1major-via-fetch document-fragment; do
  ddg ddg/tracker-reporting/$t.png ddg-tr-$t
done
ddg ddg/storage-blocking/store-cookies.png ddg-sb-store-cookies
ddg ddg/storage-blocking/store-storage.png ddg-sb-store-storage
ddg ddg/storage-blocking/retrieve-storage.png ddg-sb-retrieve-storage
ddg ddg/fingerprinting/alertas.png ddg-fp-alertas
ddg ddg/request-blocking/terceiros.png ddg-rb-terceiros
ddg ddg/request-blocking/terceiros-bloqueio.png ddg-rb-terceiros-bloqueio
ddg ddg/request-blocking/bloqueio.png ddg-rb-bloqueio
ddg ddg/storage-partitioning/storage.png ddg-sp-storage
ddg ddg/storage-partitioning/cookies.png ddg-sp-cookies
for t in first-party privacy-test-pages publisher-company good-third-party; do
  ddg ddg/bounce-tracking/$t.png ddg-bt-$t
done
for t in utm-source utm-source-medium fbclid sem-rastreamento; do
  ddg ddg/query-parameters/$t.png ddg-qp-$t
done
ddg ddg/js-leaks/alertas.png ddg-jl-alertas
printf '%s' "$POPUPS" | python3 recorte.py

img sites/sp.gov.br/final/plugin-score-aba-inteira.png sp-score 2034 2000 0 1560
img sites/sp.gov.br/final/plugin-alertas-aba-inteira.png sp-alertas 2298 2000 0 1560
img sites/sp.gov.br/blacklight.png sp-blacklight
img sites/sp.gov.br/ublock.png sp-ublock
img sites/quintoandar.com.br/final/plugin-score-tela-inteira.png qa-score
img sites/quintoandar.com.br/final/plugin-alertas-tela-inteira.png qa-alertas
img sites/quintoandar.com.br/blacklight.png qa-blacklight
img sites/quintoandar.com.br/ublock.png qa-ublock
img sites/uol.com.br/final/plugin-score-aba-inteira.png uol-score
for n in 1 2 3; do img sites/uol.com.br/final/plugin-alertas-aba-inteira-$n.png uol-alertas-$n; done
img sites/uol.com.br/blacklight.png uol-blacklight
img sites/uol.com.br/ublock.png uol-ublock

pandoc relatorio.md --standalone --from markdown+pipe_tables+implicit_figures \
  --metadata lang=pt-BR --css estilo.css -o relatorio.html

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
  --print-to-pdf="$PWD/relatorio.pdf" "file://$PWD/relatorio.html" 2>/dev/null
ls -lh relatorio.pdf
