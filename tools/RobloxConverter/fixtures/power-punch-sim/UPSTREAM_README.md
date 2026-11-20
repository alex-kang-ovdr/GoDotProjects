# 👊 Power Punch Simulator

A complete Roblox clicker/simulator game built **100% in code** — the map, the UI, the economy, everything is generated from Luau source. No manual Studio editing. Managed with [Rojo](https://rojo.space) so the whole game lives in this repo.

[![CI](https://github.com/LILRINO71/power-punch-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/LILRINO71/power-punch-simulator/actions/workflows/ci.yml)

## The game

Punch to gain **Power** 💪 and **Coins** 🪙 → buy gear that multiplies your punches → unlock stronger training zones (Beach → City → Volcano → Space) → **Rebirth** to reset with a permanent multiplier → climb the cross-server global leaderboard.

- **4 unlockable zones + a VIP island**, procedurally built by [MapBuilder](src/server/MapBuilder.luau) from [Config](src/shared/Config.luau)
- **6 gear tiers** (Foam Gloves → Void Knuckles, up to x200)
- **Rebirth system** with exponential cost scaling and permanent bonuses
- **Persistent data** (DataStore with retries, autosave, and graceful Studio fallback)
- **Global top-10 leaderboard** on a physical board (OrderedDataStore)
- **Monetization**: 4 gamepasses (2x Power, 2x Coins, Auto Train, VIP Island) + 3 coin-pack developer products
- **Server-authoritative everywhere**: punch rate limiting, zone bonuses validated against real position + power, all purchases granted server-side

## Architecture

```
src/
├── shared/            # replicated to both sides
│   ├── Config.luau    # every tunable number: balance, zones, gear, product IDs
│   └── Formulas.luau  # pure math shared by server (authority) and client (display)
├── server/
│   ├── init.server.luau      # entry: creates remotes, wires services (explicit DI)
│   ├── Data.luau             # profiles, DataStore, leaderstats, autosave
│   ├── Training.luau         # punch loop, rate limiting, zone validation, Auto Train
│   ├── Shop.luau             # gear purchases + rebirths (server-validated)
│   ├── Monetization.luau     # gamepass cache + ProcessReceipt
│   ├── MapBuilder.luau       # builds the entire world from Config
│   └── GlobalLeaderboard.luau
└── client/
    ├── init.client.luau
    ├── UI.luau        # tiny declarative UI toolkit + window manager
    ├── Hud.luau       # stat pills, TRAIN button, menu
    ├── ShopUi.luau    # gear tab + robux tab
    ├── RebirthUi.luau
    ├── Effects.luau   # popups, toasts, sounds
    └── ZoneGates.luau # client-side gate unlocking (server validates the bonus)
```

**Security model:** the client is only ever a *view*. It fires intent ("I punched", "buy gear 3") and renders replicated state (leaderstats + attributes). The server recomputes every multiplier, enforces the punch cooldown, checks gear order and costs, and validates zone bonuses against the character's actual position — so exploiters gain nothing by firing remotes directly.

## Run it locally

1. Install [Roblox Studio](https://create.roblox.com/) and [Rojo](https://rojo.space/docs/v7/getting-started/installation/) (or use `tools/rojo.exe` if present)
2. Build the place file:
   ```
   rojo build default.project.json -o build/PowerPunchSimulator.rbxl
   ```
3. Open the `.rbxl` in Studio and hit **Play**

For live-sync development instead: `rojo plugin install` once, then `rojo serve` and connect from Studio's Rojo plugin.

> DataStores and gamepasses are silently disabled in unpublished local playtests — the game detects this and runs with in-memory data.

## Enabling monetization

1. Publish the game (File → Publish to Roblox)
2. Creator Dashboard → your experience → **Monetization**:
   - Create 4 **Passes**: 2x Power (199 R$), 2x Coins (199 R$), Auto Train (349 R$), VIP (499 R$)
   - Create 3 **Developer Products**: 25K Coins (49 R$), 150K Coins (199 R$), 1M Coins (799 R$)
3. Paste the IDs into `Config.GamePasses` / `Config.DevProducts` in [Config.luau](src/shared/Config.luau)
4. Game Settings → Security → enable **Studio Access to API Services** (for DataStores in Studio)

Items with an ID of `0` are hidden from the shop automatically, so the game is fully playable before this step.

## Roadmap

- [ ] Pets: hatch from eggs, equip for multipliers (the big retention + monetization system)
- [ ] Daily rewards + playtime prizes
- [ ] Robust receipt dedupe via DataStore-backed purchase history
- [ ] Trails/aura cosmetics for big rebirth milestones
- [ ] Quests ("punch 1,000 times in the Volcano")
- [ ] Publish via Open Cloud from CI (push-to-deploy)
