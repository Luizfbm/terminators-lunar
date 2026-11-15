# -*- coding: utf-8 -*-
"""Reescreve a pagina do canvas embutindo as figuras em base64 (autocontida)."""
import base64
import io
import os
from PIL import Image

SRC = r'C:\Users\NOVO OFFLINE\.openclaw\workspace\projects\pragyan'
OUT = r'C:\Users\NOVO OFFLINE\.openclaw\canvas\pragyan'

figs = [
    ('img/crops/fig1_full.png', 'FIG1', 1300, 78),
    ('img/crops/fig2_west.png', 'FIG2', 1100, 78),
    ('img/crops/fig3_south.png', 'FIG3', 1100, 78),
    ('pages/isro_p3.png', 'FIG4', 1000, 80),
]

data = {}
for rel, key, maxw, q in figs:
    im = Image.open(os.path.join(SRC, rel)).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=q, optimize=True)
    b = buf.getvalue()
    data[key] = 'data:image/jpeg;base64,' + base64.b64encode(b).decode('ascii')
    print(key, im.size, round(len(b) / 1024), 'KB')

with open(os.path.join(SRC, 'canvas_template.html'), encoding='utf-8') as f:
    html = f.read()

for k, v in data.items():
    html = html.replace('__%s__' % k, v)

with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)

# limpa os pngs soltos (nao sao servidos pelo canvas)
for n in ('fig1.png', 'fig2.png', 'fig3.png', 'isro_p3.png'):
    p = os.path.join(OUT, n)
    if os.path.exists(p):
        os.remove(p)

print('OK index.html', round(os.path.getsize(os.path.join(OUT, 'index.html')) / 1024 / 1024, 2), 'MB')
