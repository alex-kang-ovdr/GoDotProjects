**Français** · [English](#english)

# War Tycoon (Roblox)

Un « War Tycoon » pour Roblox écrit en Luau : chaque joueur a une base, un distributeur d'argent produit des billets, on achète des armes et des tourelles, et chaque élimination rapporte de l'argent. Le projet utilise [Rojo](https://rojo.space) pour synchroniser le code avec Roblox Studio.

## Utilisation
1. Installez [Rojo](https://rojo.space/docs) (et son plugin pour Roblox Studio).
2. Dans ce dossier : `rojo serve`
3. Dans Roblox Studio, ouvrez le plugin Rojo et connectez-vous.

## Réglages
Tout se modifie dans `src/shared/Config.luau` : argent de départ, récompense par élimination, nombre et taille des bases, délai de réapparition, cadence du distributeur, portée et cadence des tourelles, couleurs d'équipe, armes et boutiques.

## Structure
- `src/shared/Config.luau` : réglages.
- `src/server/` : `main.server.luau` (monde et joueurs), `Tycoon` (bases), `Economy` (argent, éliminations), `Combat` (dégâts), `Weapons`, `Props`, `Scenery`, `Atmosphere`, `Fx`.
- `src/client/main.client.luau` : interface côté joueur.

## Licence
[MIT](LICENSE).

---

# English

# War Tycoon (Roblox)

A "War Tycoon" for Roblox written in Luau: each player gets a base, a dropper produces cash, you buy weapons and turrets, and every elimination earns money. The project uses [Rojo](https://rojo.space) to sync the code with Roblox Studio.

## Usage
1. Install [Rojo](https://rojo.space/docs) (and its Roblox Studio plugin).
2. In this folder: `rojo serve`
3. In Roblox Studio, open the Rojo plugin and connect.

## Settings
Everything is changed in `src/shared/Config.luau`: starting cash, reward per elimination, number and size of bases, respawn time, dropper rate, turret range and rate, team colors, weapons and shops.

## Structure
- `src/shared/Config.luau`: settings.
- `src/server/`: `main.server.luau` (world and players), `Tycoon` (bases), `Economy` (cash, eliminations), `Combat` (damage), `Weapons`, `Props`, `Scenery`, `Atmosphere`, `Fx`.
- `src/client/main.client.luau`: player-side interface.

## License
[MIT](LICENSE).
