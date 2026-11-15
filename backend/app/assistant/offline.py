"""The offline router: fixed sentences filled from the same tools, picked by keywords.

It answers when the model is not configured, over the day's cap, or fails. The questions
it knows, in both languages, are the ones in QUESTIONS; anything else gets the summary of
the Query and the list of what it can answer. Numbers are written by fmt_number and the
dates by fmt_instant, in the forms the tracer reads, so its answers trace in full.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from datetime import datetime
from typing import Any

from . import tools
from .tracer import MONTHS

Json = dict[str, Any]
Text = dict[str, str]

# One example question per intent and language: the fixed list the router answers.
QUESTIONS: dict[str, Text] = {
    "miss": {
        "en": "What happens if the lander comes down 250 m off target?",
        "pt": "O que acontece se o módulo pousar 250 m fora do alvo?",
    },
    "slope": {
        "en": "Is the ground flat enough to land here?",
        "pt": "O chão é plano o bastante para pousar aqui?",
    },
    "sunset": {"en": "When does the Sun set?", "pt": "Quando o Sol se põe?"},
    "earthset": {"en": "When does the Earth set?", "pt": "Quando a Terra se põe?"},
    "both": {
        "en": "How long do I have the Sun and the Earth together?",
        "pt": "Quanto tempo tenho Sol e Terra ao mesmo tempo?",
    },
    "shadow": {
        "en": "What is the longest shadow?",
        "pt": "Qual é a maior sombra?",
    },
    "light": {"en": "How many hours of sunlight?", "pt": "Quantas horas de sol?"},
    "earth": {"en": "Can I see the Earth?", "pt": "Dá para ver a Terra?"},
    "ladder": {
        "en": "How much does the terrain resolution change the answer?",
        "pt": "Quanto a resolução do terreno muda a resposta?",
    },
    "year": {
        "en": "What is the best Window this year?",
        "pt": "Qual é a melhor Janela deste ano?",
    },
    "validations": {
        "en": "How was this validated?",
        "pt": "Como isso foi validado?",
    },
}

# Checked in this order; the first intent with a keyword in the question wins. Keywords
# match at the start of a word, after accents are dropped and case is folded.
KEYWORDS: list[tuple[str, list[str]]] = [
    (
        "miss",
        ["off target", "misses", "missed", "miss by", "miss its", "miss the", "scatter"]
        + ["m away", "metres away", "meters away", "m from the target", "m from where"]
        + ["errar o alvo", "erra o alvo", "errar por", "fora do alvo", "longe do alvo"]
        + ["do alvo", "m de distancia", "metros de distancia"]
        + ["dispersao"],
    ),
    (
        "slope",
        ["slope", "flat enough", "how flat", "steep", "inclina", "ingreme", "declive"]
        + ["plano o bastante", "plano o suficiente", "plano para pousar", "chao plano"],
    ),
    (
        "earthset",
        ["earthset", "earth set", "earth go", "terra se poe", "por da terra", "terra some"]
        + ["terra desaparece", "perde a terra", "perco a terra", "lose the earth"],
    ),
    (
        "sunset",
        ["sunset", "sun set", "sun go", "por do sol", "sol se poe", "sol some", "anoitece"]
        + ["sol desaparece", "sol vai embora"],
    ),
    (
        "both",
        ["sun and earth", "sun-and-earth", "sol e terra", "sol e a terra", "both"]
        + ["ao mesmo tempo", "same time", "together", "juntos"],
    ),
    ("shadow", ["shadow", "dark", "night", "lcsp", "sombra", "escur", "noite", "bateria"]),
    ("light", ["sunlit", "sunlight", "light", "lcip", "luz", "ilumina", "horas de sol"]),
    ("year", ["year", "ano", "best day", "melhor dia", "best window", "melhor janela"]),
    (
        "ladder",
        ["resolution", "resolucao", "ladder", "escada", "dem", "terrain", "terreno", "relief"]
        + ["relevo", "uncertain", "incerteza", "confia", "trust", "map", "mapa"],
    ),
    (
        "validations",
        ["valid", "proof", "prova", "check", "verifica", "accura", "precis", "horizons"],
    ),
    ("earth", ["earth", "terra", "comunica", "contact", "contato", "dsn"]),
]


def _plain(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def intent(question: str) -> str | None:
    plain = _plain(question)
    for name, words in KEYWORDS:
        if any(re.search(rf"(?<!\w){re.escape(word)}", plain) for word in words):
            return name
    return None


# --- Formatting -------------------------------------------------------------------------


def fmt_number(value: float, decimals: int, lang: str) -> str:
    text = f"{value:,.{decimals}f}"
    if lang == "pt":
        text = text.replace(",", "\0").replace(".", ",").replace("\0", ".")
    return text


def fmt_span(span: Json, lang: str) -> str:
    """A duration as the panel writes it, the same in both languages (the requirement)."""
    text: str = span["text"]
    return text


def fmt_instant(iso: str, lang: str) -> str:
    """Day, month and year, then the time cut to the minute, in UTC."""
    instant = datetime.fromisoformat(iso)
    month = MONTHS[lang][instant.month - 1]
    clock = f"{instant.hour:02d}:{instant.minute:02d} UTC"
    if lang == "pt":
        return f"{instant.day} de {month} de {instant.year}, às {clock}"
    return f"{instant.day} {month} {instant.year} at {clock}"


def fmt_day(iso: str, lang: str) -> str:
    instant = datetime.fromisoformat(iso)
    month = MONTHS[lang][instant.month - 1]
    if lang == "pt":
        return f"{instant.day} de {month} de {instant.year}"
    return f"{instant.day} {month} {instant.year}"


_PLACE: dict[str, Text] = {
    "rim": {
        "en": "behind the rim of {name}, {distance} to the {direction}",
        "pt": "atrás da borda de {name}, a {distance} a {direction}",
    },
    "inside": {
        "en": "behind {name}, {distance} to the {direction}",
        "pt": "atrás de {name}, a {distance} a {direction}",
    },
    "near": {
        "en": "behind high ground near {name}, {distance} to the {direction}",
        "pt": "atrás de um relevo perto de {name}, a {distance} a {direction}",
    },
    "none": {
        "en": "behind high ground {distance} to the {direction}",
        "pt": "atrás de um relevo a {distance} a {direction}",
    },
}


def fmt_behind(occluder: Json | None, lang: str) -> str:
    """Where the Occluder is, in the words the Countdown uses."""
    if occluder is None:
        return ""
    if occluder["distance_km"] >= 1:
        distance = f"{fmt_number(occluder['distance_km'], 1, lang)} km"
    else:
        distance = f"{fmt_number(occluder['distance_m'], 0, lang)} m"
    feature = occluder.get("feature") or {}
    relation = feature.get("relation", "none") if feature.get("name") else "none"
    template = _PLACE.get(relation, _PLACE["none"])[lang]
    return template.format(
        name=feature.get("name", ""), distance=distance, direction=occluder["direction"]
    )


# --- Sentences --------------------------------------------------------------------------

S: dict[str, Text] = {
    "summary": {
        "en": "Across this Window the lander has the Sun and the Earth together for {both}. "
        "Its longest stretch of sunlight is {lit}; its longest night is {dark}.",
        "pt": "Nesta Janela o módulo tem Sol e Terra ao mesmo tempo por {both}. "
        "O maior período de sol dura {lit}; a maior noite, {dark}.",
    },
    "summary.noNight": {
        "en": "Across this Window the lander has the Sun and the Earth together for {both}. "
        "The Sun never sets in it.",
        "pt": "Nesta Janela o módulo tem Sol e Terra ao mesmo tempo por {both}. "
        "O Sol não se põe nenhuma vez.",
    },
    "summary.noSun": {
        "en": "Across this Window the Sun never rises on this Site.",
        "pt": "Nesta Janela o Sol não nasce neste Local.",
    },
    "summary.apart": {
        "en": "Across this Window the lander never has the Sun and the Earth at the same time. "
        "Its longest stretch of sunlight is {lit}; its longest night is {dark}.",
        "pt": "Nesta Janela o módulo nunca tem Sol e Terra ao mesmo tempo. "
        "O maior período de sol dura {lit}; a maior noite, {dark}.",
    },
    "sunset": {
        "en": "The Sun first sets on {when}, {after} after the start of the Window, {behind}.",
        "pt": "O Sol se põe pela primeira vez em {when}, {after} depois do início da Janela, "
        "{behind}.",
    },
    "sunset.never": {
        "en": "The Sun doesn't set at all in this Window.",
        "pt": "O Sol não se põe nenhuma vez nesta Janela.",
    },
    "earthset": {
        "en": "The Earth first sets on {when}, {after} after the start of the Window, {behind}.",
        "pt": "A Terra se põe pela primeira vez em {when}, {after} depois do início da "
        "Janela, {behind}.",
    },
    "earthset.never": {
        "en": "The Earth doesn't set in this Window.",
        "pt": "A Terra não se põe nesta Janela.",
    },
    "earthset.none": {
        "en": "The Earth stays below the horizon for the whole Window.",
        "pt": "A Terra fica abaixo do horizonte durante a Janela inteira.",
    },
    "shadow": {
        "en": "The longest stretch without Sun in this Window (the LCSP) lasts {dark}.",
        "pt": "O maior período sem Sol nesta Janela (o LCSP) dura {dark}.",
    },
    "shadow.none": {
        "en": "The Sun never sets in this Window, so there's no shadow to wait out.",
        "pt": "O Sol não se põe nesta Janela, então não há sombra para esperar passar.",
    },
    "light": {
        "en": "The Sun is up for {lit} of this Window, and its longest unbroken stretch "
        "(the LCIP) lasts {lcip}.",
        "pt": "O Sol fica acima do horizonte por {lit} nesta Janela, e o maior período "
        "seguido (o LCIP) dura {lcip}.",
    },
    "earth": {
        "en": "The Earth is above the horizon for {earth} of this Window.",
        "pt": "A Terra fica acima do horizonte por {earth} nesta Janela.",
    },
    "ladder": {
        "en": "With the finest terrain ({fine_m} m) the Sun-and-Earth time is {fine}; "
        "with only the {coarse_m} m map it would be {coarse}.",
        "pt": "Com o terreno mais fino ({fine_m} m), o tempo com Sol e Terra é de {fine}; "
        "só com o mapa de {coarse_m} m, seria de {coarse}.",
    },
    "ladder.same": {
        "en": "The Sun-and-Earth time is {fine} with the finest terrain ({fine_m}\u00a0m) "
        "and still {coarse} with only the {coarse_m}\u00a0m map.",
        "pt": "O tempo com Sol e Terra é de {fine} com o terreno mais fino ({fine_m}\u00a0m) "
        "e continua {coarse} só com o mapa de {coarse_m}\u00a0m.",
    },
    "year": {
        "en": "In {year} the best Window at {site} starts on {day} and has {both} of Sun "
        "and Earth together.",
        "pt": "Em {year}, a melhor Janela em {site} começa em {day} e tem {both} de Sol e "
        "Terra juntos.",
    },
    "year.custom": {
        "en": "The year view only covers the Sites on the list, and this Query is on a "
        "coordinate of your own.",
        "pt": "A visão do ano só cobre os Locais da lista, e esta Consulta usa uma coordenada sua.",
    },
    "validations": {
        "en": "{passed} of the {total} checks on the Proof page pass. Each one shows its "
        "tolerance and the script that runs it.",
        "pt": "{passed} das {total} validações da página de Prova passam. Cada uma mostra a "
        "tolerância e o script que a executa.",
    },
    "menu": {
        "en": "Without the language model I can still answer about the next Sunset or "
        "Earthset, the longest night, the Resolution ladder, the best Window of the year, "
        "a lander that misses its target, the Slope of the ground and the Proof checks.",
        "pt": "Sem o modelo de linguagem, ainda respondo sobre o próximo pôr do Sol ou o "
        "momento em que a Terra some, a maior noite, a mesma Consulta em mapas de três "
        "resoluções, a melhor Janela do ano, o módulo que erra o alvo, a inclinação do "
        "chão e as validações da página de Prova.",
    },
    # The Landing scatter and the Slope: the approved copy of the phase 4 prototype.
    "miss.steady": {
        "en": "Missing by {radius} changes nothing here: all 19 points get the same hours "
        "of Sun and Earth, to the minute.",
        "pt": "Errar por {radius} não muda nada aqui: os 19 pontos têm as mesmas horas de "
        "Sol e de Terra, ao minuto.",
    },
    "miss.dropTo": {
        "en": "Land {distance} to the {direction} and the Sun-and-Earth time falls from "
        "{from_} to {to}.",
        "pt": "Pouse {distance} a {direction} e o tempo de Sol e Terra juntos cai de {from_} "
        "para {to}.",
    },
    "miss.dropToNone": {
        "en": "Land {distance} to the {direction} and the lander never has the Sun and the "
        "Earth at the same time. At the Site it has them together for {from_}.",
        "pt": "Pouse {distance} a {direction} e o módulo nunca tem Sol e Terra ao mesmo "
        "tempo. No Local ele tem os dois juntos por {from_}.",
    },
    "miss.siteWorst": {
        "en": "The Site is already the worst of the 19 points for Sun-and-Earth time. Within "
        "{radius} it only gets better, up to {to}.",
        "pt": "O Local já é o pior dos 19 pontos em tempo de Sol e Terra juntos. Num raio de "
        "{radius} só melhora, até {to}.",
    },
    "slope.say": {
        "en": "Within {radius} of the Site, half the ground is flatter than {median} and "
        "{percentile}\u00a0% is flatter than {p95}. The steepest cell is {max}.",
        "pt": "Num raio de {radius} do Local, metade do chão tem menos de {median} de "
        "inclinação e {percentile}\u00a0% tem menos de {p95}. A célula mais íngreme tem {max}.",
    },
    "slope.limit": {
        "en": "NASA asks for under {limit} over {radius} for Artemis III. Here {share} of the "
        "cells are under it.",
        "pt": "A NASA pede menos de {limit} em {radius} para o Artemis III. Aqui {share} das "
        "células ficam abaixo disso.",
    },
    "error.not_ready": {
        "en": 'That number isn\'t ready yet. The panel "{panel}" on the screen computes '
        "it, so open it and ask again once it shows the result.",
        "pt": 'Esse número ainda não está pronto. Quem calcula é o painel "{panel}" na '
        "tela: abra o painel e pergunte de novo quando ele mostrar o resultado.",
    },
    "error.outside_coverage": {
        "en": "No DEM covers this Site's horizon, so there's no honest answer for this Query.",
        "pt": "Nenhum DEM cobre o horizonte deste Local, então não há resposta honesta para "
        "esta Consulta.",
    },
    "error.window_out_of_range": {
        "en": "This Window is outside the dates the engine covers.",
        "pt": "Esta Janela está fora das datas que o motor cobre.",
    },
    "error": {
        "en": "The engine couldn't answer this Query.",
        "pt": "O motor não conseguiu responder a esta Consulta.",
    },
}


def say(key: str, lang: str, **values: str) -> str:
    return S[key][lang].format(**values)


def _failure(ctx: tools.Context, lang: str) -> str:
    error = ctx.errors[-1] if ctx.errors else {}
    if error.get("error") == "not_ready":
        return say("error.not_ready", lang, panel=error["panel"])
    key = f"error.{error.get('error')}"
    return say(key if key in S else "error", lang)


def _visibility(ctx: tools.Context) -> Json | None:
    reading = tools.run_tool(ctx, "get_visibility", {})
    return reading.result if reading else None


def _summary(v: Json, lang: str) -> str:
    m = v["metrics"]
    both, lit, dark = (fmt_span(m[k], lang) for k in ("sun_and_earth_time", "lcip", "lcsp"))
    if m["sunlit"]["hours"] == 0:
        return say("summary.noSun", lang)
    if m["lcsp"]["hours"] == 0:
        return say("summary.noNight", lang, both=both)
    if m["sun_and_earth_time"]["hours"] == 0:
        return say("summary.apart", lang, lit=lit, dark=dark)
    return say("summary", lang, both=both, lit=lit, dark=dark)


def _set(v: Json, body: str, lang: str) -> str:
    event = v[f"first_{body}set"]
    if event is None:
        if body == "sun":
            sunless = v["metrics"]["sunlit"]["hours"] == 0
            return say("summary.noSun" if sunless else "sunset.never", lang)
        hidden = v["metrics"]["earth_visible"]["hours"] == 0
        return say("earthset.none" if hidden else "earthset.never", lang)
    return say(
        f"{body}set",
        lang,
        when=fmt_instant(event["time_utc"], lang),
        after=fmt_span(event["after_window_start"], lang),
        behind=fmt_behind(event.get("occluder"), lang),
    ).replace(", .", ".")


def _answer_visibility(name: str, ctx: tools.Context, lang: str) -> str:
    v = _visibility(ctx)
    if v is None:
        return _failure(ctx, lang)
    m = v["metrics"]
    if name in ("sunset", "earthset"):
        return _set(v, name[:-3], lang)
    if name == "shadow":
        if m["lcsp"]["hours"] == 0:
            return say("shadow.none", lang)
        return say("shadow", lang, dark=fmt_span(m["lcsp"], lang))
    if name == "light":
        if m["sunlit"]["hours"] == 0:
            return say("summary.noSun", lang)
        return say("light", lang, lit=fmt_span(m["sunlit"], lang), lcip=fmt_span(m["lcip"], lang))
    if name == "earth":
        if m["earth_visible"]["hours"] == 0:
            return say("earthset.none", lang)
        return say("earth", lang, earth=fmt_span(m["earth_visible"], lang))
    return _summary(v, lang)


def _answer_ladder(ctx: tools.Context, lang: str) -> str:
    reading = tools.run_tool(ctx, "get_visibility_ladder", {})
    if reading is None:
        return _failure(ctx, lang)
    rungs = sorted(reading.result["rungs"], key=lambda rung: rung["finest_dem_m"])
    fine, coarse = rungs[0], rungs[-1]
    values = {
        "fine_m": fmt_number(fine["finest_dem_m"], 0, lang),
        "fine": fmt_span(fine["metrics"]["sun_and_earth_time"], lang),
        "coarse_m": fmt_number(coarse["finest_dem_m"], 0, lang),
        "coarse": fmt_span(coarse["metrics"]["sun_and_earth_time"], lang),
    }
    return say("ladder.same" if values["fine"] == values["coarse"] else "ladder", lang, **values)


def _answer_year(ctx: tools.Context, lang: str) -> str:
    if ctx.query["site_id"] is None:
        return say("year.custom", lang)
    reading = tools.run_tool(ctx, "get_site_year", {})
    if reading is None:
        return _failure(ctx, lang)
    year = reading.result
    if not year["best_windows"]:
        return _failure(ctx, lang)
    best = year["best_windows"][0]
    return say(
        "year",
        lang,
        year=str(year["year"]),
        site=year["site"]["name"],
        day=fmt_day(best["start"], lang),
        both=fmt_span(best["sun_and_earth_time"], lang),
    )


def _answer_validations(ctx: tools.Context, lang: str) -> str:
    reading = tools.run_tool(ctx, "list_validations", {})
    if reading is None or reading.result["total"] == 0:
        return _failure(ctx, lang)
    result = reading.result
    return say("validations", lang, passed=str(result["passed"]), total=str(result["total"]))


def fmt_metres(value: float, lang: str) -> str:
    return f"{fmt_number(value, 0, lang)}\u00a0m"


def fmt_degrees(value: float, lang: str) -> str:
    """One decimal, or none for a whole limit such as NASA's 10°."""
    return f"{fmt_number(value, 0 if value == int(value) else 1, lang)}°"


# "250 m off target": the miss the question names, when it is one the panel can take.
_MISS = re.compile(r"(?<![\w.,])(\d{2,4}(?:[.,]\d+)?)\s?(?:m|metres|meters|metros)\b")


def _radius(question: str) -> float | None:
    for match in _MISS.finditer(question):
        value = float(match.group(1).replace(",", "."))
        if 40 <= value <= 1000:
            return value
    return None


def _answer_miss(ctx: tools.Context, lang: str, question: str) -> str:
    radius = _radius(question)
    reading = tools.run_tool(
        ctx, "get_visibility_scatter", {} if radius is None else {"radius_m": radius}
    )
    if reading is None:
        return _failure(ctx, lang)
    result = reading.result
    both = result["metrics"]["sun_and_earth_time"]
    at_site, lowest, highest = both["at_the_site"], both["lowest"], both["highest"]
    within = fmt_metres(result["radius_m"], lang)
    if highest["hours"] - lowest["hours"] < 1 / 60:
        return say("miss.steady", lang, radius=within)
    if both["lowest_at"].get("at_the_site"):
        return say("miss.siteWorst", lang, radius=within, to=fmt_span(highest, lang))
    where = both["lowest_at"]
    place = {"distance": fmt_metres(where["distance_m"], lang), "direction": where["direction"]}
    if lowest["hours"] == 0:
        return say("miss.dropToNone", lang, from_=fmt_span(at_site, lang), **place)
    return say(
        "miss.dropTo", lang, from_=fmt_span(at_site, lang), to=fmt_span(lowest, lang), **place
    )


def _answer_slope(ctx: tools.Context, lang: str) -> str:
    reading = tools.run_tool(ctx, "get_terrain", {})
    if reading is None:
        return _failure(ctx, lang)
    result = reading.result
    ground = result["slope"]
    within = fmt_metres(ground["radius_m"], lang)
    said = say(
        "slope.say",
        lang,
        radius=within,
        median=fmt_degrees(ground["median_deg"], lang),
        percentile=str(ground["percentile"]),
        p95=fmt_degrees(ground["p95_deg"], lang),
        max=fmt_degrees(ground["steepest_cell_deg"], lang),
    )
    limit = say(
        "slope.limit",
        lang,
        limit=fmt_degrees(ground["limit_deg"], lang),
        radius=within,
        share=f"{fmt_number(ground['share_under_limit_percent'], 0, lang)}\u00a0%",
    )
    return f"{said} {limit}"


ROUTES: dict[str, Callable[[tools.Context, str], str]] = {
    "slope": _answer_slope,
    "ladder": _answer_ladder,
    "year": _answer_year,
    "validations": _answer_validations,
}


def answer(ctx: tools.Context, question: str) -> str:
    """The fixed answer to `question`, in the Context's language."""
    lang = ctx.lang
    name = intent(question)
    if name == "miss":
        return _answer_miss(ctx, lang, question)
    if name in ROUTES:
        return ROUTES[name](ctx, lang)
    if name is not None:
        return _answer_visibility(name, ctx, lang)
    v = _visibility(ctx)
    if v is None:
        return _failure(ctx, lang)
    return f"{_summary(v, lang)} {say('menu', lang)}"
