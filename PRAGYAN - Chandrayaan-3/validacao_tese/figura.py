import json, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Circle
E = json.load(open('exemplo_base.json')); z = np.array(E['z']); X0, X1, Y0, Y1 = E['ext']; CEL = 0.25
gx, gy = np.gradient(z, CEL); s = np.degrees(np.arctan(np.hypot(gx, gy)))
fig, ax = plt.subplots(figsize=(7.2, 7.6), dpi=150)
im = ax.imshow(s, origin='lower', extent=[X0, X1, Y0, Y1], cmap='Greys', vmin=0, vmax=40)
cb = fig.colorbar(im, ax=ax, shrink=0.75); cb.set_label('Declive real do modelo (°)')
for c in E['crs']:
    ax.add_patch(Circle((c['x'], c['y']), c['D'] / 2, fill=False, ec='#b45309', lw=1.2, ls='--'))
    ax.text(c['x'], c['y'] + c['D'] / 2 + 0.35, c['nome'].split(' (')[0], ha='center', fontsize=7, color='#b45309')
def xy(cam): return [X0 + (j + 0.5) * CEL for i, j in cam], [Y0 + (i + 0.5) * CEL for i, j in cam]
cores = {'grade_3m': ('#dc2626', 'Plano na grade de 3 m'), 'tese_P90': ('#059669', 'Plano com a tese (3 m→25 cm, P90)'), 'verdade': ('#2563eb', 'Plano com o relevo real (referência)')}
for k, (cor, rot) in cores.items():
    cam = E['planos'][k]
    if cam: x, y = xy(cam); ax.plot(x, y, color=cor, lw=2 if k != 'verdade' else 1.2, ls='-' if k != 'verdade' else ':', label=rot)
# trilha real do Pragyan (LPSC 2025, Fig. 3): ida e volta do ramo sul
tx = [0.0, 0.0, -0.12, 0.1, 0.72, 0.77]; ty = [-3.2, -3.9, -6.19, -7.8, -9.9, -12.25]
ax.plot(tx, ty, color='#7c3aed', lw=3, alpha=0.75, label='Trilha real do Pragyan 23–27/08 (ida e volta)')
ax.plot([0.77], [-12.25], 'o', color='#7c3aed'); ax.annotate('27/08: cratera de 4 m\n3 m à frente → refaz o caminho', (0.77, -12.25), (3.2, -7.0), fontsize=7.5, color='#7c3aed', arrowprops=dict(arrowstyle='->', color='#7c3aed'))
ax.plot(*[0.0, -3.9][::1], 's', color='k'); ax.text(0.3, -3.6, 'início (23–24/08)', fontsize=7)
ax.plot(0.8, -22.5, '*', color='k', ms=10); ax.text(1.2, -22.6, 'meta ao sul', fontsize=7)
ax.set_xlabel('Leste (m) a partir do Vikram'); ax.set_ylabel('Norte (m)'); ax.set_xlim(-6, 13); ax.set_ylim(-24, 0)
ax.set_title('Pragyan, setor da South Crater: o plano grosso repete o erro de 27/08', fontsize=10)
ax.legend(fontsize=7, loc='lower left', framealpha=0.9); ax.set_aspect('equal')
fig.text(0.01, 0.005, 'Cena: trilha e crateras digitalizadas de Stooke, LPSC 2025 #1025 (Fig. 3); cratera de 4 m inferida (post ISRO 27/08 + fundo OHRC). Relevo das crateras: modelo d/D 0,10–0,20 (1 sorteio de 500).', fontsize=5.6)
fig.tight_layout(); fig.savefig('pragyan_validacao.png')
