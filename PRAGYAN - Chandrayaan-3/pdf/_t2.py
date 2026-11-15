import fitz, re, json
d = fitz.open("s43247-025-02305-1.pdf")
blocos = []
for pno in range(d.page_count):
    t = d[pno].get_text()
    if "Table 2" in t:
        blocos.append((pno, t))
        print(">>> Table 2 aparece na pagina", pno + 1)
        i = t.find("Table 2 |")
        if i == -1:
            i = t.find("Table 2")
        out = t[i:i+3000]
        open("table2_raw.txt", "w", encoding="utf-8").write(out)
        print("bloco salvo,", len(out), "chars")
print("paginas com Table 2:", [b[0] + 1 for b in blocos])
