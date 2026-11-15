import pdfplumber, json
pdf = pdfplumber.open("s43247-025-02305-1.pdf")
todas = []
for pno in (1, 2, 4, 5):
    p = pdf.pages[pno]
    tabs = p.extract_tables()
    print("=== pagina", pno + 1, "|", len(tabs), "tabelas")
    for ti, t in enumerate(tabs):
        print("  tabela", ti, "linhas:", len(t), "colunas:", len(t[0]) if t else 0)
        for r in t[:3]:
            print("    ", r)
        todas.append({"pagina": pno + 1, "idx": ti, "rows": t})
json.dump(todas, open("table2_struct.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\ntotal tabelas capturadas:", len(todas))
