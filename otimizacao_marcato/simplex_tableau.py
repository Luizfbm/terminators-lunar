"""
Implementacao Didatica do Metodo SIMPLEX Tabular (Formato Professor Marcato)
Suporta maximizacao com restricoes de <= (folgas padrao).
Exibe as tabelas intermediarias e o resultado final.
"""

import numpy as np

def simplex_tableau(c, A, b):
    """
    Maximizar Z = c^T x
    sujeito a A x <= b, x >= 0
    """
    m, n = A.shape
    num_vars = n + m
    
    # Criar a matriz do tableau: (m + 1) linhas x (num_vars + 2) colunas
    # Colunas: [Z, x1..xn, s1..sm, LD]
    tableau = np.zeros((m + 1, num_vars + 2))
    
    # Linha Z: 1*Z - c1*x1 - c2*x2 ... = 0
    tableau[0, 0] = 1.0
    tableau[0, 1:n+1] = -c
    tableau[0, -1] = 0.0
    
    # Linhas das restricoes
    for i in range(m):
        tableau[i+1, 0] = 0.0
        tableau[i+1, 1:n+1] = A[i]
        tableau[i+1, n+1+i] = 1.0  # Variavel de folga
        tableau[i+1, -1] = b[i]
        
    base = [n + i for i in range(m)]  # Indices das variaveis basicas (folgas)
    nomes_vars = [f"x{j+1}" for j in range(n)] + [f"s{i+1}" for i in range(m)]

    print("=" * 60)
    print("TABLEAU INICIAL:")
    print("=" * 60)
    imprimir_tableau(tableau, base, nomes_vars)
    
    iteracao = 1
    while True:
        # 1. Teste de otimalidade (procurar coeficientes negativos na linha Z)
        linha_z = tableau[0, 1:-1]
        menor_valor = np.min(linha_z)
        
        if menor_valor >= -1e-8:
            print("\n[OTIMALIDADE ATINGIDA] Todos os custos reduzidos sao >= 0.")
            break
            
        coluna_pivo = np.argmin(linha_z) + 1  # +1 pelo deslocamento de Z
        var_entra = nomes_vars[coluna_pivo - 1]
        
        # 2. Teste da Razao Minima
        coluna = tableau[1:, coluna_pivo]
        ld = tableau[1:, -1]
        
        razoes = []
        for i in range(len(coluna)):
            if coluna[i] > 1e-8:
                razoes.append(ld[i] / coluna[i])
            else:
                razoes.append(np.inf)
                
        razao_min = np.min(razoes)
        if razao_min == np.inf:
            print("\n[PROBLEMA ILIMITADO] Todos os elementos da coluna pivo sao <= 0.")
            return None
            
        linha_pivo = np.argmin(razoes) + 1  # +1 pelo deslocamento da linha Z
        var_sai = nomes_vars[base[linha_pivo - 1]]
        
        print(f"\n--- Iteracao {iteracao} ---")
        print(f"Variavel que entra: {var_entra} (coluna {coluna_pivo})")
        print(f"Variavel que sai  : {var_sai} (linha {linha_pivo})")
        
        # Atualiza a base
        base[linha_pivo - 1] = coluna_pivo - 1
        
        # 3. Operacoes de Gauss-Jordan
        elemento_pivo = tableau[linha_pivo, coluna_pivo]
        tableau[linha_pivo, :] /= elemento_pivo
        
        for i in range(m + 1):
            if i != linha_pivo:
                fator = tableau[i, coluna_pivo]
                tableau[i, :] -= fator * tableau[linha_pivo, :]
                
        imprimir_tableau(tableau, base, nomes_vars)
        iteracao += 1

    # Extrair solucao
    solucao = np.zeros(n)
    for i, b_idx in enumerate(base):
        if b_idx < n:
            solucao[b_idx] = tableau[i+1, -1]
            
    valor_otimo = tableau[0, -1]
    print("\n" + "=" * 60)
    print("RESULTADO FINAL:")
    print("=" * 60)
    for j in range(n):
        print(f"x{j+1}* = {solucao[j]:.4f}")
    print(f"Valor Otimo Z* = {valor_otimo:.4f}")
    return solucao, valor_otimo

def imprimir_tableau(tableau, base, nomes_vars):
    cabecalho = ["Base", "Z"] + nomes_vars + ["LD"]
    print(f"{cabecalho[0]:<8} | " + " | ".join(f"{c:>8}" for c in cabecalho[1:]))
    print("-" * (12 + len(cabecalho) * 11))
    
    # Linha Z
    valores_z = [f"{v:>8.2f}" for v in tableau[0]]
    print(f"{'Z':<8} | " + " | ".join(valores_z))
    
    # Linhas de restricoes
    for i in range(len(base)):
        nome_base = nomes_vars[base[i]]
        valores_linha = [f"{v:>8.2f}" for v in tableau[i+1]]
        print(f"{nome_base:<8} | " + " | ".join(valores_linha))

if __name__ == "__main__":
    # Exemplo classico de aula:
    # Max Z = 3*x1 + 5*x2
    # s.a:
    # 2*x1 + x2  <= 16
    # x1  + 2*x2 <= 11
    # x1  + 3*x2 <= 15
    # x1, x2 >= 0
    c = np.array([3.0, 5.0])
    A = np.array([
        [2.0, 1.0],
        [1.0, 2.0],
        [1.0, 3.0]
    ])
    b = np.array([16.0, 11.0, 15.0])
    
    simplex_tableau(c, A, b)
