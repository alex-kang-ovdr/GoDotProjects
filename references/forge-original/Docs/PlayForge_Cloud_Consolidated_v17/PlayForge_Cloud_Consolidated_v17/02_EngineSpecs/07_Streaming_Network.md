# Streaming / Networking — DESIGN

World Partition streams actor cells from local cooked packages with async collision preparation; texture streaming only streams mip residency. No actor-level asset streaming subsystem and no runtime CDN. Teleport waits for destination collision cells, safe spawn validation and atomic move. Initial replication barrier waits for client-required objects/states and collision, ClientReady ACK, then StartPlay.

Server authoritative, Iris-inspired descriptors/dirty tracking, per-connection baselines, priority/bandwidth budgets, physics interpolation. Listen server uses ONE authoritative Server World, no separate loopback Client World for host. EOS for social/session/voice on supported platforms; do not assume EAC works on mobile.
