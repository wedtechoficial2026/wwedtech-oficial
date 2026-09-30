"""Converte o CSS do painel omnichannel (site/produto) para o tema do dashboard.

Cada cor fixa vira a variável equivalente do dashboard (frontend/css/legacy/style.css), de acordo com
o papel dela (texto, fundo, borda) e com o tom (neutro, azul, verde, vermelho,
amarelo). Logos de marketplaces e etiquetas eletrônicas mantêm as cores reais.

Uso:  python tools/python/converter-tema.py <pasta-css-original> <pasta-destino>
"""

import colorsys
import re
import sys
from pathlib import Path

ARQUIVOS = ["app.css", "app-components.css", "brand.css"]

# Regras que imitam objetos do mundo real: mantêm as cores originais
PROTEGIDOS = re.compile(r"\.channel-logo|\.esl|\.qr|\.barcode|\.brand-logo")

COR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b")
REGRA = re.compile(r"([^{}]+)\{([^{}]*)\}")
FONTE = re.compile(r"font-family:\s*Inter,[^;]*;")


def ler_cor(txt):
    txt = {"white": "#ffffff", "black": "#000000"}.get(txt.lower(), txt.lower())
    if txt.startswith("#"):
        h = txt[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    partes = [p.strip() for p in txt[txt.index("(") + 1 : -1].split(",")]
    r, g, b = (float(p) for p in partes[:3])
    a = float(partes[3]) if len(partes) > 3 else 1.0
    return r, g, b, a


def familia(h, s, l):
    """neutro | acc | ok | bad | warn"""
    if s < 0.28 or l > 0.965 or l < 0.06:
        return "neutro"
    graus = h * 360
    if 185 <= graus <= 255:
        return "acc"
    if 75 <= graus < 185:
        return "ok"
    if 22 <= graus < 75:
        return "warn"
    return "bad"


def papel(prop):
    if prop in ("color", "caret-color", "fill", "stroke", "-webkit-text-fill-color"):
        return "texto"
    if prop.startswith("border") or prop.startswith("outline") or prop.startswith("text-decoration"):
        return "linha"
    if "shadow" in prop:
        return "sombra"
    return "fundo"


def mix(var, pct, com):
    return f"color-mix(in srgb, var(--{var}) {pct}%, {com})"


def converter(txt, prop):
    r, g, b, a = ler_cor(txt)
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    fam = familia(h, s, l)
    p = papel(prop)

    if p == "sombra":
        if fam == "acc":
            return mix("acc", round(a * 100), "transparent")
        return txt  # sombras escuras funcionam nos dois temas

    if a < 1:
        if fam == "neutro":
            return txt  # véus brancos/escuros sobre fundos escuros
        return mix(fam, round(a * 100), "transparent")

    if fam == "neutro":
        if p == "texto":
            if l < 0.4:
                return "var(--txt)"
            if l < 0.78:
                return "var(--mut)"
            return txt  # texto claro sobre fundo colorido
        if p == "linha":
            return "var(--line)" if l >= 0.35 else txt
        # fundo
        if l >= 0.975:
            return "var(--card)"
        if l >= 0.94:
            return "var(--panel)"
        if l >= 0.86:
            return mix("line", 55, "var(--card)")
        if l >= 0.6:
            return "var(--line)"
        if l < 0.25:
            return "#0d1115"  # superfícies escuras (com texto branco) seguem escuras
        return "var(--mut)"

    # famílias coloridas: acc (azul da marca), ok, bad, warn
    if p == "texto":
        if fam == "acc":
            return mix("acc", 45, "#ffffff") if l >= 0.6 else mix("acc", 55, "var(--txt)")
        return f"var(--{fam})"
    if p == "linha":
        return mix(fam, 35, "var(--line)") if l > 0.7 else f"var(--{fam})"
    # fundo
    if l > 0.85:
        return mix(fam, 14, "var(--card)")
    if l > 0.65:
        return mix(fam, 30, "var(--card)")
    if fam == "acc":
        if l < 0.22:
            return mix("acc", 18, "#080a0d")
        return "var(--acc2)" if l < 0.38 else "var(--acc)"
    return f"var(--{fam})"


def converter_regra(m):
    seletor, corpo = m.group(1), m.group(2)
    if PROTEGIDOS.search(seletor):
        return m.group(0)

    def decl(d):
        if ":" not in d:
            return d
        prop, valor = d.split(":", 1)
        nome = prop.strip().lower()
        if nome.startswith("--"):
            return d
        return prop + ":" + COR.sub(lambda c: converter(c.group(0), nome), valor)

    corpo = ";".join(decl(d) for d in corpo.split(";"))
    return seletor + "{" + corpo + "}"


def main():
    origem, destino = Path(sys.argv[1]), Path(sys.argv[2])
    for nome in ARQUIVOS:
        css = (origem / nome).read_text(encoding="utf-8")
        css = FONTE.sub('font-family: "Segoe UI", system-ui, sans-serif;', css)
        css = REGRA.sub(converter_regra, css)
        cab = f"/* Gerado por tools/python/converter-tema.py a partir de site/produto/assets/css/{nome}.\n   Cores trocadas pelas variáveis do dashboard (frontend/css/legacy/style.css). Não edite à mão: rode o script de novo. */\n"
        (destino / nome).write_text(cab + css, encoding="utf-8", newline="\n")
        print("ok", nome)


if __name__ == "__main__":
    main()
