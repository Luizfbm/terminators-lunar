"""Converte docs/Relatorio_Consolidado_Tese_2026.md em Word (.docx) com regras tipograficas e de tabelas/figuras."""

from copy import deepcopy
import os
import re
import subprocess
import tempfile
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DOCS_DIR = os.path.join(ROOT, 'docs')
MD_PATH = os.path.join(DOCS_DIR, 'Relatorio_Consolidado_Tese_2026.md')
OUT_DOCX = os.path.join(DOCS_DIR, 'Relatorio_Consolidado_Tese_2026.docx')
PANDOC = r'C:\Users\NOVO OFFLINE\AppData\Local\PandocPortable\pandoc-3.11\pandoc.exe'


def preprocess_markdown(md_text):
    return re.sub(
        r'^>\s*\[!NOTE\]\s*\r?\n',
        '> **NOTA METODOLÓGICA**\n>\n',
        md_text,
        flags=re.MULTILINE,
    )


def set_cell_shading(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def set_cell_valign(cell, val='center'):
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn('w:vAlign')):
        tcPr.remove(old)
    v = OxmlElement('w:vAlign')
    v.set(qn('w:val'), val)
    tcPr.append(v)


def set_cell_margins(cell, top=55, bottom=55, left=75, right=75):
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn('w:tcMar')):
        tcPr.remove(old)
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)


def set_table_borders_uas_profile(table):
    """Bordas externas solidas e internas pontilhadas (perfil adaptado do projeto UAS)."""
    tblPr = table._tbl.tblPr
    for old in tblPr.findall(qn('w:tblBorders')):
        tblPr.remove(old)
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="596168"/>'
        f'<w:left w:val="single" w:sz="4" w:space="0" w:color="596168"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="596168"/>'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="596168"/>'
        f'<w:insideH w:val="dotted" w:sz="4" w:space="0" w:color="BBC1C5"/>'
        f'<w:insideV w:val="dotted" w:sz="4" w:space="0" w:color="BBC1C5"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)


def set_header_bottom_border(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    for old in tcPr.findall(qn('w:tcBorders')):
        tcPr.remove(old)
    tcPr.append(parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="0F4761"/>'
        f'</w:tcBorders>'
    ))


def add_page_number(run):
    fldChar1 = parse_xml(r'<w:fldChar %s w:fldCharType="begin"/>' % nsdecls('w'))
    instrText = parse_xml(r'<w:instrText %s xml:space="preserve"> PAGE </w:instrText>' % nsdecls('w'))
    fldChar2 = parse_xml(r'<w:fldChar %s w:fldCharType="separate"/>' % nsdecls('w'))
    fldChar3 = parse_xml(r'<w:fldChar %s w:fldCharType="end"/>' % nsdecls('w'))
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)
    run._r.append(fldChar3)


def apply_run_font(paragraph, font_name, size_pt=None, bold=None, italic=None, color_rgb=None):
    for run in paragraph.runs:
        run.font.name = font_name
        if size_pt is not None:
            run.font.size = Pt(size_pt)
        if bold is not None:
            run.font.bold = bold
        if italic is not None:
            run.font.italic = italic
        if color_rgb is not None:
            run.font.color.rgb = color_rgb


def _is_numeric_like(txt):
    s = txt.strip()
    if not s or s in ('—', '-'):
        return True
    if re.search(r'\d', s) and len(s) <= 28:
        return True
    return False


def insert_landscape_sections_for_wide_tables(doc, min_cols=8):
    """Envolve tabelas largas (>= 8 cols) em secao paisagem A4, retornando a retrato depois."""
    body = doc._element.body
    base_sect = body.find(qn('w:sectPr'))
    if base_sect is None:
        return 0

    portrait_sect = deepcopy(base_sect)
    landscape_sect = deepcopy(base_sect)
    pgSz = landscape_sect.find(qn('w:pgSz'))
    if pgSz is not None:
        w, h = pgSz.get(qn('w:w')), pgSz.get(qn('w:h'))
        pgSz.set(qn('w:w'), h)
        pgSz.set(qn('w:h'), w)
        pgSz.set(qn('w:orient'), 'landscape')

    count = 0
    for tbl in list(doc.tables):
        if len(tbl.columns) < min_cols:
            continue
        tbl_el = tbl._tbl
        parent = tbl_el.getparent()
        if parent is None:
            continue
        idx = list(parent).index(tbl_el)

        # Se paragrafos anteriores forem legenda curta ou titulo da tabela, inicia paisagem antes deles
        while idx > 0 and parent[idx - 1].tag == qn('w:p'):
            prev_txt = ''.join(t.text or '' for t in parent[idx - 1].findall('.//w:t', {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'})).strip()
            if prev_txt.startswith(('Cada linha', 'Mesmas ', 'Tabela ')):
                idx -= 1
            else:
                break

        p_before = OxmlElement('w:p')
        pPr_b = OxmlElement('w:pPr')
        pPr_b.append(deepcopy(portrait_sect))
        p_before.append(pPr_b)
        parent.insert(idx, p_before)

        p_after = OxmlElement('w:p')
        pPr_a = OxmlElement('w:pPr')
        pPr_a.append(deepcopy(landscape_sect))
        p_after.append(pPr_a)
        tbl_pos = list(parent).index(tbl_el)
        parent.insert(tbl_pos + 1, p_after)
        count += 1

    return count


def style_docx(docx_path):
    doc = Document(docx_path)

    # Configura secao base A4 retrato com margens equilibradas (17,4 cm uteis)
    for sec in doc.sections:
        sec.orientation = WD_ORIENT.PORTRAIT
        sec.page_width = Cm(21.0)
        sec.page_height = Cm(29.7)
        sec.left_margin = Cm(1.8)
        sec.right_margin = Cm(1.8)
        sec.top_margin = Cm(2.0)
        sec.bottom_margin = Cm(2.0)
        sec.different_first_page_header_footer = True

        hdr = sec.header.paragraphs[0]
        hdr.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_h = hdr.add_run('Relatório Técnico-Científico Consolidado da Tese — Polo Sul Lunar (60 → 20 → 5 m)')
        r_h.font.name = 'Segoe UI'
        r_h.font.size = Pt(8.5)
        r_h.font.color.rgb = RGBColor(100, 116, 139)

        ftr = sec.footer.paragraphs[0]
        ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_f1 = ftr.add_run('Página ')
        r_f1.font.name = 'Segoe UI'
        r_f1.font.size = Pt(8.5)
        r_f1.font.color.rgb = RGBColor(100, 116, 139)
        r_pg = ftr.add_run()
        r_pg.font.name = 'Segoe UI'
        r_pg.font.size = Pt(8.5)
        r_pg.font.color.rgb = RGBColor(100, 116, 139)
        add_page_number(r_pg)

    # Tipografia academica no corpo (Times New Roman 12 pt, 1,5 entre linhas)
    for style_name in ('Normal', 'Body Text', 'First Paragraph'):
        if style_name in doc.styles:
            st = doc.styles[style_name]
            st.font.name = 'Times New Roman'
            st.font.size = Pt(12)
            st.font.color.rgb = RGBColor(30, 41, 59)
            st.paragraph_format.line_spacing = 1.5
            st.paragraph_format.space_after = Pt(4)

    if 'Compact' in doc.styles:
        st = doc.styles['Compact']
        st.font.name = 'Times New Roman'
        st.font.size = Pt(11)
        st.font.color.rgb = RGBColor(30, 41, 59)
        st.paragraph_format.line_spacing = 1.25
        st.paragraph_format.space_before = Pt(2)
        st.paragraph_format.space_after = Pt(2)

    heading_cfg = {
        'Title': (18, RGBColor(15, 23, 42), 6, 8),
        'Heading 1': (14, RGBColor(15, 71, 97), 22, 6),
        'Heading 2': (13, RGBColor(15, 71, 97), 16, 5),
        'Heading 3': (12, RGBColor(20, 83, 116), 12, 4),
        'Heading 4': (11.5, RGBColor(51, 65, 85), 10, 3),
    }
    for style_name, (sz, rgb, sb, sa) in heading_cfg.items():
        if style_name in doc.styles:
            st = doc.styles[style_name]
            st.font.name = 'Times New Roman'
            st.font.size = Pt(sz)
            st.font.bold = True
            st.font.color.rgb = rgb
            st.paragraph_format.space_before = Pt(sb)
            st.paragraph_format.space_after = Pt(sa)
            st.paragraph_format.keep_with_next = True
            st.paragraph_format.keep_together = True

    if 'Image Caption' in doc.styles:
        st = doc.styles['Image Caption']
        st.font.name = 'Segoe UI'
        st.font.size = Pt(9.5)
        st.font.italic = True
        st.font.color.rgb = RGBColor(71, 85, 105)
        st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
        st.paragraph_format.space_before = Pt(2)
        st.paragraph_format.space_after = Pt(8)

    # Ajusta dimensoes e centralizacao de todas as figuras
    max_w = Cm(16.6)
    for shape in doc.inline_shapes:
        if shape.width > max_w:
            ratio = float(max_w) / float(shape.width)
            shape.width = int(max_w)
            shape.height = int(shape.height * ratio)

    fig_idx = 0
    for p in doc.paragraphs:
        st_name = p.style.name if p.style else ''
        has_img = bool(p._element.xpath('.//w:drawing'))
        has_math_display = p.text.strip() == '' and bool(p._element.xpath('.//m:oMathPara'))

        if has_img:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Cm(0)
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.keep_with_next = True
        elif st_name == 'Image Caption':
            fig_idx += 1
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Cm(0)
            p.paragraph_format.line_spacing = 1.15
            if p.text.strip() and not re.match(r'^Figura\s+\d+\b', p.text.strip()):
                orig = p.text.strip()
                p.text = f'Figura {fig_idx:02d} — {orig}'
            apply_run_font(p, 'Segoe UI', 9.5, italic=True, color_rgb=RGBColor(71, 85, 105))
        elif st_name == 'Title':
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Cm(0)
            apply_run_font(p, 'Times New Roman', 18, bold=True, color_rgb=RGBColor(15, 23, 42))
        elif st_name.startswith('Heading'):
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = Cm(0)
            p.paragraph_format.keep_with_next = True
            p.paragraph_format.keep_together = True
            sz, rgb, sb, sa = heading_cfg.get(st_name, (12, RGBColor(15, 71, 97), 12, 4))
            p.paragraph_format.space_before = Pt(sb)
            p.paragraph_format.space_after = Pt(sa)
            apply_run_font(p, 'Times New Roman', sz, bold=True, color_rgb=rgb)
        elif has_math_display:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.first_line_indent = Cm(0)
        elif st_name == 'Block Text':
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.first_line_indent = Cm(0)
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.right_indent = Cm(0.5)
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.25
            pPr = p._p.get_or_add_pPr()
            pPr.append(parse_xml(
                f'<w:pBdr {nsdecls("w")}><w:left w:val="single" w:sz="18" w:space="8" w:color="1E3A5F"/></w:pBdr>'
            ))
            pPr.append(parse_xml(
                f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="F1F5F9"/>'
            ))
            apply_run_font(p, 'Segoe UI', 10.0, color_rgb=RGBColor(30, 41, 59))
        elif st_name in ('Body Text', 'First Paragraph', 'Normal'):
            txt = p.text.strip()
            is_tbl_title = bool(re.match(r'^Tabela\s+\d+\s+[—-]', txt))
            is_note = txt.startswith((
                'Cada linha', 'Mesmas ', 'Valores ', 'Nota ', 'Nota não',
                'Figuras', 'Fontes', 'Fonte:', 'Conclusão sucinta:'
            ))
            is_list = bool(p._element.xpath('./w:pPr/w:numPr')) or st_name == 'Compact'
            if is_tbl_title:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.first_line_indent = Cm(0)
                p.paragraph_format.line_spacing = 1.15
                p.paragraph_format.space_before = Pt(8)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.keep_with_next = True
                apply_run_font(p, 'Segoe UI', 9.5, bold=True, color_rgb=RGBColor(15, 71, 97))
            elif is_note:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = Cm(0)
                p.paragraph_format.line_spacing = 1.18
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after = Pt(4)
                apply_run_font(p, 'Segoe UI', 9.5, color_rgb=RGBColor(51, 65, 85))
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                p.paragraph_format.line_spacing = 1.5
                if txt and not is_list:
                    p.paragraph_format.first_line_indent = Cm(1.25)
                else:
                    p.paragraph_format.first_line_indent = Cm(0)
                apply_run_font(p, 'Times New Roman', 12)
        elif st_name == 'Compact':
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = Cm(0)
            apply_run_font(p, 'Times New Roman', 11)

    # Tabelas no perfil UAS (Segoe UI 9 / 8 pt, borda externa solida + interna pontilhada, vAlign center)
    for tbl in doc.tables:
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = True
        set_table_borders_uas_profile(tbl)
        ncols = len(tbl.columns)
        font_pt = 8.0 if ncols >= 8 else 9.0

        # Detecta por coluna se a maioria dos dados e numerica/curta para centralizar
        col_center = [True] * ncols
        for c_idx in range(ncols):
            vals = [tbl.rows[r].cells[c_idx].text.strip() for r in range(1, len(tbl.rows))]
            if vals:
                num_frac = sum(1 for v in vals if _is_numeric_like(v)) / len(vals)
                avg_len = sum(len(v) for v in vals) / len(vals)
                col_center[c_idx] = (num_frac >= 0.6) or (avg_len <= 18)

        for r_idx, row in enumerate(tbl.rows):
            trPr = row._tr.get_or_add_trPr()
            trPr.append(OxmlElement('w:cantSplit'))
            if r_idx == 0:
                trPr.append(OxmlElement('w:tblHeader'))

            for c_idx, cell in enumerate(row.cells):
                set_cell_valign(cell, 'center')
                set_cell_margins(cell, top=50, bottom=50, left=65, right=65)
                if r_idx == 0:
                    set_cell_shading(cell, '1E3A5F')
                    set_header_bottom_border(cell)
                elif r_idx % 2 == 1:
                    set_cell_shading(cell, 'F8FAFC')

                align_cell = WD_ALIGN_PARAGRAPH.CENTER if (r_idx == 0 or col_center[c_idx]) else WD_ALIGN_PARAGRAPH.LEFT
                for p in cell.paragraphs:
                    p.alignment = align_cell
                    p.paragraph_format.first_line_indent = Cm(0)
                    p.paragraph_format.space_before = Pt(1)
                    p.paragraph_format.space_after = Pt(1)
                    p.paragraph_format.line_spacing = 1.08
                    for run in p.runs:
                        run.font.name = 'Segoe UI'
                        run.font.size = Pt(font_pt)
                        if r_idx == 0:
                            run.font.bold = True
                            run.font.color.rgb = RGBColor(255, 255, 255)
                        else:
                            run.font.color.rgb = RGBColor(30, 41, 59)

    n_land = insert_landscape_sections_for_wide_tables(doc, min_cols=8)
    doc.save(docx_path)
    return len(doc.tables), len(doc.inline_shapes), fig_idx, n_land


def main():
    with open(MD_PATH, encoding='utf-8') as f:
        raw_md = f.read()
    clean_md = preprocess_markdown(raw_md)

    with tempfile.NamedTemporaryFile('w', suffix='.md', dir=DOCS_DIR, delete=False, encoding='utf-8') as tmp:
        tmp.write(clean_md)
        tmp_md = tmp.name

    target_out = OUT_DOCX
    if os.path.exists(OUT_DOCX):
        try:
            with open(OUT_DOCX, 'ab'):
                pass
        except PermissionError:
            target_out = os.path.join(DOCS_DIR, 'Relatorio_Consolidado_Tese_2026_formatado.docx')
            print(f'Aviso: {os.path.basename(OUT_DOCX)} esta aberto no Word; gerando em {os.path.basename(target_out)}')

    try:
        cmd = [
            PANDOC,
            tmp_md,
            '-f', 'markdown+tex_math_dollars+pipe_tables+grid_tables+fenced_code_blocks+backtick_code_blocks+strikeout',
            '-t', 'docx',
            '--toc',
            '--toc-depth=3',
            f'--resource-path={DOCS_DIR};{ROOT}',
            '-o', target_out,
        ]
        res = subprocess.run(cmd, cwd=DOCS_DIR, capture_output=True, text=True, encoding='utf-8')
        if res.returncode != 0:
            raise RuntimeError(f'Pandoc failed ({res.returncode}): {res.stderr}')
        if res.stderr.strip():
            print('Pandoc warnings:', res.stderr.strip())
    finally:
        if os.path.exists(tmp_md):
            os.remove(tmp_md)

    n_tbl, n_img, n_cap, n_land = style_docx(target_out)
    size_mb = os.path.getsize(target_out) / (1024 * 1024)
    print(f'DOCX gerado: {target_out}')
    print(f'Tamanho: {size_mb:.2f} MB | Tabelas: {n_tbl} (paisagem={n_land}) | Figuras: {n_img} | Legendas: {n_cap}')


if __name__ == '__main__':
    main()
