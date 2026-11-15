from PIL import Image
import os

src = os.path.join('img', 'p2_1.jpeg')
im = Image.open(src)
W, H = im.size
print('pagina 2:', W, 'x', H)

os.makedirs('img/crops', exist_ok=True)

# Fig.1 ocupa a metade superior; Fig.2 canto inferior esquerdo; Fig.3 canto inferior direito
regioes = {
    'fig1_full': (0, 0, W, int(H * 0.56)),
    'fig1_centro': (int(W * 0.10), int(H * 0.10), int(W * 0.78), int(H * 0.50)),
    'fig2_west': (0, int(H * 0.52), int(W * 0.50), H),
    'fig3_south': (int(W * 0.48), int(H * 0.52), W, H),
}

for nome, box in regioes.items():
    c = im.crop(box)
    # upscale 2x para leitura de rotulos
    c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    fn = os.path.join('img', 'crops', nome + '.png')
    c2.save(fn)
    print(nome, box, '->', c2.size)
