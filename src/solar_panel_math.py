"""
Modulo de Calculo de Irradiancia e Geometria de Paineis Solares no Polo Sul Lunar
"""

import numpy as np

SOLAR_CONSTANT_MOON = 1361.0  # W/m^2 no topo da atmosfera/superficie lunar

def calcular_potencia_painel(elevacao_sol_deg, azimute_sol_deg, 
                            geometria="vertical_tracking", 
                            azimute_painel_deg=0.0,
                            inclinacao_painel_deg=90.0,
                            area_m2=2.0, 
                            eficiencia=0.30):
    """
    Calcula a potencia eletrica gerada (Watts) considerando a geometria do painel e o Sol rasante.
    
    geometria:
      - 'horizontal': deitado no teto do lander (inclinacao = 0 deg)
      - 'vertical_fixed': em pé na lateral, apontando para azimute fixo
      - 'vertical_tracking': mastro rotativo que acompanha o azimute solar
    """
    theta_sol = np.deg2rad(elevacao_sol_deg)
    phi_sol = np.deg2rad(azimute_sol_deg)
    
    # Vetor unitario apontando para o Sol (sistema ENU: x=Leste, y=Norte, z=Cenit)
    s_x = np.cos(theta_sol) * np.sin(phi_sol)
    s_y = np.cos(theta_sol) * np.cos(phi_sol)
    s_z = np.sin(theta_sol)
    vec_sol = np.array([s_x, s_y, s_z])
    
    # Se o Sol estiver abaixo do horizonte local, geracao direta e zero
    if elevacao_sol_deg <= 0.0:
        return 0.0, 0.0
        
    if geometria == "horizontal":
        # Normal aponta para o zênite [0, 0, 1]
        cos_theta = s_z
    elif geometria == "vertical_tracking":
        # O painel gira em azimute para ficar sempre de frente para o Sol
        # A normal aponta no mesmo azimute do Sol com inclinacao vertical de 90°
        n_x = np.sin(phi_sol)
        n_y = np.cos(phi_sol)
        n_z = 0.0
        vec_normal = np.array([n_x, n_y, n_z])
        cos_theta = np.dot(vec_normal, vec_sol)
    elif geometria == "vertical_fixed":
        # Painel vertical fixo apontando para azimute_painel_deg
        phi_p = np.deg2rad(azimute_painel_deg)
        n_x = np.sin(phi_p)
        n_y = np.cos(phi_p)
        n_z = 0.0
        vec_normal = np.array([n_x, n_y, n_z])
        cos_theta = np.dot(vec_normal, vec_sol)
    else:
        cos_theta = s_z

    fator_incidencia = max(0.0, float(cos_theta))
    potencia_watts = SOLAR_CONSTANT_MOON * eficiencia * area_m2 * fator_incidencia
    
    return potencia_watts, fator_incidencia

if __name__ == "__main__":
    # Teste no Polo Sul com Sol a 1.5° de elevação
    el = 1.5
    az = 120.0
    
    p_horiz, f_horiz = calcular_potencia_painel(el, az, "horizontal")
    p_track, f_track = calcular_potencia_painel(el, az, "vertical_tracking")
    
    print(f"--- Sol a {el}° de elevação ---")
    print(f"Painel Horizontal: {p_horiz:.1f} W (fator de incidencia: {f_horiz*100:.2f}%)")
    print(f"Painel Vertical Rastreador: {p_track:.1f} W (fator de incidencia: {f_track*100:.2f}%)")
    print(f"Multiplicador de ganho: {p_track / p_horiz:.1f}x mais energia!")
