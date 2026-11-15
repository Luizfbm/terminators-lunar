import fitz, re
d = fitz.open("s43247-025-02305-1.pdf")
print("paginas:", d.page_count)
txt = "\n".join(p.get_text() for p in d)
open("nature_cee_2025.txt", "w", encoding="utf-8").write(txt)
print("chars:", len(txt))
for m in re.finditer(r"Table\s+[1-4]", txt):
    i = m.start()
    print("---", txt[i:i+90].replace("\n", " "))
print("\n=== trechos com waypoint ===")
for m in list(re.finditer(r"[Ww]aypoint", txt))[:6]:
    i = m.start()
    print("...", txt[max(0,i-140):i+160].replace("\n", " "), "\n")
