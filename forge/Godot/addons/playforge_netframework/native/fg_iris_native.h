#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include <godot_cpp/variant/string.hpp>
#include <godot_cpp/variant/vector2.hpp>

namespace godot {

// Iris-style C++ GDExtension replication hotpath (Roadmap 26).
// - Wire-compatible with GDScript FgReplicationClient (magic 'PF', 15-byte header).
// - Main thread performs single immutable snapshot capture per tick (capture_tick).
// - Worker threads read only immutable captured snapshots (zero Godot Node access)
//   to build per-connection filtered, prioritized, budgeted binary packets.
class FgIrisNativeServer : public RefCounted {
	GDCLASS(FgIrisNativeServer, RefCounted);

public:
	static constexpr uint8_t MAGIC_0 = 0x50; // 'P'
	static constexpr uint8_t MAGIC_1 = 0x46; // 'F'
	static constexpr uint8_t MSG_SPAWN_OR_FULL = 1;
	static constexpr uint8_t MSG_DELTA = 2;
	static constexpr uint8_t MSG_TOMBSTONE = 3;
	static constexpr uint8_t MSG_DESPAWN_INTEREST = 4;
	static constexpr uint8_t MSG_STORAGE_ACK = 5;
	static constexpr uint8_t MSG_FULL_REFRESH_REQ = 6;

	static constexpr uint8_t ACK_FLAG_LIFECYCLE = 1;
	static constexpr uint8_t ACK_FLAG_TOMBSTONE = 2;

	static constexpr uint32_t BIT_POS = 1u << 0;
	static constexpr uint32_t BIT_ROT = 1u << 1;
	static constexpr uint32_t BIT_HEALTH = 1u << 2;
	static constexpr uint32_t BIT_INVENTORY = 1u << 3;
	static constexpr uint32_t BIT_OWNER_SECRET = 1u << 4;
	static constexpr uint32_t MASK_PUBLIC = BIT_POS | BIT_ROT | BIT_HEALTH;
	static constexpr uint32_t MASK_OWNER = BIT_POS | BIT_ROT | BIT_HEALTH | BIT_INVENTORY | BIT_OWNER_SECRET;
	static constexpr uint32_t MAX_HISTORY = 16;

	struct QuantizedSnap {
		uint32_t revision = 0;
		uint32_t tick = 0;
		uint32_t dirty_mask = 0;
		int32_t cell_x = 0;
		int32_t cell_y = 0;
		uint16_t rem_x = 0;
		uint16_t rem_y = 0;
		uint16_t rot_u16 = 0;
		uint16_t health_u16 = 0;
		std::string owner_secret;
		std::vector<uint8_t> inv_encoded; // pre-encoded keyed collection payload (6B empty default)
	};

	struct ObjectSlot {
		uint32_t index = 0;
		uint32_t generation = 0;
		uint32_t owner_peer_id = 0;
		float priority = 1.0f;
		float pos_x = 0.0f;
		float pos_y = 0.0f;
		uint8_t owner_only = 0;
		uint8_t alive = 0;
		uint8_t dormant = 0;
		uint8_t dirty_queued = 0;
		uint32_t current_revision = 0;
		uint32_t tombstone_revision = 0;
		uint32_t pending_dirty_mask = 0;
		uint32_t last_changed_tick = 0;
		int32_t grid_cx = 0;
		int32_t grid_cy = 0;
		QuantizedSnap pending;
		QuantizedSnap history[MAX_HISTORY];
		uint32_t history_count = 0;
		uint32_t history_head = 0; // next write slot
	};

	struct ConnObjState {
		uint32_t generation = 0;
		uint32_t acked_baseline_rev = 0;
		uint32_t synced_server_rev = 0;
		uint32_t last_sent_rev = 0;
		int32_t last_sent_tick = -1;
		uint8_t lifecycle_acked = 0;
		uint8_t force_full = 1;
		uint8_t last_owner_scoped = 0;
		uint8_t relevant = 0;
		uint32_t sent_revs[MAX_HISTORY * 2] = {};
		uint32_t sent_rev_count = 0;
		uint32_t sent_rev_head = 0;
	};

	struct PendingTombstone {
		uint32_t index = 0;
		uint32_t generation = 0;
		uint32_t tombstone_revision = 0;
	};

	struct ConnectionState {
		uint32_t conn_id = 0;
		float vp_x = 0.0f;
		float vp_y = 0.0f;
		bool has_viewpoint = false;
		// Dense table indexed by object slot index for O(1) lookup without hash overhead.
		std::vector<ConnObjState> obj_states;
		std::vector<uint32_t> active_indices; // indices where obj_states[idx].relevant == 1
		std::vector<PendingTombstone> pending_tombstones;
		uint64_t bytes_sent = 0;
		uint64_t packets_sent = 0;
		// Per-connection scratch output written exclusively by the connection's worker thread.
		std::vector<uint8_t> out_flat;
		uint32_t out_pkt_count = 0;
		uint64_t out_full = 0;
		uint64_t out_delta = 0;
		uint64_t out_tomb = 0;
		uint64_t out_despawn = 0;
		uint64_t out_bytes = 0;
		uint64_t out_deferred = 0;
		uint64_t out_dormant_skipped = 0;
	};

private:
	uint32_t world_epoch = 1;
	uint8_t hash_prefix[8] = {};
	float cell_size = 64.0f;
	uint32_t budget_bytes_per_tick = 6400;
	uint32_t max_datagram_bytes = 1000;
	uint32_t worker_threads = 4;

	bool spatial_enabled = false;
	float enter_radius = 400.0f;
	float exit_radius = 450.0f;
	uint32_t max_wait_ticks = 60;

	std::vector<ObjectSlot> slots;
	std::vector<uint32_t> free_indices;
	std::vector<uint32_t> dirty_indices;
	std::vector<uint32_t> alive_indices;
	std::vector<uint32_t> recently_destroyed;

	// Spatial hash grid (cell_size = max(enter_radius, 1.0f)) rebuilt/updated on main thread.
	float grid_cell_size = 400.0f;
	std::unordered_map<int64_t, std::vector<uint32_t>> spatial_grid;
	bool spatial_grid_dirty = true;

	std::vector<ConnectionState> conns;
	std::unordered_map<uint32_t, size_t> conn_index_map;

	uint64_t stat_full_sent = 0;
	uint64_t stat_delta_sent = 0;
	uint64_t stat_tombstones_sent = 0;
	uint64_t stat_despawns_sent = 0;
	uint64_t stat_acks_accepted = 0;
	uint64_t stat_forged_acks_rejected = 0;
	uint64_t stat_refresh_requests = 0;
	uint64_t stat_malformed_inbound = 0;
	uint64_t stat_bytes_sent = 0;
	uint64_t stat_budget_deferred = 0;
	uint64_t stat_dormant_skipped = 0;
	uint64_t last_capture_us = 0;
	uint64_t last_build_us = 0;

	static int64_t _grid_key(int32_t cx, int32_t cy) {
		return (static_cast<int64_t>(cx) << 32) ^ static_cast<uint32_t>(cy);
	}
	void _rebuild_spatial_grid();
	void _quantize_pos(float x, float y, int32_t &r_cx, int32_t &r_cy, uint16_t &r_rx, uint16_t &r_ry) const;
	static uint16_t _quantize_rot(float angle);
	static const QuantizedSnap *_find_history(const ObjectSlot &slot, uint32_t rev);
	static bool _has_sent_rev(const ConnObjState &cobj, uint32_t rev);
	static void _record_sent_rev(ConnObjState &cobj, uint32_t rev);
	void _build_for_connection(ConnectionState &c, uint32_t server_tick) const;
	void _append_header(std::vector<uint8_t> &buf, uint8_t msg_type) const;
	bool _encode_full(const ObjectSlot &slot, const QuantizedSnap &snap, uint32_t allowed_mask, std::vector<uint8_t> &out) const;
	bool _encode_delta(const ObjectSlot &slot, const QuantizedSnap &snap, uint32_t base_rev, uint32_t dirty_mask, std::vector<uint8_t> &out) const;
	void _encode_tombstone(uint32_t idx, uint32_t gen, uint32_t tomb_rev, std::vector<uint8_t> &out) const;
	void _encode_despawn(uint32_t idx, uint32_t gen, uint32_t rev, std::vector<uint8_t> &out) const;
	void _run_tick_build(uint32_t server_tick);

protected:
	static void _bind_methods();

public:
	FgIrisNativeServer() = default;
	~FgIrisNativeServer() override = default;

	void configure(int64_t p_world_epoch, const PackedByteArray &p_hash_prefix, double p_cell_size, int64_t p_budget_bytes_per_tick, int64_t p_max_datagram_bytes, int64_t p_worker_threads);
	void set_spatial_filter(bool p_enabled, double p_enter_radius, double p_exit_radius, int64_t p_max_wait_ticks);
	void add_connection(int64_t p_conn_id);
	void remove_connection(int64_t p_conn_id);
	void set_viewpoint(int64_t p_conn_id, const Vector2 &p_pos);

	Dictionary register_object(const Vector2 &p_pos, double p_rot, int64_t p_health, int64_t p_owner_peer_id, double p_priority, bool p_owner_only, const String &p_owner_secret, int64_t p_server_tick);
	bool set_object_transform_health(int64_t p_index, int64_t p_generation, const Vector2 &p_pos, double p_rot, int64_t p_health);
	bool set_object_owner(int64_t p_index, int64_t p_generation, int64_t p_new_owner_peer_id);
	bool set_object_dormant(int64_t p_index, int64_t p_generation, bool p_dormant);
	Dictionary destroy_object(int64_t p_index, int64_t p_generation, int64_t p_server_tick);

	int64_t capture_tick(int64_t p_server_tick);
	Dictionary build_packets_for_tick(int64_t p_server_tick);
	PackedByteArray build_packets_for_tick_flat(int64_t p_server_tick);
	Dictionary handle_client_packet(int64_t p_conn_id, const PackedByteArray &p_raw);
	int64_t ack_all_sent_for_benchmark();
	Dictionary get_stats() const;
};

} // namespace godot
