"""
Implementacao dos Metodos de Otimizacao Nao Linear (Aulas 10 e 11 - Marcato)
- Newton Monovariado
- Newton Multivariado com Hessiana e Gradiente
- Solucao Restrita com Condicoes KKT via SciPy SLSQP (Aula 12)
"""

import numpy as np
from scipy.optimize import minimize

# -------------------------------------------------------------
# AULA 10: METODO DE NEWTON MONOVARIADO
# -------------------------------------------------------------
def newton_monovariado(f_prime, f_double_prime, x0, tol=1e-6, max_iter=50):
    """
    Minimiza f(x) encontrando a raiz de f'(x) = 0
    Iteracao: x_{k+1} = x_k - f'(x_k) / f''(x_k)
    """
    x = float(x0)
    print(f"[Newton 1D] Ponto Inicial: x0 = {x:.4f}")
    
    for k in range(max_iter):
        g = f_prime(x)
        h = f_double_prime(x)
        
        if abs(h) < 1e-12:
            print("[Newton 1D] Erro: f''(x) proxima de zero.")
            break
            
        passo = g / h
        x_novo = x - passo
        
        print(f"Iter {k+1:02d}: x = {x_novo:.6f} | f'(x) = {g:.4e} | f''(x) = {h:.4f}")
        
        if abs(passo) < tol or abs(g) < tol:
            print(f"[Newton 1D] Convergencia atingida em {k+1} iteracoes: x* = {x_novo:.6f}\n")
            return x_novo
            
        x = x_novo
        
    return x

# -------------------------------------------------------------
# AULA 11: METODO DE NEWTON MULTIVARIADO
# -------------------------------------------------------------
def newton_multivariado(grad_f, hess_f, x0, tol=1e-6, max_iter=50):
    """
    Minimiza f(x), x in R^n
    Iteracao: x_{k+1} = x_k - [H(x_k)]^{-1} * grad_f(x_k)
    """
    x = np.array(x0, dtype=float)
    print(f"[Newton nD] Ponto Inicial: {x}")
    
    for k in range(max_iter):
        g = grad_f(x)
        H = hess_f(x)
        
        # Teste de norma do gradiente (criterio de parada de primeira ordem)
        norm_g = np.linalg.norm(g)
        if norm_g < tol:
            print(f"[Newton nD] Ponto Estacionario alcancado em {k} iteracoes: x* = {x}")
            return x
            
        # Resolver H * d = -g para evitar inversao direta
        try:
            d = np.linalg.solve(H, -g)
        except np.linalg.LinAlgError:
            print("[Newton nD] Hessiana singular. Abortando.")
            return None
            
        x = x + d
        print(f"Iter {k+1:02d}: x = {x} | ||grad|| = {norm_g:.4e}")
        
    return x

# -------------------------------------------------------------
# AULA 12: EXEMPLO DE PNL RESTRITA COM KKT (SciPy SLSQP)
# -------------------------------------------------------------
def exemplo_kkt_restrito():
    """
    Min f(x1, x2) = (x1 - 3)^2 + (x2 - 2)^2
    s.a:
        x1 + x2 <= 4    (g1 <= 0:  4 - x1 - x2 >= 0)
        x1, x2 >= 0
    """
    def obj(x):
        return (x[0] - 3.0)**2 + (x[1] - 2.0)**2

    def grad_obj(x):
        return np.array([2.0 * (x[0] - 3.0), 2.0 * (x[1] - 2.0)])

    # Restricao de desigualdade em formato c(x) >= 0 no scipy
    constraints = [
        {'type': 'ineq', 'fun': lambda x: 4.0 - (x[0] + x[1])}
    ]
    bounds = [(0, None), (0, None)]
    
    res = minimize(obj, x0=[0.0, 0.0], jac=grad_obj, constraints=constraints, bounds=bounds, method='SLSQP')
    
    print("\n[PNL Restrita - Condicoes KKT via SLSQP]")
    print("Status:", res.message)
    print("Ponto Otimo x*:", res.x)
    print("Valor Otimo f(x*):", res.fun)


if __name__ == "__main__":
    # Teste 1D: f(x) = x^4 - 3*x^3 + 2, f'(x) = 4*x^3 - 9*x^2, f''(x) = 12*x^2 - 18*x
    print("=" * 60)
    print("1. TESTE NEWTON MONOVARIADO")
    print("=" * 60)
    f_p = lambda x: 4.0 * x**3 - 9.0 * x**2
    f_pp = lambda x: 12.0 * x**2 - 18.0 * x
    newton_monovariado(f_p, f_pp, x0=3.0)

    # Teste Multivariado: Funcao quadrática f(x1, x2) = 2*x1^2 + 4*x1*x2 + 5*x2^2 - 6*x1 - 2*x2
    print("=" * 60)
    print("2. TESTE NEWTON MULTIVARIADO")
    print("=" * 60)
    grad = lambda x: np.array([4.0*x[0] + 4.0*x[1] - 6.0, 4.0*x[0] + 10.0*x[1] - 2.0])
    hess = lambda x: np.array([[4.0, 4.0], [4.0, 10.0]])
    newton_multivariado(grad, hess, x0=[0.0, 0.0])

    # Teste KKT Restrito
    print("=" * 60)
    print("3. TESTE OTIMIZACAO RESTRITA (KKT)")
    print("=" * 60)
    exemplo_kkt_restrito()
