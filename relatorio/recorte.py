#!/usr/bin/env python3
"""Recorta o popup do plugin (canto superior direito) de cada print de tela
cheia do DuckDuckGo, para o detalhe ao lado do print no relatório."""
import sys
from pathlib import Path
from PIL import Image

EV = Path(__file__).resolve().parent.parent / 'evidencias'
OUT = Path(__file__).resolve().parent / 'img'

# Frações (x0, y0, x1, y1) da área do popup. Os prints do Tracker Reporting
# são de uma janela menor, com o popup mais à esquerda.
JANELA_MENOR = (0.69, 0.08, 0.985, 0.92)
TELA_CHEIA = (0.79, 0.04, 0.985, 0.62)

for origem, nome in (linha.split() for linha in sys.stdin if linha.strip()):
    src = EV / origem
    dst = OUT / f'{nome}-popup.jpg'
    if dst.exists() and dst.stat().st_mtime > max(src.stat().st_mtime, Path(__file__).stat().st_mtime):
        continue
    im = Image.open(src).convert('RGB')
    w, h = im.size
    x0, y0, x1, y1 = JANELA_MENOR if w < 4000 else TELA_CHEIA
    im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))).save(dst, quality=75)
