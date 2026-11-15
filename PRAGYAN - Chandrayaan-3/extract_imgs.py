import fitz, os

src = os.path.join('pdf', 'lpsc2025_1025.pdf')
d = fitz.open(src)
os.makedirs('img', exist_ok=True)

for i, p in enumerate(d):
    imgs = p.get_images(full=True)
    print('pagina', i + 1, '-> imagens embutidas:', len(imgs))
    for j, im in enumerate(imgs):
        xref = im[0]
        info = d.extract_image(xref)
        ext = info['ext']
        fn = os.path.join('img', 'p%d_%d.%s' % (i + 1, j + 1, ext))
        with open(fn, 'wb') as fh:
            fh.write(info['image'])
        print('   ', fn, info['width'], 'x', info['height'],
              round(len(info['image']) / 1024), 'KB')
