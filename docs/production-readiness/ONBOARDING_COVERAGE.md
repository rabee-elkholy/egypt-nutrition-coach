# Onboarding coverage investigation

The frozen full run rejected 18 of 100 initial profiles. All original drafts and errors remain intact. These are product-coverage rejections, not successful onboarding and not automatically clinical defects.

A controlled local domain sweep tried three alternate seeds with unchanged preferences, then separate budget-only and requested meal-count-only probes. No real account, production data, preference or source was changed. This is current-generator feasibility evidence, not a byte-identical replay of the original HTTP requests or a clinical validation oracle.

One rejected persona (user-089, vegan/low-budget/Levant) generated with one of three alternate seeds. This establishes seed sensitivity in the finite search; it does not prove that all other failed profiles are infeasible. Seven additional personas generated with a medium/high budget in the sampled single-change probes. Increasing a budget requires an explicit user choice; the system must not silently relax it. Ten personas had no observed feasible alternative in these probes.

Requested meal-count changes may be ignored by fixed diet policy. user-089 still adopted four meals across its successful probes, so these outcomes cannot be represented as evidence that changing meal count solved its original rejection. Every attempt records requested and adopted settings separately.

Next implementation work: reproduce the original seed-sensitive path exactly, investigate bounded search without weakening constraints, improve affordable diet/region coverage, and expose factual actionable coverage errors to KMM. Preserve safety, exclusions and medical restrictions throughout. No automatic fallback diet or budget increase is authorized by a failed generation request.

Evidence: evidence/onboarding-coverage-sweep.json, its retained source text and captured command. Successful generation here means only that implemented production checks completed. Product target tolerances, clinical suitability and specialist review remain separate gates.
