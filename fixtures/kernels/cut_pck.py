"""Cuts NAIF's combined Earth orientation PCK to the fixture, keeping whole segments.

    python cut_pck.py <earth_1962_260806_2126_combined.bpc> <out.bpc> [naif0012.tls]

The source is a type 2 binary PCK (Chebyshev records for the ITRF93 Euler angles, one
record per day, 1000 records per segment). Every segment that overlaps 2023-07-01 to
2033-01-31 TDB is copied whole, with its own start, record length and coefficients.
SPICE has no `pcksub`, so the records are read with `dafgda` and written with `pckw02`,
which recomputes each record's midpoint and radius from the start and the length. That
costs the last bits: over 40,011 epochs in the cut, the J2000 to ITRF93 rotation from the
fixture differs from the full file's by at most 8.7e-12 per matrix element (about 2
micro-arcseconds), checked when the fixture was made.
"""

import sys

import numpy as np
import spiceypy as sp

BEGIN, END = "2023 JUL 01 00:00:00 TDB", "2033 JAN 31 00:00:00 TDB"


def main(source: str, out: str) -> None:
    begin, end = sp.str2et(BEGIN), sp.str2et(END)
    handle = sp.dafopr(source)
    new = sp.pckopn(out, "Earth ITRF93 2023-2032 fixture", 0)
    sp.dafbfs(handle)
    while sp.daffna():
        summary = sp.dafgs()
        dc, ic = sp.dafus(summary, 2, 5)
        body, frame_code, kind, first, last = (int(value) for value in ic)
        if kind != 2 or dc[1] < begin or dc[0] > end:
            continue
        init, intlen, rsize, count = sp.dafgda(handle, last - 3, last)
        rsize, count = int(rsize), int(count)
        records = np.array(sp.dafgda(handle, first, first + rsize * count - 1))
        records = records.reshape(count, rsize)
        degree = (rsize - 2) // 3 - 1
        # Each record is MID, RADIUS, then the coefficients of the three angles.
        coefficients = records[:, 2:].ravel()
        sp.pckw02(
            new,
            body,
            sp.frmnam(frame_code),
            dc[0],
            dc[1],
            sp.dafgn(),
            intlen,
            count,
            degree,
            coefficients,
            init,
        )
    sp.pckcls(new)
    sp.dafcls(handle)


if __name__ == "__main__":
    sp.furnsh(sys.argv[3] if len(sys.argv) > 3 else "naif0012.tls")
    main(sys.argv[1], sys.argv[2])
