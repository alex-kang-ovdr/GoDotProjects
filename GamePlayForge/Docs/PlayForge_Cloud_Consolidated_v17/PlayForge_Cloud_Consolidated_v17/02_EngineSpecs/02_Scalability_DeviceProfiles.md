# Scalability / Device Profiles — DESIGN

Quality groups: Resolution, ViewDistance, Shadow, Texture, Effects, PostProcess, AntiAliasing, Foliage. Levels 0..3 (Low, Medium, High, Epic). Group setting maps to explicit engine CVars, not opaque values.

Profiles: Default -> Windows / Android / IOS / LinuxServer; subprofiles WindowsLow/High, AndroidLow/Mid/High, IOSLow/High. Profile inheritance must detect cycles and missing parents. Selection rules use GPU capabilities, VRAM/RAM, GPU vendor/model, OS and device features, with deterministic fallback. Profile values are defaults; hard hardware constraints are a separate capability validation layer.

PIE can simulate quality/profile values but cannot emulate unavailable physical GPU features. Persist user preferences separately from project defaults. RHI selection at process startup only.
