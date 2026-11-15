# -*- coding: utf-8 -*-
"""Monta o pacote de dados do Pragyan: XLSX + CSV."""
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

CRONO = [
    ("23-24 ago 2023", "Desce a rampa do Vikram, segue ao sul e para para carregar a bateria perto da South Crater", "S", "Parada/marco", "LPSC 2025 p.1; Fig.3"),
    ("25 ago 2023", "Move mais ao sul; imagens para S e E revelam cratera A (~1 m) na borda da South Crater (9 m)", "S", "Parada", "LPSC 2025 p.1; Fig.3"),
    ("25-27 ago 2023", "Ponto de bifurcacao; ramo central ao sul", "S", "Parada", "Fig.3"),
    ("27 ago 2023", "Encontra cratera de 4 m de diametro a 3 m a frente; comandado a refazer o caminho", "S", "DESVIO 1 (obstaculo)", "ISRO X; LPSC p.1"),
    ("28 ago 2023", "Novo caminho apos o desvio; dois stops no ramo leste e um a oeste", "E/O", "Parada", "Fig.3"),
    ("29 ago 2023", "Dois stops no ramo sudoeste", "SO", "Parada", "Fig.3"),
    ("30 ago 2023", "Inicia deslocamento para oeste rumo a West Crater; 07:35 foto do Vikram (ChaSTE e ILSA desdobrados); 11:04 foto a 15 m", "O", "Parada/marco", "Fig.2; Wikipedia"),
    ("31 ago 2023", "5 stops (oeste, NW, NE, oeste, ponto mais a oeste); contorna borda oeste da West Crater; loop ~4 m a oeste da crater B", "O/NW/NE", "DESVIO 2 (loop nao mapeado)", "Fig.2; LPSC p.1"),
    ("1 set 2023", "Afasta-se da borda ao S/SE, contorna obstaculo, vai a E e NE; apos crater B segue NW (trecho incerto); rodeia crater B ate a borda da cratera maior", "S/SE/E/NE/NW", "DESVIO 3 (contorno)", "Fig.2; LPSC p.1"),
    ("2 set 2023", "Rumo N/NE em dois stops, pequeno desvio e chega a posicao final; entra em sleep mode com bateria cheia", "N/NE", "DESVIO 4 + fim", "Fig.2; Wikipedia"),
    ("3 set 2023", "Vikram executa hop (~40 cm); mapa marca pre-hop e post-hop", "-", "Marco do lander", "Fig.3; Wikipedia"),
    ("22 set 2023", "Janela prevista de reativacao; rover nao respondeu", "-", "Fim", "Wikipedia"),
]

# desvio deliberado separado
DELIB = ("28-29 ago 2023", "Retorno por caminho deslocado (offset path) para TESTAR TRACAO; fotografou as proprias marcas",
         "DESVIO DELIBERADO (engenharia, nao obstaculo)", "LPSC 2025 p.1")

APXS = [
    ("S (enxofre)", "900-1400 ppm", "1200 ppm (media)", "300-500 ppm acima de Apollo 16 e Luna 20", "Nature 633 (2024); ISRO PRL"),
    ("Na (sodio)", "700-2800 ppm", "-", "Anomalamente depletado vs. terras altas equatoriais", "Nature CEE (2025)"),
    ("K (potassio)", "300-400 ppm", "-", "Anomalamente depletado vs. terras altas equatoriais", "Nature CEE (2025)"),
    ("Litologia inferida", "FAN + Mg-suite", "-", "Plagioclasio dominante; olivina e piroxenio acima do esperado", "ISRO PRL; Nature 633"),
]

SPECS = [
    ("Massa", "26 kg (algumas fontes 27 kg)"),
    ("Dimensoes", "0,9 x 0,75 x 0,85 m"),
    ("Rodas", "6, rocker-bogie, BLDC independente por roda"),
    ("Direcao", "Diferencial de velocidade / skid steering"),
    ("Potencia", "50 W solar"),
    ("Velocidade de projeto", "1 cm/s"),
    ("Alcance de projeto", "500 m"),
    ("Distancia real", "101,4 m (Wikipedia) / ~103 m (ISRO-PRL)"),
    ("Duracao", "12 dias (~10 dias de deslocamento)"),
    ("Instrumentos", "LIBS + APXS (700 g)"),
    ("Navegacao", "2 x NavCam estereo mono 1 MP"),
    ("APXS observacoes", "23 pontos, ~20 min a 3 h cada, ~31 h total"),
    ("Fim", "Sleep mode 02/09/2023; nunca acordou"),
    ("Pouso", "23/08/2023 12:32 UTC, 69,373 S 32,319 E"),
]

wb = Workbook()
hdr_fill = PatternFill('solid', fgColor='1F3864')
hdr_font = Font(color='FFFFFF', bold=True)

def sheet(title, headers, rows, widths):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.fill = hdr_fill
        c.font = hdr_font
        c.alignment = Alignment(vertical='center', wrap_text=True)
    for r in rows:
        ws.append(list(r))
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(vertical='top', wrap_text=True)
    ws.freeze_panes = 'A2'
    return ws

sheet('Cronologia',
      ['Data', 'Evento', 'Direcao', 'Tipo', 'Fonte'],
      CRONO, [16, 74, 14, 26, 24])

ws = sheet('Desvios',
           ['Data', 'Desvio', 'Classificacao', 'Fonte'],
           [DELIB,
            ("27 ago", "Cratera de 4 m a 3 m a frente: retrace + nova rota", "Obstaculo", "ISRO"),
            ("31 ago", "Loop ~4 m a oeste da crater B (ausente no mapa ISRO)", "Contorno de cratera", "LPSC p.1"),
            ("1 set", "Contorno da cratera maior sobreposta pela West Crater", "Contorno de cratera", "LPSC p.1"),
            ("2 set", "Pequeno desvio antes da posicao final", "Ajuste final", "Fig.2")],
           [14, 60, 30, 16])

sheet('APXS', ['Medida', 'Faixa', 'Media', 'Interpretacao', 'Fonte'], APXS, [20, 18, 18, 52, 28])
sheet('Especificacoes', ['Item', 'Valor'], SPECS, [26, 62])

# CSVs simples
with open('pragyan_cronologia.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['data', 'evento', 'direcao', 'tipo', 'fonte'])
    w.writerows(CRONO)

with open('pragyan_apxs.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['medida', 'faixa', 'media', 'interpretacao', 'fonte'])
    w.writerows(APXS)

del wb['Sheet']
wb.save('pragyan_dados.xlsx')
print('OK pragyan_dados.xlsx + 2 CSVs')
