import fitz, os
d = fitz.open(r"pdf\s43247-025-02305-1.pdf")
os.makedirs("img/nature", exist_ok=True)
for i, p in enumerate(d):
    t = p.get_text()
    if "Fig. 2" in t or "OHRC" in t:
        imgs = p.get_images(full=True)
        print("pagina", i+1, "imagens:", len(imgs), "| tem Fig. 2:", "Fig. 2" in t)
        for j, im in enumerate(imgs):
            info = d.extract_image(im[0])
            fn = "img/nature/p%d_%d.%s" % (i+1, j+1, info["ext"])
            open(fn, "wb").write(info["image"])
            print("   ", fn, info["width"], "x", info["height"], round(len(info["image"])/1024), "KB")
