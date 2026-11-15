import json
d = json.load(open("table2_struct.json", encoding="utf-8"))
for t in d:
    if t["pagina"] in (5, 6):
        print("========== pagina", t["pagina"], "==========")
        for r in t["rows"]:
            print(" | ".join("" if c is None else c.replace("\n", " ") for c in r))
