"use strict";
/* =============================================================================
 * nucleo_missao.ts — Núcleo de cálculo do "Lunar Landing Site Navigator"
 * NASA Space Apps 2026 · app: src/cockpit_missao_lunar.html
 * =============================================================================
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ REGRAS PARA QUEM CONTINUAR ESTE ARQUIVO (humano ou agente)                │
 * │                                                                           │
 * │ 1. NÃO troque os tipos "marcados" (Graus, Radianos, Horas, Watts, ...)    │
 * │    por `number`. Eles existem para o compilador barrar a mistura de       │
 * │    unidades. Para criar um valor use SEMPRE os construtores `graus()`,    │
 * │    `horas()`, `watts()` etc. Nunca use `as Graus` fora deste arquivo.      │
 * │ 2. NÃO use `any`. Se precisar, o desenho está errado: crie um tipo.       │
 * │ 3. Todas as funções são PURAS (não leem DOM, não guardam estado global).  │
 * │    A interface chama estas funções e só desenha o resultado.             │
 * │ 4. Constantes físicas e limiares estão em CONFIG_PADRAO (congelado).      │
 * │    Para mudar um limiar, passe outro objeto de configuração; não edite    │
 * │    números soltos dentro das funções.                                     │
 * │ 5. Linhas marcadas com  ⚠ INVARIANTE  não podem mudar sem rodar           │
 * │    `node testes_nucleo.js` e atualizar o teste correspondente.            │
 * │ 6. Sem atmosfera na Lua → SEM refração. Não adicione correção de          │
 * │    refração "por costume" vinda de código terrestre.                      │
 * │ 7. Depois de editar: `tsc -p .` e `node testes_nucleo.js`. Tem que dar 0  │
 * │    erros e todos os testes "ok".                                          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * CONVENÇÕES
 *   - Tempo: instante UTC em milissegundos desde 1970 (InstanteMs). Durações em Horas.
 *   - Ângulos: Graus na API pública; Radianos só dentro de funções trigonométricas.
 *   - Azimute: 0° = Norte, 90° = Leste, sentido horário, faixa [0, 360).
 *   - Elevação: ângulo acima do horizonte matemático local (plano tangente), em graus.
 *   - Máscara de horizonte: elevação do relevo por azimute, já incluindo a altura
 *     do observador (mastro de 2 m por padrão; ver SINTESE-TECNICA §2).
 *
 * COMO É CARREGADO
 *   Compilado para JS "script clássico" (sem import/export) para funcionar dentro
 *   do HTML único, inclusive abrindo por file:// e no GitHub Pages:
 *       <script src="js/nucleo_missao.js"></script>
 *       ...  NucleoMissao.simularBateria(...)
 *   Em Node (testes), o mesmo arquivo publica `globalThis.NucleoMissao`.
 * ========================================================================== */
var NucleoMissao;
(function (NucleoMissao) {
    // ===========================================================================
    // 1. TIPOS DE UNIDADE ("branded types")
    // ---------------------------------------------------------------------------
    // Um `Graus` é um number em tempo de execução, mas o compilador recusa passar
    // um `Horas` onde se espera `Graus`. Custo zero em desempenho.
    // ===========================================================================
    // --- Construtores (únicos lugares onde `as` é permitido) -------------------
    /** Cria Graus. Lança erro se não for número finito. */
    function graus(v) {
        exigirFinito(v, "graus");
        return v;
    }
    NucleoMissao.graus = graus;
    function radianos(v) {
        exigirFinito(v, "radianos");
        return v;
    }
    NucleoMissao.radianos = radianos;
    function horas(v) {
        exigirFinito(v, "horas");
        return v;
    }
    NucleoMissao.horas = horas;
    function dias(v) {
        exigirFinito(v, "dias");
        return v;
    }
    NucleoMissao.dias = dias;
    function watts(v) {
        exigirFinito(v, "watts");
        return v;
    }
    NucleoMissao.watts = watts;
    function wattHora(v) {
        exigirFinito(v, "watt-hora");
        return v;
    }
    NucleoMissao.wattHora = wattHora;
    /** Cria Fração e GARANTE a faixa [0,1] (corta valores fora). */
    function fracao(v) {
        exigirFinito(v, "fracao");
        return Math.min(1, Math.max(0, v));
    }
    NucleoMissao.fracao = fracao;
    /** Converte Date ou string ISO ("2027-01-15T06:00Z") em InstanteMs. */
    function instante(d) {
        const ms = typeof d === "number" ? d : new Date(d).getTime();
        exigirFinito(ms, "instante");
        return ms;
    }
    NucleoMissao.instante = instante;
    // --- Conversões ------------------------------------------------------------
    NucleoMissao.MS_POR_HORA = 3600000;
    function grausParaRad(g) {
        return (g * Math.PI / 180);
    }
    NucleoMissao.grausParaRad = grausParaRad;
    function diasParaHoras(d) {
        return (d * 24);
    }
    NucleoMissao.diasParaHoras = diasParaHoras;
    function somarHoras(t, h) {
        return (t + h * NucleoMissao.MS_POR_HORA);
    }
    NucleoMissao.somarHoras = somarHoras;
    function horasEntre(a, b) {
        return ((b - a) / NucleoMissao.MS_POR_HORA);
    }
    NucleoMissao.horasEntre = horasEntre;
    /** Normaliza azimute para [0, 360). */
    function normalizarAzimute(az) {
        const r = az % 360;
        return (r < 0 ? r + 360 : r);
    }
    NucleoMissao.normalizarAzimute = normalizarAzimute;
    function exigirFinito(v, nome) {
        if (typeof v !== "number" || !Number.isFinite(v)) {
            throw new TypeError(`NucleoMissao: valor inválido para ${nome}: ${String(v)}`);
        }
    }
    /** ⚠ INVARIANTE: valores combinados no PLANO-ENTREGAVEIS. Não editar aqui. */
    NucleoMissao.CONFIG_PADRAO = Object.freeze({
        raioSolar: graus(0.2666),
        margemTerra: graus(0),
        cronometroVerdeAcima: horas(24),
        cronometroVermelhoAbaixo: horas(6),
        reservaBateria: fracao(0.2),
        consumoHibernacao: watts(4),
        cargaDespertar: fracao(0.15),
        maxHorasSemTerra: horas(48),
        passoSimulacao: horas(1),
        passoBuscaInicio: horas(12),
        latitudePoloSul: graus(-84),
        inclinacaoMaxima: graus(15),
        // TODO(equipe): confirmar o número de dias de margem usado no app.
        margemRelevoDias: dias(2),
        areaMinimaPSR_m2: 50000,
    });
    // ===========================================================================
    // 4. GEOMETRIA: HORIZONTE E VISIBILIDADE
    // ===========================================================================
    /**
     * Elevação do relevo num azimute qualquer, por interpolação linear
     * entre os dois bins vizinhos da máscara (circular: 359,5° liga com 0°).
     */
    function elevacaoHorizonte(m, azimute) {
        const n = m.elevacoes.length;
        if (n === 0)
            throw new RangeError("Máscara de horizonte vazia");
        const pos = normalizarAzimute(azimute) / m.passoAzimute;
        const i0 = Math.floor(pos) % n;
        const i1 = (i0 + 1) % n;
        const peso = pos - Math.floor(pos);
        const e0 = m.elevacoes[i0];
        const e1 = m.elevacoes[i1];
        return graus(e0 + (e1 - e0) * peso);
    }
    NucleoMissao.elevacaoHorizonte = elevacaoHorizonte;
    /**
     * Fração do disco solar acima do relevo, em [0,1].
     * Usa a área do segmento circular: o disco é cortado por uma linha
     * (o horizonte local) a uma distância d do centro.
     *   d = elevação do Sol − elevação do relevo naquele azimute
     *   d ≥ +raio → 1 (Sol inteiro)      d ≤ −raio → 0 (Sol escondido)
     * ⚠ INVARIANTE: sem refração (a Lua não tem atmosfera).
     */
    function fracaoSolVisivel(sol, m, raioSolar = NucleoMissao.CONFIG_PADRAO.raioSolar) {
        const d = sol.elevacao - elevacaoHorizonte(m, sol.azimute);
        const r = raioSolar;
        if (d >= r)
            return fracao(1);
        if (d <= -r)
            return fracao(0);
        // Área acima de uma corda a distância d abaixo do centro, dividida por πr².
        const x = d / r; // em (−1, 1)
        const area = Math.acos(-x) + x * Math.sqrt(1 - x * x);
        return fracao(area / Math.PI);
    }
    NucleoMissao.fracaoSolVisivel = fracaoSolVisivel;
    /**
     * A Terra está visível para link direto (DTE)?
     * Critério: centro da Terra acima do relevo + margemTerra.
     */
    function terraVisivel(terra, m, margem = NucleoMissao.CONFIG_PADRAO.margemTerra) {
        return terra.elevacao > elevacaoHorizonte(m, terra.azimute) + margem;
    }
    NucleoMissao.terraVisivel = terraVisivel;
    // ===========================================================================
    // 5. ENERGIA
    // ===========================================================================
    /**
     * Potência solar gerada.
     *   P = Ppico × fração_do_Sol_visível × fator_geométrico
     *   fator = cos(elev) no painel vertical rastreador (padrão do app)
     *   fator = sin(elev) no painel horizontal
     * Elevação ≤ 0 em painel horizontal → 0. Eclipse → 0.
     *
     * ⚠ INVARIANTE: "iluminado" NÃO é "energia". Não troque o fator por 1.
     */
    function potenciaSolar(v, a, m, cfg = NucleoMissao.CONFIG_PADRAO) {
        if (a.eclipse)
            return watts(0);
        const visivel = fracaoSolVisivel(a.sol, m, cfg.raioSolar);
        if (visivel === 0)
            return watts(0);
        const e = grausParaRad(a.sol.elevacao);
        const fator = v.geometriaPainel === "vertical_rastreador" ? Math.cos(e) : Math.max(0, Math.sin(e));
        return watts(v.potenciaPicoSolar * visivel * fator);
    }
    NucleoMissao.potenciaSolar = potenciaSolar;
    /** Amostra a efeméride de `inicio` até `inicio + duracao`, a cada `passo`. */
    function construirSerie(sitio, fonte, inicio, duracao, passo = NucleoMissao.CONFIG_PADRAO.passoSimulacao, cfg = NucleoMissao.CONFIG_PADRAO) {
        if (passo <= 0)
            throw new RangeError("passo deve ser > 0");
        const n = Math.floor(duracao / passo) + 1;
        const passos = new Array(n);
        for (let i = 0; i < n; i++) {
            const t = somarHoras(inicio, horas(i * passo));
            const a = fonte(sitio, t);
            passos[i] = {
                t,
                elevacaoSol: a.sol.elevacao,
                fracaoSol: a.eclipse ? fracao(0) : fracaoSolVisivel(a.sol, sitio.mascara, cfg.raioSolar),
                terraVisivel: terraVisivel(a.terra, sitio.mascara, cfg.margemTerra),
                eclipse: a.eclipse,
            };
        }
        return { sitioId: sitio.id, inicio, passo, passos };
    }
    NucleoMissao.construirSerie = construirSerie;
    /** Mesma fórmula de potenciaSolar(), mas sobre um passo já pré-calculado. */
    function potenciaDoPasso(v, p) {
        if (p.eclipse || p.fracaoSol === 0)
            return watts(0);
        const e = grausParaRad(p.elevacaoSol);
        const fator = v.geometriaPainel === "vertical_rastreador" ? Math.cos(e) : Math.max(0, Math.sin(e));
        return watts(v.potenciaPicoSolar * p.fracaoSol * fator);
    }
    NucleoMissao.potenciaDoPasso = potenciaDoPasso;
    /** Índice do passo cujo instante é o mais próximo de `t` (com corte nas pontas). */
    function indiceNaSerie(s, t) {
        const i = Math.round(horasEntre(s.inicio, t) / s.passo);
        return Math.min(s.passos.length - 1, Math.max(0, i));
    }
    NucleoMissao.indiceNaSerie = indiceNaSerie;
    /**
     * Simula a bateria do índice `iInicio` (inclusive) por `duracao` horas.
     * Lança RangeError se a série não cobrir o trecho pedido.
     */
    function simularBateria(v, serie, iInicio, duracao, cfg = NucleoMissao.CONFIG_PADRAO) {
        const nPassos = Math.round(duracao / serie.passo);
        const iFim = iInicio + nPassos;
        if (iInicio < 0 || iFim >= serie.passos.length) {
            throw new RangeError(`Série não cobre o trecho [${iInicio}, ${iFim}] (tamanho ${serie.passos.length})`);
        }
        const cap = v.capacidadeBateria;
        if (cap <= 0)
            throw new RangeError("capacidadeBateria deve ser > 0");
        let cargaWh = cap * v.cargaInicial;
        let modo = "operando";
        let minimo = cargaWh / cap;
        let tMin = serie.passos[iInicio].t;
        let hHib = 0;
        let entradas = 0;
        const carga = [fracao(minimo)];
        const modos = [modo];
        for (let i = iInicio; i < iFim; i++) {
            const p = serie.passos[i];
            const consumo = modo === "operando" ? v.consumoOperacao : cfg.consumoHibernacao;
            const liquido = potenciaDoPasso(v, p) + v.potenciaRTG - consumo; // W
            cargaWh = Math.min(cap, Math.max(0, cargaWh + liquido * serie.passo));
            if (modo === "hibernando")
                hHib += serie.passo;
            // Transições — ordem importa: primeiro checa entrada, depois saída.
            if (modo === "operando" && cargaWh <= 0) {
                modo = "hibernando";
                entradas++;
            }
            else if (modo === "hibernando" && cargaWh / cap >= cfg.cargaDespertar) {
                modo = "operando";
            }
            const f = cargaWh / cap;
            if (f < minimo) {
                minimo = f;
                tMin = serie.passos[i + 1].t;
            }
            carga.push(fracao(f));
            modos.push(modo);
        }
        return {
            carga,
            modo: modos,
            cargaMinima: fracao(minimo),
            instanteCargaMinima: tMin,
            horasHibernando: horas(hHib),
            entradasHibernacao: entradas,
        };
    }
    NucleoMissao.simularBateria = simularBateria;
    /**
     * Cor do cronômetro: verde > 24 h, âmbar < 24 h, vermelho < 6 h.
     * `null` (evento fora do horizonte de previsão) conta como verde.
     * ⚠ INVARIANTE: limiares do PLANO-ENTREGAVEIS item 1.
     */
    function corCronometro(h, cfg = NucleoMissao.CONFIG_PADRAO) {
        if (h === null || h > cfg.cronometroVerdeAcima)
            return "verde";
        if (h < cfg.cronometroVermelhoAbaixo)
            return "vermelho";
        return "ambar";
    }
    NucleoMissao.corCronometro = corCronometro;
    /**
     * Próximo pôr (se o corpo está visível agora) ou nascer (se não está)
     * do Sol ou da Terra a partir do instante `agora`.
     * "Sol visível" = qualquer parte do disco acima do relevo (fracaoSol > 0).
     */
    function proximoEvento(serie, agora, corpo, cfg = NucleoMissao.CONFIG_PADRAO) {
        const visivelEm = (p) => (corpo === "sol" ? p.fracaoSol > 0 : p.terraVisivel);
        const i0 = indiceNaSerie(serie, agora);
        const visivelAgora = visivelEm(serie.passos[i0]);
        const evento = corpo === "sol" ? (visivelAgora ? "por_do_sol" : "nascer_do_sol") : visivelAgora ? "por_da_terra" : "nascer_da_terra";
        for (let i = i0 + 1; i < serie.passos.length; i++) {
            const p = serie.passos[i];
            if (visivelEm(p) !== visivelAgora) {
                const h = horasEntre(agora, p.t);
                return { evento, horasRestantes: h, instante: p.t, cor: corCronometro(h, cfg) };
            }
        }
        return { evento, horasRestantes: null, instante: null, cor: corCronometro(null, cfg) };
    }
    NucleoMissao.proximoEvento = proximoEvento;
    /** Comprimento (em passos) da maior sequência contínua em que `cond` é true. */
    function maiorSequencia(passos, i0, i1, cond) {
        let melhor = 0;
        let atual = 0;
        for (let i = i0; i <= i1; i++) {
            if (cond(passos[i])) {
                atual++;
                if (atual > melhor)
                    melhor = atual;
            }
            else {
                atual = 0;
            }
        }
        return melhor;
    }
    /** Calcula todos os KPIs de uma missão começando em `inicio` e durando `duracao`. */
    function preverMissao(v, serie, inicio, duracao, cfg = NucleoMissao.CONFIG_PADRAO) {
        const i0 = indiceNaSerie(serie, inicio);
        const nPassos = Math.round(duracao / serie.passo);
        const i1 = i0 + nPassos;
        if (i1 >= serie.passos.length)
            throw new RangeError("Série curta demais para a duração pedida");
        let somaFracao = 0;
        let nSol = 0;
        let nTerra = 0;
        let elevMax = -Infinity;
        let eclipse = false;
        for (let i = i0; i <= i1; i++) {
            const p = serie.passos[i];
            somaFracao += p.fracaoSol;
            if (p.fracaoSol > 0)
                nSol++;
            if (p.terraVisivel)
                nTerra++;
            if (p.elevacaoSol > elevMax)
                elevMax = p.elevacaoSol;
            if (p.eclipse)
                eclipse = true;
        }
        const n = i1 - i0 + 1;
        const h = (k) => horas(k * serie.passo);
        return {
            sitioId: serie.sitioId,
            inicio: serie.passos[i0].t,
            duracao,
            fracaoTempoSolVisivel: fracao(nSol / n),
            iluminacaoMedia: fracao(somaFracao / n),
            elevacaoSolMaxima: graus(elevMax),
            fracaoTempoTerraVisivel: fracao(nTerra / n),
            piorApagao: h(maiorSequencia(serie.passos, i0, i1, (p) => p.fracaoSol === 0)),
            piorFaltaEnergia: h(maiorSequencia(serie.passos, i0, i1, (p) => potenciaDoPasso(v, p) + v.potenciaRTG < v.consumoOperacao)),
            maiorSilencio: h(maiorSequencia(serie.passos, i0, i1, (p) => !p.terraVisivel)),
            temEclipse: eclipse,
            bateria: simularBateria(v, serie, i0, duracao, cfg),
        };
    }
    NucleoMissao.preverMissao = preverMissao;
    /**
     * ✅ ok · ⚠️ bateria abaixo da reserva · 🔴 hibernou (pode não acordar).
     * ⚠ INVARIANTE: hibernação SEMPRE é risco, mesmo que a carga mínima pareça ok.
     */
    function avisoMissao(p, cfg = NucleoMissao.CONFIG_PADRAO) {
        if (p.bateria.entradasHibernacao > 0) {
            return {
                nivel: "risco",
                icone: "🔴",
                mensagem: `Hibernou por ${p.bateria.horasHibernando.toFixed(0)} h. Na vida real poderia não acordar.`,
            };
        }
        if (p.bateria.cargaMinima < cfg.reservaBateria) {
            return {
                nivel: "alerta",
                icone: "⚠️",
                mensagem: `Bateria chega a ${(p.bateria.cargaMinima * 100).toFixed(0)} %, abaixo da reserva de ${(cfg.reservaBateria * 100).toFixed(0)} %.`,
            };
        }
        return { nivel: "ok", icone: "✅", mensagem: "Missão dentro das margens de energia." };
    }
    NucleoMissao.avisoMissao = avisoMissao;
    const KPIS_COMPARACAO = [
        { kpi: "Bateria mínima", unidade: "%", sentido: "maior_melhor", ler: (p) => p.bateria.cargaMinima * 100 },
        { kpi: "Horas hibernando", unidade: "h", sentido: "menor_melhor", ler: (p) => p.bateria.horasHibernando },
        { kpi: "Sol visível", unidade: "%", sentido: "maior_melhor", ler: (p) => p.fracaoTempoSolVisivel * 100 },
        { kpi: "Iluminação média", unidade: "%", sentido: "maior_melhor", ler: (p) => p.iluminacaoMedia * 100 },
        { kpi: "Sol mais alto", unidade: "°", sentido: "maior_melhor", ler: (p) => p.elevacaoSolMaxima },
        { kpi: "Terra visível", unidade: "%", sentido: "maior_melhor", ler: (p) => p.fracaoTempoTerraVisivel * 100 },
        { kpi: "Pior apagão", unidade: "h", sentido: "menor_melhor", ler: (p) => p.piorApagao },
        { kpi: "Pior falta de energia", unidade: "h", sentido: "menor_melhor", ler: (p) => p.piorFaltaEnergia },
        { kpi: "Maior silêncio", unidade: "h", sentido: "menor_melhor", ler: (p) => p.maiorSilencio },
    ];
    /**
     * Compara duas previsões. Diferenças menores que `tolerancia` (na unidade do KPI)
     * contam como empate, para não "premiar" ruído numérico.
     */
    function compararPlanos(a, b, tolerancia = 0.05) {
        return KPIS_COMPARACAO.map(({ kpi, unidade, sentido, ler }) => {
            const va = ler(a);
            const vb = ler(b);
            let vencedor = "empate";
            if (Math.abs(va - vb) > tolerancia) {
                const aMaior = va > vb;
                vencedor = (sentido === "maior_melhor") === aMaior ? "A" : "B";
            }
            return { kpi, a: va, b: vb, unidade, vencedor };
        });
    }
    NucleoMissao.compararPlanos = compararPlanos;
    /** Critério da etapa 3 do funil (bateria ≥ 20 %, sem hibernar, ≤ 48 h sem Terra se link direto). */
    function criterioPadrao(v, cfg = NucleoMissao.CONFIG_PADRAO, evitarEclipse = false) {
        return {
            semHibernacao: true,
            cargaMinima: cfg.reservaBateria,
            maxHorasSemTerra: v.linkDireto ? cfg.maxHorasSemTerra : null,
            evitarEclipse,
        };
    }
    NucleoMissao.criterioPadrao = criterioPadrao;
    function previsaoAtende(p, c) {
        if (c.semHibernacao && p.bateria.entradasHibernacao > 0)
            return false;
        if (p.bateria.cargaMinima < c.cargaMinima)
            return false;
        if (c.maxHorasSemTerra !== null && p.maiorSilencio > c.maxHorasSemTerra)
            return false;
        if (c.evitarEclipse && p.temEclipse)
            return false;
        return true;
    }
    NucleoMissao.previsaoAtende = previsaoAtende;
    /**
     * Testa um início a cada `passoBuscaInicio` (12 h) dentro da série e devolve
     * as previsões que atendem ao critério, ORDENADAS da melhor para a pior:
     *   1º maior carga mínima, 2º maior iluminação média, 3º data mais cedo.
     * A primeira da lista é a "☀️ Melhor data".
     */
    function buscarDatasViaveis(v, serie, duracao, criterio, cfg = NucleoMissao.CONFIG_PADRAO) {
        const passosMissao = Math.round(duracao / serie.passo);
        const saltoInicio = Math.max(1, Math.round(cfg.passoBuscaInicio / serie.passo));
        const ultimoInicio = serie.passos.length - 1 - passosMissao;
        const aprovadas = [];
        for (let i = 0; i <= ultimoInicio; i += saltoInicio) {
            const p = preverMissao(v, serie, serie.passos[i].t, duracao, cfg);
            if (previsaoAtende(p, criterio))
                aprovadas.push(p);
        }
        return aprovadas.sort((x, y) => y.bateria.cargaMinima - x.bateria.cargaMinima ||
            y.iluminacaoMedia - x.iluminacaoMedia ||
            x.inicio - y.inicio);
    }
    NucleoMissao.buscarDatasViaveis = buscarDatasViaveis;
    /** Série de um ano inteiro + folga para a última missão começar em 31/12. */
    function serieDoAno(s, ano, ctx, cache, folga) {
        const chave = `${s.id}|${ano}|${folga}`;
        const pronta = cache.get(chave);
        if (pronta)
            return pronta;
        const inicio = instante(Date.UTC(ano, 0, 1));
        const duracao = horas(horasEntre(inicio, instante(Date.UTC(ano + 1, 0, 1))) + diasParaHoras(folga));
        const serie = construirSerie(s, ctx.fonte, inicio, duracao, ctx.cfg.passoSimulacao, ctx.cfg);
        cache.set(chave, serie);
        return serie;
    }
    NucleoMissao.serieDoAno = serieDoAno;
    function avaliarEnergia(s, ctx, cache, ano, duracao, evitarEclipse) {
        const serie = serieDoAno(s, ano, ctx, cache, duracao);
        const lista = buscarDatasViaveis(ctx.veiculo, serie, diasParaHoras(duracao), criterioPadrao(ctx.veiculo, ctx.cfg, evitarEclipse), ctx.cfg);
        return lista[0];
    }
    NucleoMissao.ETAPAS_FUNIL = [
        {
            id: "polo_sul",
            titulo: "Polo sul (lat ≤ −84°)",
            avaliar: (s, ctx) => s.latitude <= ctx.cfg.latitudePoloSul
                ? { passou: true, motivo: "" }
                : { passou: false, motivo: `Latitude ${s.latitude.toFixed(1)}° fora do polo sul` },
        },
        {
            id: "regiao_nasa",
            titulo: "Regiões oficiais NASA (out/2024)",
            avaliar: (s) => (s.regiaoOficialNasa ? { passou: true, motivo: "" } : { passou: false, motivo: "Fora das regiões oficiais da NASA" }),
        },
        {
            id: "bateria_antena",
            titulo: "Bateria e antena",
            avaliar: (s, ctx, cache) => {
                const m = avaliarEnergia(s, ctx, cache, ctx.ano, ctx.duracaoMissao, false);
                return m
                    ? { passou: true, motivo: "", melhor: m }
                    : { passou: false, motivo: "Nenhuma data no ano mantém a bateria ≥ 20 % e a Terra à vista" };
            },
        },
        {
            id: "eclipses",
            titulo: "Eclipses reais na janela",
            avaliar: (s, ctx, cache) => {
                const m = avaliarEnergia(s, ctx, cache, ctx.ano, ctx.duracaoMissao, true);
                return m ? { passou: true, motivo: "", melhor: m } : { passou: false, motivo: "Todas as datas boas caem num eclipse" };
            },
        },
        {
            id: "margem_relevo",
            titulo: "Margem para relevo de 5 m",
            avaliar: (s, ctx, cache) => {
                if (s.inclinacao === null)
                    return { passou: false, motivo: "Inclinação desconhecida" };
                if (s.inclinacao > ctx.cfg.inclinacaoMaxima) {
                    return { passou: false, motivo: `Inclinação ${s.inclinacao.toFixed(0)}° > ${ctx.cfg.inclinacaoMaxima}°` };
                }
                const total = dias(ctx.duracaoMissao + ctx.cfg.margemRelevoDias);
                const m = avaliarEnergia(s, ctx, cache, ctx.ano, total, true);
                return m
                    ? { passou: true, motivo: "", melhor: m }
                    : { passou: false, motivo: `Janela segura não dura ${total} dias (missão + margem)` };
            },
        },
        {
            id: "atraso_1_ano",
            titulo: "Se atrasar 1 ano",
            avaliar: (s, ctx, cache) => {
                const total = dias(ctx.duracaoMissao + ctx.cfg.margemRelevoDias);
                const m = avaliarEnergia(s, ctx, cache, ctx.ano + 1, total, true);
                return m ? { passou: true, motivo: "", melhor: m } : { passou: false, motivo: `Sem data segura em ${ctx.ano + 1}` };
            },
        },
        {
            id: "gelo",
            titulo: "Gelo (PSR ≥ 50.000 m²)",
            avaliar: (s, ctx) => s.areaPSR_m2 !== null && s.areaPSR_m2 >= ctx.cfg.areaMinimaPSR_m2
                ? { passou: true, motivo: "" }
                : { passou: false, motivo: "Sem PSR de gelo grande o bastante" },
        },
    ];
    /**
     * Roda o funil inteiro. Sítios com máscara "ilustrativo" são marcados
     * `aproximado: true` (a UI mostra "≈" e os coloca atrás no ranking).
     */
    function rodarFunil(sitios, ctx, etapas = NucleoMissao.ETAPAS_FUNIL) {
        const cache = new Map();
        const descartes = new Map();
        const melhor = new Map();
        let vivos = [...sitios];
        const contagens = [vivos.length];
        for (const etapa of etapas) {
            const seguem = [];
            for (const s of vivos) {
                const r = etapa.avaliar(s, ctx, cache);
                if (r.passou) {
                    seguem.push(s);
                    if (r.melhor)
                        melhor.set(s.id, r.melhor); // a última etapa que simulou vence
                }
                else {
                    descartes.set(s.id, { etapaId: etapa.id, motivo: r.motivo });
                }
            }
            vivos = seguem;
            contagens.push(vivos.length);
        }
        const viaveis = vivos
            .map((sitio) => ({ sitio, dataRecomendada: melhor.get(sitio.id), aproximado: sitio.mascara.origem !== "dem_20m" }))
            .sort((x, y) => {
            if (x.aproximado !== y.aproximado)
                return x.aproximado ? 1 : -1; // ≈ vai para trás
            const cx = x.dataRecomendada?.bateria.cargaMinima ?? -1;
            const cy = y.dataRecomendada?.bateria.cargaMinima ?? -1;
            return cy - cx;
        });
        return { contagens, descartes, viaveis };
    }
    NucleoMissao.rodarFunil = rodarFunil;
    // ===========================================================================
    // 13. EXPORTAÇÃO CSV (Modo Engenheiro)
    // ===========================================================================
    /** Uma linha por passo: tempo ISO, elevação do Sol, fração, Terra, eclipse, carga. */
    function serieParaCSV(serie, bateria, iInicio = 0) {
        const cab = "utc_iso,elevacao_sol_graus,fracao_sol_visivel,terra_visivel,eclipse,carga_bateria";
        const linhas = serie.passos.map((p, i) => {
            const k = i - iInicio;
            const carga = bateria && k >= 0 && k < bateria.carga.length ? bateria.carga[k].toFixed(4) : "";
            return [new Date(p.t).toISOString(), p.elevacaoSol.toFixed(4), p.fracaoSol.toFixed(4), p.terraVisivel ? 1 : 0, p.eclipse ? 1 : 0, carga].join(",");
        });
        return [cab, ...linhas].join("\n");
    }
    NucleoMissao.serieParaCSV = serieParaCSV;
    /**
     * Resolve Programação Linear geral pelo Método Simplex em Duas Fases (Aulas 04–08):
     *   max Z = c^T x   s.a.   A x (<=, >=, =) b,   x >= 0
     * Mantém os multiplicadores da base para devolver os preços sombra exatos da dualidade.
     */
    function simplexDuasFases(c, restricoes, maxIter = 4000) {
        const n = c.length;
        const m = restricoes.length;
        if (n === 0) {
            return { status: "otimo", x: [], valorOtimo: 0, precosSombra: new Array(m).fill(0), iteracoes: 0 };
        }
        const EPS = 1e-8;
        // Normaliza restrições para b >= 0 (Aula 04 §4.1)
        const normA = [];
        const normB = [];
        const normTipo = [];
        const invertida = [];
        for (let i = 0; i < m; i++) {
            const r = restricoes[i];
            if (r.a.length !== n)
                throw new RangeError(`Restrição ${i} tem dimensão ${r.a.length}, esperado ${n}`);
            if (r.b < 0) {
                normA.push(r.a.map((v) => -v));
                normB.push(-r.b);
                normTipo.push(r.tipo === "<=" ? ">=" : r.tipo === ">=" ? "<=" : "=");
                invertida.push(true);
            }
            else {
                normA.push([...r.a]);
                normB.push(r.b);
                normTipo.push(r.tipo);
                invertida.push(false);
            }
        }
        // Mapeia colunas: [0..n-1] originais, depois folgas/excessos, depois artificiais.
        // Cada linha recebe exatamente 1 coluna identidade inicial (folga para <=, artificial para >= ou =),
        // cujo custo reduzido na linha Z ao fim da Fase 2 fornece diretamente o preço sombra y_i*.
        const colBaseInicial = new Array(m);
        const ehArtificial = new Array(n).fill(false);
        let totalCols = n;
        // Aloca excessos (-1) para >= e folgas (+1) para <=
        const colFolgaOuExcesso = new Array(m).fill(-1);
        for (let i = 0; i < m; i++) {
            if (normTipo[i] === "<=") {
                colFolgaOuExcesso[i] = totalCols;
                colBaseInicial[i] = totalCols;
                ehArtificial.push(false);
                totalCols++;
            }
            else if (normTipo[i] === ">=") {
                colFolgaOuExcesso[i] = totalCols;
                ehArtificial.push(false);
                totalCols++;
            }
        }
        const colsArtificiais = [];
        for (let i = 0; i < m; i++) {
            if (normTipo[i] !== "<=") {
                colBaseInicial[i] = totalCols;
                ehArtificial.push(true);
                colsArtificiais.push(totalCols);
                totalCols++;
            }
        }
        // Monta matriz do tableau: linha 0 é objetivo, linhas 1..m são restrições, última coluna é LD
        const nColsTab = totalCols + 1; // variáveis + LD
        const ldCol = totalCols;
        const tab = new Float64Array((m + 1) * nColsTab);
        const at = (r, k) => tab[r * nColsTab + k];
        const setAt = (r, k, v) => {
            tab[r * nColsTab + k] = v;
        };
        for (let i = 0; i < m; i++) {
            const row = i + 1;
            const ai = normA[i];
            for (let j = 0; j < n; j++)
                setAt(row, j, ai[j]);
            if (normTipo[i] === "<=") {
                setAt(row, colFolgaOuExcesso[i], 1);
            }
            else if (normTipo[i] === ">=") {
                setAt(row, colFolgaOuExcesso[i], -1);
                setAt(row, colBaseInicial[i], 1);
            }
            else {
                setAt(row, colBaseInicial[i], 1);
            }
            setAt(row, ldCol, normB[i]);
        }
        const base = [...colBaseInicial];
        let iter = 0;
        const pivotar = (linhaPivo, colPivo) => {
            const pivo = at(linhaPivo, colPivo);
            const offPivo = linhaPivo * nColsTab;
            for (let k = 0; k < nColsTab; k++)
                tab[offPivo + k] = tab[offPivo + k] / pivo;
            for (let r = 0; r <= m; r++) {
                if (r === linhaPivo)
                    continue;
                const fator = at(r, colPivo);
                if (Math.abs(fator) <= 1e-14)
                    continue;
                const offR = r * nColsTab;
                for (let k = 0; k < nColsTab; k++) {
                    tab[offR + k] = tab[offR + k] - fator * tab[offPivo + k];
                }
            }
            base[linhaPivo - 1] = colPivo;
        };
        const rodarSimplex = (permitirArtificiais) => {
            while (iter < maxIter) {
                // Regra de Dantzig (mais negativo) com desempate por menor índice (anti-ciclagem)
                let colPivo = -1;
                let menor = -EPS;
                for (let k = 0; k < totalCols; k++) {
                    if (!permitirArtificiais && ehArtificial[k])
                        continue;
                    const v = at(0, k);
                    if (v < menor - 1e-12) {
                        menor = v;
                        colPivo = k;
                    }
                }
                if (colPivo === -1)
                    return "otimo";
                // Teste da razão mínima (Aula 05 §5.2)
                let linhaPivo = -1;
                let razaoMin = Infinity;
                for (let i = 0; i < m; i++) {
                    const y = at(i + 1, colPivo);
                    if (y > EPS) {
                        const ld = Math.max(0, at(i + 1, ldCol));
                        const razao = ld / y;
                        if (razao < razaoMin - 1e-12) {
                            razaoMin = razao;
                            linhaPivo = i + 1;
                        }
                    }
                }
                if (linhaPivo === -1)
                    return "ilimitado";
                pivotar(linhaPivo, colPivo);
                iter++;
            }
            return "limite_iter";
        };
        // FASE 1: Minimizar W = sum(a_i) <=> Maximizar -W = -sum(a_i) (Aula 07 §7.1)
        if (colsArtificiais.length > 0) {
            for (const ca of colsArtificiais)
                setAt(0, ca, 1);
            // Elimina variáveis artificiais básicas da linha W
            for (let i = 0; i < m; i++) {
                if (ehArtificial[base[i]]) {
                    const offR = (i + 1) * nColsTab;
                    for (let k = 0; k < nColsTab; k++)
                        tab[k] = tab[k] - tab[offR + k];
                }
            }
            const st1 = rodarSimplex(true);
            if (st1 === "limite_iter") {
                return { status: "limite_iter", x: new Array(n).fill(0), valorOtimo: 0, precosSombra: new Array(m).fill(0), iteracoes: iter };
            }
            // Valor ótimo de -W está em at(0, ldCol): se -W < -EPS => W > EPS => inviável
            if (at(0, ldCol) < -1e-6) {
                return { status: "inviavel", x: new Array(n).fill(0), valorOtimo: 0, precosSombra: new Array(m).fill(0), iteracoes: iter };
            }
            // Expulsa eventuais variáveis artificiais degeneradas (valor 0) da base antes da Fase 2
            for (let i = 0; i < m; i++) {
                if (ehArtificial[base[i]]) {
                    let trocou = false;
                    for (let k = 0; k < totalCols; k++) {
                        if (!ehArtificial[k] && Math.abs(at(i + 1, k)) > EPS) {
                            pivotar(i + 1, k);
                            trocou = true;
                            break;
                        }
                    }
                    if (!trocou) {
                        // Linha redundante 0 = 0
                    }
                }
            }
        }
        // FASE 2: Restaura função objetivo original Z = c^T x (Aula 07 §7.2)
        for (let k = 0; k < nColsTab; k++)
            setAt(0, k, 0);
        for (let j = 0; j < n; j++)
            setAt(0, j, -c[j]);
        for (let i = 0; i < m; i++) {
            const bCol = base[i];
            const cb = bCol < n ? c[bCol] : 0;
            if (cb !== 0) {
                const offR = (i + 1) * nColsTab;
                for (let k = 0; k < nColsTab; k++)
                    tab[k] = tab[k] + cb * tab[offR + k];
            }
        }
        const st2 = rodarSimplex(false);
        const x = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
            const bCol = base[i];
            if (bCol < n)
                x[bCol] = Math.max(0, at(i + 1, ldCol));
        }
        // Preços sombra (Aula 08 §8.3): coluna identidade inicial de cada linha na linha Z
        const precosSombra = new Array(m);
        for (let i = 0; i < m; i++) {
            const y = at(0, colBaseInicial[i]);
            precosSombra[i] = invertida[i] ? -y : y;
        }
        return {
            status: st2,
            x,
            valorOtimo: at(0, ldCol),
            precosSombra,
            iteracoes: iter,
        };
    }
    NucleoMissao.simplexDuasFases = simplexDuasFases;
    /**
     * Planejamento ótimo de operação (ciência + transmissão DTE) respeitando
     * o balanço hora a hora da bateria, reserva mínima e janelas de Terra visível.
     * Implementa a formulação de PL + Dualidade (Aulas 02–08, Marcato).
     */
    function otimizarPlanoOperacao(v, serie, iInicio, duracao, opcoes, cfg = NucleoMissao.CONFIG_PADRAO) {
        const nPassos = Math.round(duracao / serie.passo);
        const iFim = iInicio + nPassos;
        if (iInicio < 0 || iFim >= serie.passos.length) {
            throw new RangeError(`Série não cobre o trecho [${iInicio}, ${iFim}]`);
        }
        const cap = v.capacidadeBateria;
        const eMin = cap * cfg.reservaBateria;
        const capUtil = Math.max(0, cap - eMin);
        const eInitUtil = Math.max(0, Math.min(capUtil, cap * v.cargaInicial - eMin));
        const blocoH = opcoes.blocoHoras ?? horas(Math.max(serie.passo, Math.ceil(duracao / 24)));
        const passosPorBloco = Math.max(1, Math.round(blocoH / serie.passo));
        const dt = passosPorBloco * serie.passo;
        const K = Math.max(1, Math.ceil(nPassos / passosPorBloco));
        const pCiMax = opcoes.potenciaCiencia;
        const pTxMax = opcoes.potenciaTransmissao;
        const wCi = opcoes.pesoCiencia ?? 1.0;
        const wTx = opcoes.pesoTransmissao ?? 1.2;
        // Variáveis por bloco k = 0..K-1: [ci_k (0..K-1), tx_k (K..2K-1), u_k (2K..3K-1)]
        // u_k = E_k - E_min >= 0 é a energia útil acima da reserva ao fim do bloco k.
        const nVars = 3 * K;
        const c = new Array(nVars).fill(0);
        const restricoes = [];
        const idxBal = [];
        const idxCap = [];
        const dts = [];
        for (let k = 0; k < K; k++) {
            const b0 = iInicio + k * passosPorBloco;
            const b1 = Math.min(iFim, b0 + passosPorBloco);
            let somaGer = 0;
            let terraOk = true;
            for (let i = b0; i < b1; i++) {
                const p = serie.passos[i];
                somaGer += potenciaDoPasso(v, p) + v.potenciaRTG;
                if (v.linkDireto && !p.terraVisivel)
                    terraOk = false;
            }
            const nPassosBloco = Math.max(1, b1 - b0);
            const pGerMedia = somaGer / nPassosBloco;
            const dtBloco = nPassosBloco * serie.passo;
            dts.push(dtBloco);
            const saldo = (pGerMedia - v.consumoOperacao) * dtBloco;
            c[k] = wCi * dtBloco;
            c[K + k] = terraOk ? wTx * dtBloco : 0;
            // 1) Balanço de energia: u_k - u_{k-1} + dt*(ci_k + tx_k) <= saldo + (k===0 ? eInitUtil : 0)
            const aBal = new Array(nVars).fill(0);
            aBal[2 * K + k] = 1;
            if (k > 0)
                aBal[2 * K + k - 1] = -1;
            aBal[k] = dtBloco;
            aBal[K + k] = dtBloco;
            idxBal.push(restricoes.length);
            restricoes.push({ a: aBal, tipo: "<=", b: saldo + (k === 0 ? eInitUtil : 0) });
            // 2) Teto da bateria: u_k <= capUtil
            const aCap = new Array(nVars).fill(0);
            aCap[2 * K + k] = 1;
            idxCap.push(restricoes.length);
            restricoes.push({ a: aCap, tipo: "<=", b: capUtil });
            // 3) Limite ciência: ci_k <= pCiMax
            const aCi = new Array(nVars).fill(0);
            aCi[k] = 1;
            restricoes.push({ a: aCi, tipo: "<=", b: pCiMax });
            // 4) Limite transmissão DTE: tx_k <= terraOk ? pTxMax : 0
            const aTx = new Array(nVars).fill(0);
            aTx[K + k] = 1;
            restricoes.push({ a: aTx, tipo: "<=", b: terraOk ? pTxMax : 0 });
        }
        const res = simplexDuasFases(c, restricoes);
        const perfilCienciaW = [];
        const perfilTxW = [];
        const bateriaWh = [];
        let energiaCi = 0;
        let energiaTx = 0;
        for (let k = 0; k < K; k++) {
            const ci = res.status === "otimo" ? res.x[k] : 0;
            const tx = res.status === "otimo" ? res.x[K + k] : 0;
            const u = res.status === "otimo" ? res.x[2 * K + k] : 0;
            perfilCienciaW.push(watts(ci));
            perfilTxW.push(watts(tx));
            bateriaWh.push(wattHora(eMin + u));
            energiaCi += ci * dts[k];
            energiaTx += tx * dts[k];
        }
        const gargalos = idxBal.map((idx) => res.precosSombra[idx] ?? 0);
        // Aumentar E_cap em +1 Wh aumenta capUtil em +1 Wh (cada restrição u_k <= capUtil)
        const precoSombraBateria = idxCap.reduce((acc, idx) => acc + (res.precosSombra[idx] ?? 0), 0);
        // Aumentar reserva E_min em +1 Wh reduz capUtil em -1 Wh e reduz eInitUtil em -1 Wh (se > 0)
        const precoSombraReserva = -precoSombraBateria - (eInitUtil > 0 ? (gargalos[0] ?? 0) : 0);
        return {
            viavel: res.status === "otimo",
            status: res.status,
            energiaCienciaWh: wattHora(energiaCi),
            energiaTxWh: wattHora(energiaTx),
            valorObjetivo: res.valorOtimo,
            blocosHoras: horas(dt),
            perfilCienciaW,
            perfilTxW,
            bateriaWh,
            precoSombraBateria,
            precoSombraReserva,
            gargalosPorBloco: gargalos,
        };
    }
    NucleoMissao.otimizarPlanoOperacao = otimizarPlanoOperacao;
    /**
     * Método de Newton Monovariado (Aula 10, Marcato) para encontrar a raiz f(x) = 0
     * usando derivada numérica central quando f'(x) não é fornecida analiticamente.
     * Útil para dimensionamento mínimo de bateria ou RTG que atinge exatamente a reserva.
     */
    function newtonRaiz1D(f, x0, xMin, xMax, tol = 1e-4, maxIter = 30) {
        let x = Math.min(xMax, Math.max(xMin, x0));
        const h = Math.max(1e-4, Math.abs(xMax - xMin) * 1e-4);
        for (let k = 0; k < maxIter; k++) {
            const fx = f(x);
            if (Math.abs(fx) <= tol) {
                return { x, residuo: fx, convergiu: true, iteracoes: k };
            }
            const x1 = Math.min(xMax, x + h);
            const x0d = Math.max(xMin, x - h);
            const df = (f(x1) - f(x0d)) / Math.max(1e-12, x1 - x0d);
            if (Math.abs(df) < 1e-10)
                break;
            const xNovo = Math.min(xMax, Math.max(xMin, x - fx / df));
            if (Math.abs(xNovo - x) < tol * 0.1) {
                return { x: xNovo, residuo: f(xNovo), convergiu: Math.abs(f(xNovo)) <= tol * 10, iteracoes: k + 1 };
            }
            x = xNovo;
        }
        const r = f(x);
        return { x, residuo: r, convergiu: Math.abs(r) <= tol * 10, iteracoes: maxIter };
    }
    NucleoMissao.newtonRaiz1D = newtonRaiz1D;
})(NucleoMissao || (NucleoMissao = {}));
// Publica no escopo global (navegador e Node). Não remova.
globalThis.NucleoMissao = NucleoMissao;
