# Uncertainty comes from a measured resolution ladder and DEM clones, not from fitted formulas

Most Sites have no 5 m elevation data, so their real micro-terrain shadows are unknown. Following Eduardo's idea, we treat that as probability rather than inventing terrain: the engine computes each Site's metrics at 240, 80 and 20 m (and 5 m where it exists), so the drop between resolutions is measured per Site, and it builds an uncertainty band by perturbing the DEM with the Barker et al. 2021 error model (ε = a·R + b·S + c), as that paper did with 100 DEM clones. P50, P90 and P99 are the edges of that band the user picks, by mission class.

## Considered Options

- **Machine learning to synthesise 5 m terrain:** rejected; impact craters at one site say nothing about boulders at another, so the output would be fictional terrain.
- **The fitted formulas in Eduardo's 08/11 draft** (day gains per battery hour, the 0.65 and 0.012·S factors, the exponential mast factor): rejected because no paper supports their coefficients. Only the Barker ε formula is published, and even it is calibrated on a single site.

## Consequences

- The 5 m DEM itself is about 90 % interpolated, so it is a better estimate, not ground truth; validation cannot treat it as the reference.

Status note, 15/11/2026 (decided by Luiz): a typed point past the 80 m DEM's square (between about 83.3°S and 80°S) is answered with the 60 m DEM `LDEM_60S_60MPP_ADJ` where the 80 m one would be. Its answer is the "80" rung of the Resolution ladder, and `provenance.dems` names the real product. The 60 m product has no per-pixel error in our data, so the Uncertainty band lists it in `uncovered` and does not vary its heights (ADR 0006).
