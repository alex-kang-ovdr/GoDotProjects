# 99 Nights in the Forest — Game Reference

**Research checked:** 2026-09-25 · **Platform:** Roblox · **Developer:** Grandma's Favourite Games
**Official experience:** [99 Nights in the Forest](https://www.roblox.com/games/79546208627805/99-Nights-in-the-Forest)

## Overview

*99 Nights in the Forest* is a cooperative survival-crafting game built around a repeating day-and-night cycle. During the day, players explore a procedurally varied forest, gather resources, loot structures, hunt, craft, and prepare their camp. At night, darkness and hostile creatures make the campfire the central refuge: players can stay close to its light or risk venturing farther out for supplies and objectives. The game's long-term objective is to locate and rescue four missing children while surviving the forest.

The Roblox listing identifies Grandma's Favourite Games as the creator. In a 2026 interview, co-creator Alec Kieft described the game as an active, collaborative experience, contrasting its moment-to-moment group play with more passive incremental games. He also described the day activities—gathering wood and scrap, hunting, and searching for items—and the campfire's protective role at night. [PC Gamer interview, 2026-05-07](https://www.pcgamer.com/games/survival-crafting/with-a-peak-player-count-of-14-2-million-99-nights-in-the-forest-has-an-audience-other-multiplayer-games-would-kill-for-to-find-these-behemoth-playerbases-you-need-to-be-on-a-platform-like-roblox/)

## Core play loop

1. **Prepare and forage by day.** Chop trees, collect fuel and crafting materials, search buildings and chests, hunt animals, and improve tools and equipment.
2. **Develop the camp.** Keep the fire supplied, upgrade camp and crafting infrastructure, and build defenses and useful stations. Players have to balance fuel against materials needed for crafting and construction.
3. **Explore outward.** Use maps and landmarks to navigate, find supplies, and locate objectives. Leaving camp improves access to loot and rescue targets but increases exposure to enemies and nightfall.
4. **Survive the night.** Darkness raises the threat level. The fire gives players a readable safety boundary, while enemies and raids pressure the group to return, defend the base, or spend resources.
5. **Rescue and escalate.** The four children are held in separate locations, guarded by animals. Rescue requires exploration, combat, and a sufficiently upgraded campfire. Each rescue also accelerates the day counter and makes the remaining run more demanding.

This loop is supported by PC Gamer's survival guide (updated 2026-01-09) and missing-child guide (2025-11-27). Those guides report that child locations vary between runs, camp posters and map clues help direct the search, and rescues alter the pace of the day counter. Specific campfire levels, enemy counts, and item recipes in those guides are version-dependent and should be checked in-game before treating them as current rules. [Survival guide](https://www.pcgamer.com/games/roblox/99-nights-in-the-forest-tips/) · [Missing-child guide](https://www.pcgamer.com/games/roblox/99-nights-in-the-forest-missing-kid-locations/)

## Pressure and progression

- **A changing safe zone:** The campfire is both a survival resource and a spatial anchor. Its light makes safety legible, and tending it creates recurring work for the group.
- **Risk versus reward:** Daytime exploration yields fuel, tools, and loot, but costs time and can leave players far from safety at night. Choosing when to turn back is a central decision.
- **Threat variety:** The Deer is the signature nighttime threat. Other forest creatures, including the Owl in the cited guides, create different forms of pressure. Cultists occupy locations and can raid the camp, shifting combat from exploration to defense.
- **Layered goals:** Immediate needs (fuel, food, healing, equipment) coexist with medium-term camp upgrades and the long-term rescue objective. Campfire upgrades gate access to farther objectives and imply readiness thresholds.
- **Shared work:** Several players can divide gathering, exploration, combat, and camp defense, while regrouping remains important when danger rises. This supports conversation during routine tasks and coordination during emergencies.
- **Run variation:** Procedural placement and variable loot make route planning uncertain. The same objective can require different travel and preparation from one run to another.

## Design takeaways for a forest-survival project

1. **Make the main objective visible early.** A simple rescue board or map can turn a broad survival sandbox into a legible expedition without forcing a linear quest sequence.
2. **Let one system connect survival and exploration.** A campfire that provides safety, consumes gathered fuel, supports upgrades, and unlocks outward progress gives players a clear reason to return to camp.
3. **Use day/night as a decision clock.** The cycle is strongest when players can estimate remaining time and choose whether to finish one more task or head home; avoid making darkness an unpredictable instant failure.
4. **Escalate through player choices.** Rescue milestones and stronger areas can increase pressure, so progress feels consequential. Signal the added danger before the player commits.
5. **Give threats distinct counterplay.** A pursuer, a swooping ambusher, and a camp raider create more interesting play than several enemies that only chase and damage the player.
6. **Design cooperative roles around useful jobs.** Resource gathering, navigation, crafting, defense, and rescue should all matter, but a solo player should still be able to make progress.
7. **Keep downtime purposeful.** Gathering and base work allow social play; short disruptions, discoveries, and preparation choices keep those stretches from becoming empty waiting.

These are design observations drawn from the sources above, not claims about the original developers' internal design intent. Use them as high-level reference; do not reproduce Roblox-specific characters, names, art, audio, UI, or text.

## Source notes and confidence

- [Official Roblox experience page](https://www.roblox.com/games/79546208627805/99-Nights-in-the-Forest) — primary source for title and creator attribution. Roblox's public page may require JavaScript or login for live details.
- [PC Gamer developer interview (2026-05-07)](https://www.pcgamer.com/games/survival-crafting/with-a-peak-player-count-of-14-2-million-99-nights-in-the-forest-has-an-audience-other-multiplayer-games-would-kill-for-to-find-these-behemoth-playerbases-you-need-to-be-on-a-platform-like-roblox/) — interview with co-creator Alec Kieft; useful for high-level loop, collaboration, and development context.
- [PC Gamer survival guide (updated 2026-01-09)](https://www.pcgamer.com/games/roblox/99-nights-in-the-forest-tips/) — practical account of camp, crafting, enemies, and preparation; secondary source and subject to game updates.
- [PC Gamer missing-child guide (2025-11-27)](https://www.pcgamer.com/games/roblox/99-nights-in-the-forest-missing-kid-locations/) — practical account of rescue progression and procedural variation; secondary source and subject to game updates.

**Scope note:** This is a high-level game-design reference, not a complete or guaranteed-current mechanics database. Live balance, content, class prices, recipes, and enemy behaviors can change with Roblox updates.
