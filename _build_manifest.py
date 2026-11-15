import json, os, hashlib
from pypdf import PdfReader

ROOT = r"C:\NASA PROJETO 2026"

META = {
    "artigos/2018_Glaser_illumination-poles-PSS162.pdf": dict(
        tipo="artigo", acesso="aberto", ref="Gläser et al. 2018, PSS 162, 170-178",
        doi="10.1016/j.pss.2017.07.006",
        origem="https://ntrs.nasa.gov/api/citations/20170007365/downloads/20170007365.pdf",
        papel="METODO PRIMARIO. DTM 20 m/px, simulacao 1 h de 2017 a 2037, iluminacao na superficie e a 2 m."),
    "artigos/2019_Flahaut_ROI-lunar-south-pole-PSS180.pdf": dict(
        tipo="artigo", acesso="aberto", ref="Flahaut et al. 2019, PSS 180, 104750",
        doi="10.1016/j.pss.2019.104750",
        origem="https://eprints.bbk.ac.uk/id/eprint/29463/1/29463.pdf",
        papel="CRITERIOS DE DECISAO (LEAG). 12 elipses de pouso; exige iluminacao e visibilidade da Terra maximas."),
    "artigos/2024_Pena-Asensio_ArtemisIII-MCDM-ActaAstronautica.pdf": dict(
        tipo="artigo", acesso="aberto", ref="Peña-Asensio et al. 2024, Acta Astronautica 226, 469-478",
        doi="10.1016/j.actaastro.2024.10.049",
        origem="https://arxiv.org/pdf/2406.19863",
        papel="RANKING MCDM/TOPSIS. 1247 pontos, 13 regioes; melhor = DM2 Nobile Rim 2."),
    "artigos/2023_Zhang_illumination-south-pole-multitemporal-RS.pdf": dict(
        tipo="artigo", acesso="aberto", ref="Zhang et al. 2023, Remote Sensing 15, 5691",
        doi="10.3390/rs15245691",
        origem="https://mdpi-res.com/d_attachment/remotesensing/remotesensing-15-05691/article_deploy/remotesensing-15-05691.pdf",
        papel="VALIDACAO por imagem orbital 0,69-1,97 m/px (area Chang'E-7)."),
    "artigos/2026_Miao_illumination-constrained-Astar-path-planning-RS.pdf": dict(
        tipo="artigo", acesso="aberto", ref="Miao & Wei 2026, Remote Sensing 18, 310",
        doi="10.3390/rs18020310",
        origem="https://mdpi-res.com/d_attachment/remotesensing/remotesensing-18-00310/article_deploy/remotesensing-18-00310.pdf",
        papel="TRAJETO com restricao de iluminacao. DEM 5 m/px, 1300x1300 m, visibilidade horaria."),
    "artigos/2022_LunaNet_interoperability-specification-draft.pdf": dict(
        tipo="norma", acesso="aberto", ref="NASA/TP-20210021073 Rev.2 (mar/2022), Draft LunaNet Interoperability Specification",
        doi=None,
        origem="https://ntrs.nasa.gov/api/citations/20220004317/downloads/NASA%20TP%2020210021073%20Rev.2%20Draft%20LunaNet%20Interop%20Spec%20V002%20Published.pdf",
        papel="CONTEXTO DE COMUNICACAO. Servicos de comunicacao/navegacao e DTE; justifica relay."),
    "artigos/2023_Leone_Sverdrup-Henson-iScience_fulltext.xml": dict(
        tipo="artigo-fulltext-xml", acesso="aberto (PDF bloqueado)", ref="Leone et al. 2023, iScience 26, 107853",
        doi="10.1016/j.isci.2023.107853",
        origem="https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10518707/fullTextXML",
        papel="COMPARACAO multi-criterio de base (Sverdrup-Henson vs de Gerlache vs Shackleton)."),
    "artigos/2017_MoonTrek_interactive-web-portal-NTRS.pdf": dict(
        tipo="resumo-conferencia", acesso="aberto", ref="Moon Trek (2017), NASA NTRS 20170008884",
        doi=None, origem="https://ntrs.nasa.gov/api/citations/20170008884/downloads/20170008884.pdf",
        papel="PRECEDENTE de ferramenta publica; referencia de UX a NAO repetir."),
    "artigos/2018_SolarSystemTreks_online-portals-NTRS.pdf": dict(
        tipo="poster", acesso="aberto", ref="Solar System Treks (2017), NASA NTRS 20180000384",
        doi=None, origem="https://ntrs.nasa.gov/api/citations/20180000384/downloads/20180000384.pdf",
        papel="Contexto da familia de portais de mapeamento da NASA."),
    "artigos/2016_LRO_future-exploration-south-pole-NTRS.pdf": dict(
        tipo="resumo", acesso="aberto", ref="Future Exploration of the South Pole as Enabled by LRO (2016), NASA NTRS 20160012274",
        doi=None, origem="https://ntrs.nasa.gov/api/citations/20160012274/downloads/20160012274.pdf",
        papel="Panorama dos instrumentos LRO (LOLA, LROC, Diviner, LAMP)."),
    "referencias-visual/southpole_earth_sun.1858_print.jpg": dict(
        tipo="imagem", acesso="aberto", ref="NASA SVS 5228, still (Ernie Wright, 2024)",
        doi=None, origem="https://svs.gsfc.nasa.gov/vis/a000000/a005200/a005228/southpole_earth_sun.1858_print.jpg",
        papel="REFERENCIA VISUAL: Sol rasante girando no horizonte, Terra oscilando perto de 0 graus de longitude."),
    "referencias-visual/svs5228_api.json": dict(
        tipo="metadados", acesso="aberto", ref="NASA SVS 5228 API",
        doi=None, origem="https://svs.gsfc.nasa.gov/api/5228",
        papel="Descricao oficial do fenomeno e creditos; base para baixar midia adicional."),
    "LEIA-ME.md": dict(tipo="doc", acesso="n/a", ref="indice do acervo", doi=None, origem=None,
        papel="Mapa da pasta e status de downloads."),
    "BIBLIOGRAFIA.md": dict(tipo="doc", acesso="n/a", ref="bibliografia comentada (15 refs)", doi=None, origem=None,
        papel="Metadados verificados, resumos e status de acesso."),
    "SINTESE-TECNICA.md": dict(tipo="doc", acesso="n/a", ref="sintese de engenharia", doi=None, origem=None,
        papel="Algoritmo, dados, numeros-ancora, arquitetura, validacao, armadilhas."),
    "dados/README.md": dict(tipo="doc", acesso="n/a", ref="fontes de dados brutos", doi=None, origem=None,
        papel="Links verificados para DEM LOLA/SLDEM2015 e kernels SPICE."),
    "LOG.md": dict(tipo="doc", acesso="n/a", ref="log de trabalho", doi=None, origem=None,
        papel="Historico das sessoes com falhas e contornos."),
    "CONTEXTO-AGENTE.md": dict(tipo="doc", acesso="n/a", ref="briefing de transferencia para outro agente", doi=None, origem=None,
        papel="PONTO DE ENTRADA para qualquer agente novo: o que foi pesquisado, o que existe, o que falta, revisao do plano paralelo."),
    "_build_manifest.py": dict(tipo="script", acesso="n/a", ref="gerador do MANIFEST.json", doi=None, origem=None,
        papel="Recalcula bytes, SHA-256 e paginas. Rodar ao adicionar arquivos."),
    "plano_projeto_polo_sul_lunar.md": dict(tipo="doc", acesso="n/a", ref="plano de projeto (autor: outra sessao, 22/10 23:27)", doi=None, origem=None,
        papel="Plano funcional/metodologico com uso do curso Marcato. Ver revisao tecnica no CONTEXTO-AGENTE.md."),
    "sitios_pouso_candidatos.json": dict(tipo="dado", acesso="n/a", ref="5 sitios candidatos (autor: outra sessao, 22/10 23:27)", doi=None, origem=None,
        papel="Lista inicial de sitios. Ver pendencias no CONTEXTO-AGENTE.md."),
}

out = []
for rel, meta in META.items():
    p = os.path.join(ROOT, rel.replace("/", os.sep))
    if not os.path.exists(p):
        out.append(dict(path=rel, status="AUSENTE", **meta)); continue
    raw = open(p, "rb").read()
    entry = dict(path=rel, status="presente", bytes=len(raw),
                 sha256=hashlib.sha256(raw).hexdigest(), **meta)
    if rel.endswith(".pdf"):
        try:
            entry["paginas"] = len(PdfReader(p).pages)
        except Exception as e:
            entry["paginas"] = None
            entry["erro_pdf"] = str(e)
    out.append(entry)

manifest = dict(
    projeto="NASA PROJETO 2026 — polo sul lunar (iluminacao e DTE)",
    gerado_em="2026-10-22",
    gerado_por="sessao OpenClaw (agente principal, modelo deepseek/deepseek-v4-flash)",
    contagem=dict(arquivos=len(out), presentes=sum(1 for e in out if e["status"] == "presente")),
    arquivos=out,
)

# --- complementa o manifesto com qualquer arquivo do projeto fora do META ---
known = {e["path"] for e in out}
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in ("Curso_Metodos_Otimizacao_Marcato", "__pycache__")]
    for fn in filenames:
        if fn == "MANIFEST.json":
            continue
        rel = os.path.relpath(os.path.join(dirpath, fn), ROOT).replace(os.sep, "/")
        if rel in known:
            continue
        p = os.path.join(dirpath, fn)
        raw = open(p, "rb").read()
        e = dict(path=rel, status="presente", bytes=len(raw),
                 sha256=hashlib.sha256(raw).hexdigest(),
                 tipo="anexo", acesso="n/a", ref="—", doi=None, origem=None,
                 papel="arquivo de dados/artefato gerado")
        if rel.endswith(".pdf"):
            try:
                e["paginas"] = len(PdfReader(p).pages)
            except Exception:
                pass
        out.append(e)

manifest["contagem"] = dict(arquivos=len(out),
                            presentes=sum(1 for e in out if e["status"] == "presente"))
with open(os.path.join(ROOT, "MANIFEST.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print("ok", manifest["contagem"])
