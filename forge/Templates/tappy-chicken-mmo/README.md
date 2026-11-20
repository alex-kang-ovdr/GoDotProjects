# Tappy Chicken MMO

Drop-in multiplayer edition of Tappy Chicken for Godot 4.7 and PlayForge.

## Core Design

- **Unchanged Local Gameplay**: Your own flight curve (`Timeline_FlapUp`), input, collisions, score, sound effects, and best score (`user://tappy_chicken_mmo_scores.cfg`) run locally with zero network delay. Other players never collide with or block your bird.
- **Seamless Drop-In (난입)**: The MMO world is always live. Clients can join or leave at any moment without waiting in a lobby. All clients share a deterministic `course_seed` so pipes align across players at the same `run_distance`.
- **50% Transparent Ghosts**: Other nearby players' chickens and actions (flaps, flight arcs, crashes, restarts) render behind your chicken at exact `50%` opacity (`modulate.a = 0.5`).
- **Server-Mediated Spatial Interest RPC Multicast**:
  1. Each client sends its own gameplay events (`join`, `flap`, `phase`, `sync`, `leave`) to the server via RPC (`rpc_server_player_event`).
  2. The server tracks each client's horizontal course progress (`run_distance`) and computes the nearby Area of Interest (`proximity_radius = 520px`, leave hysteresis `+60px`).
  3. The server multicasts events **only** to clients inside that proximity window (`rpc_client_multicast_event.rpc_id(target_peer_id, ...)`). Distant clients receive zero packets for faraway players.
  4. When a peer enters or leaves proximity, the server automatically sends symmetric sync or removal (`rpc_client_peer_removed`) RPCs.

## Running in Native Godot 4.7

- **Auto Host-or-Join (Default)**: Launch two or more instances of this project. Instance 1 automatically hosts an `ENetMultiplayerPeer` server on port `7788` (while playing locally), and Instance 2+ automatically drops in as a client.
- **Dedicated Server**:
  ```powershell
  Godot_v4.7.2-stable_win64.exe --headless --path . -- --server --port=7788 --proximity=520
  ```
- **Explicit Client**:
  ```powershell
  Godot_v4.7.2-stable_win64.exe --path . -- --connect=127.0.0.1:7788 --name=Player2
  ```
- **Offline Solo**:
  ```powershell
  Godot_v4.7.2-stable_win64.exe --path . -- --offline
  ```

## Running in PlayForge Multiplayer Workspace

Open the PlayForge server (`node forge/server.cjs`) and launch:
`http://127.0.0.1:4173/OfficialGodot/multiplayer.html?template=tappy-chicken-mmo`
Click **+ 클라이언트** to drop in additional players immediately into the same live MMO world.
