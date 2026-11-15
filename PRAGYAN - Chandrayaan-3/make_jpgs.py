import os
from PIL import Image
pares = [
    ("img/crops/fig1_full.png", "fig1_mapas_comparados.jpg", 1500, 82),
    ("img/crops/fig2_west.png", "fig2_west_crater.jpg", 1200, 82),
    ("img/crops/fig3_south.png", "fig3_south_crater.jpg", 1200, 82),
    ("pages/isro_p3.png", "fig4_23pontos_apxs.jpg", 1100, 84),
]
for src, dst, w, q in pares:
    im = Image.open(src).convert("RGB")
    if im.width > w:
        im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    im.save(dst, quality=q, optimize=True)
    print(dst, im.size, round(os.path.getsize(dst)/1024), "KB")
