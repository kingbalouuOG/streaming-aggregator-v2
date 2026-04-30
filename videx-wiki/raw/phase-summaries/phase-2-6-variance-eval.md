# Phase 2.6 — Bottom-Half Variance Eval

**Date:** 2026-04-13
**Services evaluated:** 13
**Bottom-N:** 6 (least-similar half of 12 pairwise similarities)

## Per-Service Results

| Service | v1 bottom-6 variance | v2 bottom-6 variance | Δ | Improved? |
|---------|---------------------|---------------------|---|----------|
| apple | 0.001879 | 0.002473 | +0.000594 | YES |
| bbc | 0.002344 | 0.002800 | +0.000456 | YES |
| channel4 | 0.001799 | 0.001597 | -0.000202 | no |
| discovery | 0.002131 | 0.001717 | -0.000414 | no |
| disney | 0.003226 | 0.002935 | -0.000291 | no |
| itvx | 0.003198 | 0.002594 | -0.000604 | no |
| mubi | 0.001952 | 0.002547 | +0.000594 | YES |
| netflix | 0.003300 | 0.002960 | -0.000340 | no |
| now | 0.001650 | 0.001435 | -0.000215 | no |
| paramount | 0.002171 | 0.002115 | -0.000056 | no |
| plutotv | 0.001334 | 0.001671 | +0.000338 | YES |
| prime | 0.002607 | 0.002420 | -0.000187 | no |
| skygo | 0.002282 | 0.002426 | +0.000144 | YES |

## Summary

| Metric | Value |
|--------|-------|
| Mean v1 variance | 0.002298 |
| Mean v2 variance | 0.002284 |
| Mean delta | -0.000014 |
| Services improved | 5 / 13 |
| **Gate (>= 8)** | **FAIL** |
