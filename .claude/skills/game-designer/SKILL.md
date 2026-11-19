---
name: game-designer
description: "Design, critique, document, prototype, balance, or validate game mechanics and systems. Use for player fantasy, core loops, controls, progression, economy, encounters, levels, difficulty, onboarding, retention, design handoffs, and playtest-driven iteration, including designs constrained for low-end PCs. Do not use as the primary skill for implementing engine code, fixing builds, creating final art, product UI, marketing, or generic game recommendations."
---

# Game Designer

Turn an idea into a testable player experience and an executable handoff. Preserve the user's genre, audience, platform, camera, tone, scope, and requested format.

## Establish The Design Problem

Inspect the current game, design documents, telemetry, playtest notes, maps, data, and relevant code before treating an existing project as a blank slate.

Resolve only decisions that change the requested result:

- player fantasy and intended emotion;
- repeated player actions and feedback loop;
- design hypothesis and observable behavior;
- success, failure, progress, pressure, and recovery;
- audience, input method, session length, and accessibility needs;
- content, production, and performance constraints;
- the smallest playable slice that can answer the current question.

Ask a focused question only when plausible answers would create materially different designs. Otherwise state the assumption and continue.

## Design A Testable System

For each requested mechanic or system:

1. Define player input or decision.
2. Define game state, rules, response, feedback, and consequence.
3. Identify dependencies and interactions with existing systems.
4. Separate fixed rules from tunable values.
5. Cover normal, edge, failure, recovery, and exploit paths that matter to the mechanic.
6. Define the smallest greybox or simulation that exercises it.
7. Define what to observe, measure, and decide after the test.

## Design For Low-End PCs

Treat performance as a design constraint, not a late engineering cleanup. Make cost drivers explicit (active AI, physics bodies, projectiles, VFX, lights, shadows, audio voices, UI updates) and define graceful fallback presentation. Never claim a design fits weak PCs from intuition alone without profiling a representative build.

## Balance And Progression

Define tunable ranges and expected behavioral effects before choosing exact values. Change one meaningful dimension at a time when isolating causality. For economies and progression, make sources, sinks, pacing, gates, failure recovery, and dominant-strategy risks explicit.

## Create An Executable Handoff

Adapt the format to the user's request. Include intent, rules/states/transitions/tunable parameters, required content and technical touchpoints, performance budgets, acceptance scenarios, explicit exclusions, and open decisions.

## Validate

Match evidence to the claim and distinguish `verified`, `candidate`, `not yet playtested`, and `externally blocked`. Never rename a concept, document, greybox plan, or unplayed implementation as a validated game feature.
