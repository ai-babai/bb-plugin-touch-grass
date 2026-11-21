---
type: Development Guide
description: Reproduce the plugin’s quality checks and interpret the scores and coverage baseline.
created: "2026-11-22"
---

# Quality checks

Run `npm ci`, then `npm run quality`. Use the checkout of a real Git clone with its base branch available. The default baseline is `archive/fireflies-v1`. For a change on its own branch use `npm run quality -- --base origin/main`.

| Check | Passing result |
| --- | --- |
| TypeScript | No compiler errors |
| Cyclomatic complexity | At most 10 per function, ESLint classic |
| Cognitive complexity | At most 15 per function, SonarJS |
| CRAP | Mean below 5 and maximum at most 30 |
| Changed-line coverage | At least 80% of changed executable lines |
| Circular dependencies | None among production modules |
| Browser and property tests | All pass |
| Selected mutations | Each change must be caught by a failed assertion |

The scope is the plugin's production TypeScript and TSX. The browser scenarios exercise the real plugin entry points inside a simulated BB chat. They include touchscreen gestures, reduced motion, regrowth, fireflies, bee pollination and per-thread persistence. The property and mutation tests target the server’s cache and tool metrics. The coverage report uses Istanbul instrumentation at original TypeScript positions. CRAP uses executed statement-line coverage inside each function, excluding nested functions. The calculation is `complexity² × (1 − coverage)³ + complexity`. Diff coverage uses changed executable statement lines since the merge base, including local additions. Run the gate again after editing. The current report is written to `coverage/quality-report.txt`.

In review, keep each module responsible for one part of the game, express each rule once, and add abstractions when more than one real caller needs them. The checks catch regressions in measurable behavior. Review the movement and feel of the game in BB as well.
