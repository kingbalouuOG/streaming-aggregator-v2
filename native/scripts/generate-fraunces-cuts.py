#!/usr/bin/env python3
"""
Generate static, optically-sized Fraunces cuts for the Videx native app.

WHY: React Native has no per-element variable-font axis control — the web sets
`font-variation-settings: "opsz" N` per element, RN cannot. Fraunces' optical-
size axis is the whole point of the family (without it the serif "looks
generic" — design system, critical rule #1), so we pre-instance the variable
master at the design system's per-role opsz/weight values into STATIC .ttf
files, one family per role. RN then references each by family name.

VALUES: from the design handoff — tokens.json `font.opsz` + the type ramp in
videx-design-system.html. Roman + Italic variable masters (OFL) are downloaded
to native/.font-src/ from the google/fonts repo (ofl/fraunces) by the prep step.

RUN:    py native/scripts/generate-fraunces-cuts.py
OUTPUT: native/assets/fonts/Fraunces-<Role>.ttf  (wired in app/_layout.tsx +
        tailwind.config.js)
"""
import os

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
NATIVE = os.path.dirname(HERE)
SRC_ROMAN = os.path.join(NATIVE, ".font-src", "Fraunces-Roman-VF.ttf")
SRC_ITALIC = os.path.join(NATIVE, ".font-src", "Fraunces-Italic-VF.ttf")
OUT = os.path.join(NATIVE, "assets", "fonts")

# family name, opsz, wght, italic  —  one static cut per editorial role.
ROLES = [
    ("Fraunces-Hero",       144, 700, False),  # hero headline (display-xl 44)
    ("Fraunces-Display",     96, 600, False),  # section/room title (display-lg 32)
    ("Fraunces-Dropcap",     96, 700, False),  # Editor's Note drop cap
    ("Fraunces-Title",       36, 600, False),  # section head (display-md 22)
    ("Fraunces-Standfirst",  18, 500, False),  # standfirst (display-sm 17)
    ("Fraunces-Body",        18, 400, False),  # serif body (Editor's Note essay)
    ("Fraunces-Italic",      18, 400, True),   # captions / standfirst italic
    ("Fraunces-Card",        12, 600, False),  # card title (13)
]


def set_name(font, family):
    """Rename to a unique family with a single Regular face so Android never
    groups the cuts or synthesizes a weight/slant."""
    name = font["name"]
    ps = family.replace(" ", "")
    records = {1: family, 2: "Regular", 3: f"Videx;{family}", 4: family,
               6: ps, 16: family, 17: "Regular"}
    for nid, val in records.items():
        name.setName(val, nid, 3, 1, 0x409)  # Windows / Unicode
        name.setName(val, nid, 1, 0, 0)       # Mac / Roman
    # drop leftover name records that named the (now-pinned) axes
    name.names = [n for n in name.names if n.nameID < 256]


def build(family, opsz, wght, italic):
    font = TTFont(SRC_ITALIC if italic else SRC_ROMAN)
    instantiateVariableFont(
        font, {"opsz": opsz, "wght": wght, "SOFT": 0, "WONK": 0}, inplace=True
    )
    set_name(font, family)
    out = os.path.join(OUT, family + ".ttf")
    font.save(out)
    return out, os.path.getsize(out), ("fvar" not in font)


def main():
    for src in (SRC_ROMAN, SRC_ITALIC):
        if not os.path.exists(src):
            raise SystemExit(f"missing source {src} — run the download prep first")
    os.makedirs(OUT, exist_ok=True)
    print(f'{"family":22} {"opsz":>4} {"wght":>4} {"ital":>5}  {"static":>6}  {"bytes":>9}')
    ok = True
    for family, opsz, wght, italic in ROLES:
        out, sz, static = build(family, opsz, wght, italic)
        ok = ok and static
        print(f"{family:22} {opsz:>4} {wght:>4} {str(italic):>5}  {str(static):>6}  {sz:>9,}")
    print(f"\n{'OK' if ok else 'WARN: a cut is still variable'} — wrote {len(ROLES)} cuts to {OUT}")


if __name__ == "__main__":
    main()
