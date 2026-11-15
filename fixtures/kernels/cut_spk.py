"""Cuts de440.bsp to the fixture SPK, the same way spkmerge.cmd describes.

    python cut_spk.py <de440.bsp> <out.bsp>

spksub is the SPICE routine spkmerge uses: it copies the Chebyshev records that cover the
interval as they are, so inside the interval the cut gives the same numbers as DE440.
"""

import sys

import spiceypy as sp

BODIES = (10, 3, 399, 301)
BEGIN, END = "2023 JUL 01 00:00:00 TDB", "2033 JAN 31 00:00:00 TDB"


def main(source: str, out: str) -> None:
    begin, end = sp.str2et(BEGIN), sp.str2et(END)
    handle = sp.dafopr(source)
    new = sp.spkopn(out, "DE440 2023-2032 fixture", 0)
    sp.dafbfs(handle)
    while sp.daffna():
        summary = sp.dafgs()[:5]  # ND=2, NI=6 packs into 5 doubles
        dc, ic = sp.dafus(summary, 2, 6)
        if ic[0] not in BODIES or dc[1] < begin or dc[0] > end:
            continue
        name = sp.dafgn()
        sp.spksub(handle, summary, name, max(begin, dc[0]), min(end, dc[1]), new)
    sp.spkcls(new)
    sp.dafcls(handle)


if __name__ == "__main__":
    sp.furnsh(sys.argv[3] if len(sys.argv) > 3 else "naif0012.tls")
    main(sys.argv[1], sys.argv[2])
