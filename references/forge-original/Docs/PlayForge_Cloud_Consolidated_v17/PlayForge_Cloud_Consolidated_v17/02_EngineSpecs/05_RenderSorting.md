# Unity-style Render Sorting — DESIGN

2D: stable SortingLayer ID + display name + ordered rank, OrderInLayer, SortingGroup for multipart sprites. Support camera-specific transparency sort mode (distance, camera forward depth, custom axis).

Material render queue conventions: Background=1000, Geometry=2000, AlphaTest=2450, Transparent=3000, Overlay=4000. These are conventions; Render Graph passes and depth test define actual execution. Opaque sorting optimizes depth and PSO/material batching; Transparent sorts back-to-front plus explicit priority and stable tie-breaker. UI Canvas supports Overlay, Camera, World modes and sorting order.

Never assume one global comparator works for all passes. Debug modes: SortingLayerColoration, QueueColoration, TransparencyOrder, Overdraw. SortingLayer references must survive rename.
