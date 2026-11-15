declare namespace NucleoMissao {
    const _unidade: unique symbol;
    type Unidade<T extends string> = number & {
        readonly [_unidade]: T;
    };
    export type Graus = Unidade<"graus">;
    export type Radianos = Unidade<"radianos">;
    export type Horas = Unidade<"horas">;
    export type Dias = Unidade<"dias">;
    export type Watts = Unidade<"watts">;
    export type WattHora = Unidade<"watt-hora">;
    /** Fração adimensional em [0, 1]. 0,2 = 20 %. */
    export type Fracao = Unidade<"fracao">;
    /** Instante UTC em ms desde 1970-01-01T00:00Z (o mesmo de Date.getTime()). */
    export type InstanteMs = Unidade<"instante-ms">;
    /** Cria Graus. Lança erro se não for número finito. */
    export function graus(v: number): Graus;
    export function radianos(v: number): Radianos;
    export function horas(v: number): Horas;
    export function dias(v: number): Dias;
    export function watts(v: number): Watts;
    export function wattHora(v: number): WattHora;
    /** Cria Fração e GARANTE a faixa [0,1] (corta valores fora). */
    export function fracao(v: number): Fracao;
    /** Converte Date ou string ISO ("2027-01-15T06:00Z") em InstanteMs. */
    export function instante(d: Date | string | number): InstanteMs;
    export const MS_POR_HORA = 3600000;
    export function grausParaRad(g: Graus): Radianos;
    export function diasParaHoras(d: Dias): Horas;
    export function somarHoras(t: InstanteMs, h: Horas): InstanteMs;
    export function horasEntre(a: InstanteMs, b: InstanteMs): Horas;
    /** Normaliza azimute para [0, 360). */
    export function normalizarAzimute(az: number): Graus;
    export interface ConfigMissao {
        /** Raio angular aparente do Sol visto da Lua (~0,2666°). */
        readonly raioSolar: Graus;
        /** Margem acima do relevo para considerar a Terra "visível" (link DTE). */
        readonly margemTerra: Graus;
        /** Cronômetro: acima disto fica verde. */
        readonly cronometroVerdeAcima: Horas;
        /** Cronômetro: abaixo disto fica vermelho (entre os dois: âmbar). */
        readonly cronometroVermelhoAbaixo: Horas;
        /** Reserva mínima aceitável da bateria no funil (20 %). */
        readonly reservaBateria: Fracao;
        /** Consumo em hibernação (4 W). */
        readonly consumoHibernacao: Watts;
        /** Carga para sair da hibernação (15 %). */
        readonly cargaDespertar: Fracao;
        /** Máximo de horas seguidas sem ver a Terra, com link direto (48 h). */
        readonly maxHorasSemTerra: Horas;
        /** Passo da simulação (1 h). */
        readonly passoSimulacao: Horas;
        /** Espaçamento entre datas de início testadas na busca (12 h). */
        readonly passoBuscaInicio: Horas;
        /** Funil etapa 1: latitude máxima (≤ −84°). */
        readonly latitudePoloSul: Graus;
        /** Funil etapa 5: inclinação máxima do terreno (15°). */
        readonly inclinacaoMaxima: Graus;
        /** Funil etapa 5: dias extras exigidos pelo relevo de 5 m (Barker 2021). */
        readonly margemRelevoDias: Dias;
        /** Funil etapa 7: área mínima de PSR com gelo (50 000 m²). */
        readonly areaMinimaPSR_m2: number;
    }
    /** ⚠ INVARIANTE: valores combinados no PLANO-ENTREGAVEIS. Não editar aqui. */
    export const CONFIG_PADRAO: ConfigMissao;
    /** Direção de um corpo (Sol ou Terra) vista do sítio, no ENU local. */
    export interface Direcao {
        readonly azimute: Graus;
        readonly elevacao: Graus;
    }
    /**
     * Amostra de efeméride para UM sítio num instante.
     * Vem do pré-cálculo SPICE (DE440 + frame lunar MOON_PA/ME). O app não roda SPICE.
     */
    export interface AmostraEfemeride {
        readonly t: InstanteMs;
        readonly sol: Direcao;
        readonly terra: Direcao;
        /** true se a Terra está cobrindo o Sol (eclipse real, vindo do SPICE). */
        readonly eclipse: boolean;
    }
    /**
     * Quem fornece efemérides. A interface injeta a implementação real
     * (tabela pré-calculada); os testes injetam uma sintética.
     */
    export type FonteEfemeride = (sitio: Sitio, t: InstanteMs) => AmostraEfemeride;
    /**
     * Máscara de horizonte 360°.
     * `elevacoes[i]` é a elevação do relevo no azimute `i * passoAzimute`.
     * O último bin se liga ao primeiro (é circular).
     */
    export interface MascaraHorizonte {
        readonly passoAzimute: Graus;
        readonly elevacoes: ReadonlyArray<Graus>;
        /**
         * "dem_20m" = calculada do LDEM_875S_20M (87,5–90°S), confiável.
         * "ilustrativo" = relevo aproximado; tende a ser OTIMISTA → mostrar "≈".
         */
        readonly origem: "dem_20m" | "ilustrativo";
    }
    export type CategoriaSitio = "apollo" | "clps_comercial" | "outros_paises" | "artemis" | "usuario";
    export interface Sitio {
        readonly id: string;
        readonly nome: string;
        readonly latitude: Graus;
        readonly longitude: Graus;
        readonly categoria: CategoriaSitio;
        readonly mascara: MascaraHorizonte;
        /** Está numa das regiões oficiais NASA (out/2024)? */
        readonly regiaoOficialNasa: boolean;
        /** Inclinação do terreno no ponto. `null` = desconhecida (não passa no funil). */
        readonly inclinacao: Graus | null;
        /** Área de PSR acessível com gelo, m². `null` = sem dado. */
        readonly areaPSR_m2: number | null;
    }
    export type GeometriaPainel = 
    /** Painel vertical que gira para o Sol: P ∝ cos(elev). Padrão do app. */
    "vertical_rastreador"
    /** Painel deitado: P ∝ sin(elev). No polo isso dá ~2,6 % do pico. */
     | "horizontal";
    export interface Veiculo {
        readonly nome: string;
        readonly potenciaPicoSolar: Watts;
        readonly geometriaPainel: GeometriaPainel;
        /** Potência constante de RTG (0 se não tiver). */
        readonly potenciaRTG: Watts;
        /** Consumo com o veículo operando. */
        readonly consumoOperacao: Watts;
        readonly capacidadeBateria: WattHora;
        /** Carga no instante do pouso. */
        readonly cargaInicial: Fracao;
        /** Depende de ver a Terra (sem relay)? Ativa o limite de 48 h. */
        readonly linkDireto: boolean;
    }
    /**
     * Elevação do relevo num azimute qualquer, por interpolação linear
     * entre os dois bins vizinhos da máscara (circular: 359,5° liga com 0°).
     */
    export function elevacaoHorizonte(m: MascaraHorizonte, azimute: Graus): Graus;
    /**
     * Fração do disco solar acima do relevo, em [0,1].
     * Usa a área do segmento circular: o disco é cortado por uma linha
     * (o horizonte local) a uma distância d do centro.
     *   d = elevação do Sol − elevação do relevo naquele azimute
     *   d ≥ +raio → 1 (Sol inteiro)      d ≤ −raio → 0 (Sol escondido)
     * ⚠ INVARIANTE: sem refração (a Lua não tem atmosfera).
     */
    export function fracaoSolVisivel(sol: Direcao, m: MascaraHorizonte, raioSolar?: Graus): Fracao;
    /**
     * A Terra está visível para link direto (DTE)?
     * Critério: centro da Terra acima do relevo + margemTerra.
     */
    export function terraVisivel(terra: Direcao, m: MascaraHorizonte, margem?: Graus): boolean;
    /**
     * Potência solar gerada.
     *   P = Ppico × fração_do_Sol_visível × fator_geométrico
     *   fator = cos(elev) no painel vertical rastreador (padrão do app)
     *   fator = sin(elev) no painel horizontal
     * Elevação ≤ 0 em painel horizontal → 0. Eclipse → 0.
     *
     * ⚠ INVARIANTE: "iluminado" NÃO é "energia". Não troque o fator por 1.
     */
    export function potenciaSolar(v: Veiculo, a: AmostraEfemeride, m: MascaraHorizonte, cfg?: ConfigMissao): Watts;
    export interface PassoSerie {
        readonly t: InstanteMs;
        readonly elevacaoSol: Graus;
        readonly fracaoSol: Fracao;
        readonly terraVisivel: boolean;
        readonly eclipse: boolean;
    }
    export interface SerieSitio {
        readonly sitioId: string;
        readonly inicio: InstanteMs;
        readonly passo: Horas;
        readonly passos: ReadonlyArray<PassoSerie>;
    }
    /** Amostra a efeméride de `inicio` até `inicio + duracao`, a cada `passo`. */
    export function construirSerie(sitio: Sitio, fonte: FonteEfemeride, inicio: InstanteMs, duracao: Horas, passo?: Horas, cfg?: ConfigMissao): SerieSitio;
    /** Mesma fórmula de potenciaSolar(), mas sobre um passo já pré-calculado. */
    export function potenciaDoPasso(v: Veiculo, p: PassoSerie): Watts;
    /** Índice do passo cujo instante é o mais próximo de `t` (com corte nas pontas). */
    export function indiceNaSerie(s: SerieSitio, t: InstanteMs): number;
    export type ModoVeiculo = "operando" | "hibernando";
    export interface ResultadoBateria {
        /** Carga em cada passo (mesmo tamanho do trecho simulado). */
        readonly carga: ReadonlyArray<Fracao>;
        readonly modo: ReadonlyArray<ModoVeiculo>;
        readonly cargaMinima: Fracao;
        readonly instanteCargaMinima: InstanteMs;
        readonly horasHibernando: Horas;
        /** Quantas vezes entrou em hibernação. */
        readonly entradasHibernacao: number;
    }
    /**
     * Simula a bateria do índice `iInicio` (inclusive) por `duracao` horas.
     * Lança RangeError se a série não cobrir o trecho pedido.
     */
    export function simularBateria(v: Veiculo, serie: SerieSitio, iInicio: number, duracao: Horas, cfg?: ConfigMissao): ResultadoBateria;
    export type CorCronometro = "verde" | "ambar" | "vermelho";
    export type EventoHorizonte = "por_do_sol" | "nascer_do_sol" | "por_da_terra" | "nascer_da_terra";
    export interface Cronometro {
        readonly evento: EventoHorizonte;
        /** null = o evento não acontece dentro da série (ex.: Sol o mês todo). */
        readonly horasRestantes: Horas | null;
        readonly instante: InstanteMs | null;
        readonly cor: CorCronometro;
    }
    /**
     * Cor do cronômetro: verde > 24 h, âmbar < 24 h, vermelho < 6 h.
     * `null` (evento fora do horizonte de previsão) conta como verde.
     * ⚠ INVARIANTE: limiares do PLANO-ENTREGAVEIS item 1.
     */
    export function corCronometro(h: Horas | null, cfg?: ConfigMissao): CorCronometro;
    /**
     * Próximo pôr (se o corpo está visível agora) ou nascer (se não está)
     * do Sol ou da Terra a partir do instante `agora`.
     * "Sol visível" = qualquer parte do disco acima do relevo (fracaoSol > 0).
     */
    export function proximoEvento(serie: SerieSitio, agora: InstanteMs, corpo: "sol" | "terra", cfg?: ConfigMissao): Cronometro;
    export interface PrevisaoMissao {
        readonly sitioId: string;
        readonly inicio: InstanteMs;
        readonly duracao: Horas;
        /** % do tempo com qualquer parte do Sol visível. */
        readonly fracaoTempoSolVisivel: Fracao;
        /** Média da fração do disco visível (iluminação média). */
        readonly iluminacaoMedia: Fracao;
        readonly elevacaoSolMaxima: Graus;
        readonly fracaoTempoTerraVisivel: Fracao;
        /** Maior sequência contínua sem nenhuma parte do Sol (h). */
        readonly piorApagao: Horas;
        /** Maior sequência com geração (Sol + RTG) < consumo de operação (h). */
        readonly piorFaltaEnergia: Horas;
        /** Maior sequência sem ver a Terra (h). */
        readonly maiorSilencio: Horas;
        readonly temEclipse: boolean;
        readonly bateria: ResultadoBateria;
    }
    /** Calcula todos os KPIs de uma missão começando em `inicio` e durando `duracao`. */
    export function preverMissao(v: Veiculo, serie: SerieSitio, inicio: InstanteMs, duracao: Horas, cfg?: ConfigMissao): PrevisaoMissao;
    export type NivelAviso = "ok" | "alerta" | "risco";
    export interface AvisoMissao {
        readonly nivel: NivelAviso;
        readonly icone: "✅" | "⚠️" | "🔴";
        readonly mensagem: string;
    }
    /**
     * ✅ ok · ⚠️ bateria abaixo da reserva · 🔴 hibernou (pode não acordar).
     * ⚠ INVARIANTE: hibernação SEMPRE é risco, mesmo que a carga mínima pareça ok.
     */
    export function avisoMissao(p: PrevisaoMissao, cfg?: ConfigMissao): AvisoMissao;
    export interface LinhaComparacao {
        readonly kpi: string;
        readonly a: number;
        readonly b: number;
        readonly unidade: "%" | "h" | "°";
        readonly vencedor: "A" | "B" | "empate";
    }
    /**
     * Compara duas previsões. Diferenças menores que `tolerancia` (na unidade do KPI)
     * contam como empate, para não "premiar" ruído numérico.
     */
    export function compararPlanos(a: PrevisaoMissao, b: PrevisaoMissao, tolerancia?: number): ReadonlyArray<LinhaComparacao>;
    export interface CriterioDataViavel {
        /** Exigir que nunca hiberne. */
        readonly semHibernacao: boolean;
        /** Exigir carga mínima ≥ esta fração. */
        readonly cargaMinima: Fracao;
        /** Limite de horas seguidas sem Terra (null = não checar, ex.: com relay). */
        readonly maxHorasSemTerra: Horas | null;
        /** Rejeitar janelas com eclipse. */
        readonly evitarEclipse: boolean;
    }
    /** Critério da etapa 3 do funil (bateria ≥ 20 %, sem hibernar, ≤ 48 h sem Terra se link direto). */
    export function criterioPadrao(v: Veiculo, cfg?: ConfigMissao, evitarEclipse?: boolean): CriterioDataViavel;
    export function previsaoAtende(p: PrevisaoMissao, c: CriterioDataViavel): boolean;
    /**
     * Testa um início a cada `passoBuscaInicio` (12 h) dentro da série e devolve
     * as previsões que atendem ao critério, ORDENADAS da melhor para a pior:
     *   1º maior carga mínima, 2º maior iluminação média, 3º data mais cedo.
     * A primeira da lista é a "☀️ Melhor data".
     */
    export function buscarDatasViaveis(v: Veiculo, serie: SerieSitio, duracao: Horas, criterio: CriterioDataViavel, cfg?: ConfigMissao): ReadonlyArray<PrevisaoMissao>;
    export interface ContextoFunil {
        readonly veiculo: Veiculo;
        readonly duracaoMissao: Dias;
        readonly ano: number;
        readonly fonte: FonteEfemeride;
        readonly cfg: ConfigMissao;
    }
    export interface ResultadoEtapa {
        readonly passou: boolean;
        /** Frase curta mostrada no cartão do sítio quando é descartado. */
        readonly motivo: string;
        /** Melhor previsão encontrada (só etapas que simulam preenchem). */
        readonly melhor?: PrevisaoMissao;
    }
    export interface EtapaFunil {
        readonly id: string;
        readonly titulo: string;
        readonly avaliar: (s: Sitio, ctx: ContextoFunil, cache: CacheSeries) => ResultadoEtapa;
    }
    /** Guarda séries já calculadas: chave = `${sitioId}|${ano}`. */
    export type CacheSeries = Map<string, SerieSitio>;
    /** Série de um ano inteiro + folga para a última missão começar em 31/12. */
    export function serieDoAno(s: Sitio, ano: number, ctx: ContextoFunil, cache: CacheSeries, folga: Dias): SerieSitio;
    export const ETAPAS_FUNIL: ReadonlyArray<EtapaFunil>;
    export interface ResultadoFunil {
        /** contagens[0] = total de entrada; contagens[k] = após a etapa k. */
        readonly contagens: ReadonlyArray<number>;
        /** Para cada sítio descartado: em qual etapa e por quê. */
        readonly descartes: ReadonlyMap<string, {
            etapaId: string;
            motivo: string;
        }>;
        /** Sítios que passaram em tudo, com a data de pouso recomendada. */
        readonly viaveis: ReadonlyArray<{
            sitio: Sitio;
            dataRecomendada: PrevisaoMissao | undefined;
            aproximado: boolean;
        }>;
    }
    /**
     * Roda o funil inteiro. Sítios com máscara "ilustrativo" são marcados
     * `aproximado: true` (a UI mostra "≈" e os coloca atrás no ranking).
     */
    export function rodarFunil(sitios: ReadonlyArray<Sitio>, ctx: ContextoFunil, etapas?: ReadonlyArray<EtapaFunil>): ResultadoFunil;
    /** Uma linha por passo: tempo ISO, elevação do Sol, fração, Terra, eclipse, carga. */
    export function serieParaCSV(serie: SerieSitio, bateria?: ResultadoBateria, iInicio?: number): string;
    export type TipoRestricaoLP = "<=" | ">=" | "=";
    export interface RestricaoLP {
        readonly a: ReadonlyArray<number>;
        readonly tipo: TipoRestricaoLP;
        readonly b: number;
    }
    export type StatusLP = "otimo" | "inviavel" | "ilimitado" | "limite_iter";
    export interface ResultadoSimplex {
        readonly status: StatusLP;
        readonly x: ReadonlyArray<number>;
        readonly valorOtimo: number;
        /** Preços sombra y_i* = ∂Z_opt / ∂b_i para cada restrição original (Aula 08). */
        readonly precosSombra: ReadonlyArray<number>;
        readonly iteracoes: number;
    }
    /**
     * Resolve Programação Linear geral pelo Método Simplex em Duas Fases (Aulas 04–08):
     *   max Z = c^T x   s.a.   A x (<=, >=, =) b,   x >= 0
     * Mantém os multiplicadores da base para devolver os preços sombra exatos da dualidade.
     */
    export function simplexDuasFases(c: ReadonlyArray<number>, restricoes: ReadonlyArray<RestricaoLP>, maxIter?: number): ResultadoSimplex;
    export interface ConfigOperacaoLP {
        /** Potência máxima de ciência/perfuração (W). */
        readonly potenciaCiencia: Watts;
        /** Potência máxima de transmissão DTE (W). */
        readonly potenciaTransmissao: Watts;
        /** Peso da ciência na função objetivo (1,0 por padrão). */
        readonly pesoCiencia?: number;
        /** Peso da transmissão DTE na função objetivo (1,2 por padrão). */
        readonly pesoTransmissao?: number;
        /** Duração de cada bloco agregado (h). Padrão: ajusta para ≤ 24 blocos. */
        readonly blocoHoras?: Horas;
    }
    export interface PlanoOperacaoOtima {
        readonly viavel: boolean;
        readonly status: StatusLP;
        readonly energiaCienciaWh: WattHora;
        readonly energiaTxWh: WattHora;
        readonly valorObjetivo: number;
        readonly blocosHoras: Horas;
        /** Potência média ótima de ciência em cada bloco (W). */
        readonly perfilCienciaW: ReadonlyArray<Watts>;
        /** Potência média ótima de transmissão DTE em cada bloco (W). */
        readonly perfilTxW: ReadonlyArray<Watts>;
        /** Energia na bateria ao fim de cada bloco (Wh). */
        readonly bateriaWh: ReadonlyArray<WattHora>;
        /** Preço sombra da capacidade da bateria: Wh de ganho objetivo por +1 Wh de bateria. */
        readonly precoSombraBateria: number;
        /** Preço sombra da reserva mínima: perda de objetivo por +1 Wh exigido na reserva. */
        readonly precoSombraReserva: number;
        /** Preço sombra energético por bloco (quanto vale +1 Wh de Sol naquele bloco). */
        readonly gargalosPorBloco: ReadonlyArray<number>;
    }
    /**
     * Planejamento ótimo de operação (ciência + transmissão DTE) respeitando
     * o balanço hora a hora da bateria, reserva mínima e janelas de Terra visível.
     * Implementa a formulação de PL + Dualidade (Aulas 02–08, Marcato).
     */
    export function otimizarPlanoOperacao(v: Veiculo, serie: SerieSitio, iInicio: number, duracao: Horas, opcoes: ConfigOperacaoLP, cfg?: ConfigMissao): PlanoOperacaoOtima;
    /**
     * Método de Newton Monovariado (Aula 10, Marcato) para encontrar a raiz f(x) = 0
     * usando derivada numérica central quando f'(x) não é fornecida analiticamente.
     * Útil para dimensionamento mínimo de bateria ou RTG que atinge exatamente a reserva.
     */
    export function newtonRaiz1D(f: (x: number) => number, x0: number, xMin: number, xMax: number, tol?: number, maxIter?: number): {
        readonly x: number;
        readonly residuo: number;
        readonly convergiu: boolean;
        readonly iteracoes: number;
    };
    export {};
}
