#include "fg_iris_native.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <thread>

#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/array.hpp>

namespace godot {

namespace {

constexpr double kTau = 6.28318530717958647692;

inline void put_u8(std::vector<uint8_t> &b, uint8_t v) {
	b.push_back(v);
}

// Godot StreamPeerBuffer default endianness is little-endian!
inline void put_u16_le(std::vector<uint8_t> &b, uint16_t v) {
	b.push_back(static_cast<uint8_t>(v & 0xFFu));
	b.push_back(static_cast<uint8_t>((v >> 8) & 0xFFu));
}

inline void put_u32_le(std::vector<uint8_t> &b, uint32_t v) {
	b.push_back(static_cast<uint8_t>(v & 0xFFu));
	b.push_back(static_cast<uint8_t>((v >> 8) & 0xFFu));
	b.push_back(static_cast<uint8_t>((v >> 16) & 0xFFu));
	b.push_back(static_cast<uint8_t>((v >> 24) & 0xFFu));
}

inline void put_i32_le(std::vector<uint8_t> &b, int32_t v) {
	put_u32_le(b, static_cast<uint32_t>(v));
}

inline uint32_t get_u32_le(const uint8_t *p) {
	return static_cast<uint32_t>(p[0]) |
			(static_cast<uint32_t>(p[1]) << 8) |
			(static_cast<uint32_t>(p[2]) << 16) |
			(static_cast<uint32_t>(p[3]) << 24);
}

} // namespace

void FgIrisNativeServer::_bind_methods() {
	ClassDB::bind_method(D_METHOD("configure", "world_epoch", "hash_prefix", "cell_size", "budget_bytes_per_tick", "max_datagram_bytes", "worker_threads"), &FgIrisNativeServer::configure, DEFVAL(64.0), DEFVAL(6400), DEFVAL(1000), DEFVAL(4));
	ClassDB::bind_method(D_METHOD("set_spatial_filter", "enabled", "enter_radius", "exit_radius", "max_wait_ticks"), &FgIrisNativeServer::set_spatial_filter, DEFVAL(400.0), DEFVAL(450.0), DEFVAL(60));
	ClassDB::bind_method(D_METHOD("add_connection", "conn_id"), &FgIrisNativeServer::add_connection);
	ClassDB::bind_method(D_METHOD("remove_connection", "conn_id"), &FgIrisNativeServer::remove_connection);
	ClassDB::bind_method(D_METHOD("set_viewpoint", "conn_id", "pos"), &FgIrisNativeServer::set_viewpoint);
	ClassDB::bind_method(D_METHOD("register_object", "pos", "rot", "health", "owner_peer_id", "priority", "owner_only", "owner_secret", "server_tick"), &FgIrisNativeServer::register_object);
	ClassDB::bind_method(D_METHOD("set_object_transform_health", "index", "generation", "pos", "rot", "health"), &FgIrisNativeServer::set_object_transform_health);
	ClassDB::bind_method(D_METHOD("set_object_owner", "index", "generation", "new_owner_peer_id"), &FgIrisNativeServer::set_object_owner);
	ClassDB::bind_method(D_METHOD("set_object_dormant", "index", "generation", "dormant"), &FgIrisNativeServer::set_object_dormant);
	ClassDB::bind_method(D_METHOD("destroy_object", "index", "generation", "server_tick"), &FgIrisNativeServer::destroy_object);
	ClassDB::bind_method(D_METHOD("capture_tick", "server_tick"), &FgIrisNativeServer::capture_tick);
	ClassDB::bind_method(D_METHOD("build_packets_for_tick", "server_tick"), &FgIrisNativeServer::build_packets_for_tick);
	ClassDB::bind_method(D_METHOD("build_packets_for_tick_flat", "server_tick"), &FgIrisNativeServer::build_packets_for_tick_flat);
	ClassDB::bind_method(D_METHOD("handle_client_packet", "conn_id", "raw"), &FgIrisNativeServer::handle_client_packet);
	ClassDB::bind_method(D_METHOD("ack_all_sent_for_benchmark"), &FgIrisNativeServer::ack_all_sent_for_benchmark);
	ClassDB::bind_method(D_METHOD("get_stats"), &FgIrisNativeServer::get_stats);
}

void FgIrisNativeServer::configure(int64_t p_world_epoch, const PackedByteArray &p_hash_prefix, double p_cell_size, int64_t p_budget_bytes_per_tick, int64_t p_max_datagram_bytes, int64_t p_worker_threads) {
	world_epoch = static_cast<uint32_t>(std::max<int64_t>(1, p_world_epoch));
	std::memset(hash_prefix, 0, sizeof(hash_prefix));
	const int64_t n = std::min<int64_t>(8, p_hash_prefix.size());
	for (int64_t i = 0; i < n; i++) {
		hash_prefix[i] = p_hash_prefix[i];
	}
	cell_size = static_cast<float>(std::max(0.01, p_cell_size));
	budget_bytes_per_tick = static_cast<uint32_t>(std::max<int64_t>(256, p_budget_bytes_per_tick));
	max_datagram_bytes = static_cast<uint32_t>(std::clamp<int64_t>(p_max_datagram_bytes, 64, 1400));
	const unsigned hw = std::max(1u, std::thread::hardware_concurrency());
	worker_threads = static_cast<uint32_t>(std::clamp<int64_t>(p_worker_threads, 1, static_cast<int64_t>(std::min(hw, 8u))));
}

void FgIrisNativeServer::set_spatial_filter(bool p_enabled, double p_enter_radius, double p_exit_radius, int64_t p_max_wait_ticks) {
	spatial_enabled = p_enabled;
	enter_radius = static_cast<float>(std::max(1.0, p_enter_radius));
	exit_radius = static_cast<float>(std::max(static_cast<double>(enter_radius), p_exit_radius));
	max_wait_ticks = static_cast<uint32_t>(std::max<int64_t>(1, p_max_wait_ticks));
	grid_cell_size = enter_radius;
	spatial_grid_dirty = true;
}

void FgIrisNativeServer::add_connection(int64_t p_conn_id) {
	const uint32_t cid = static_cast<uint32_t>(p_conn_id);
	if (conn_index_map.find(cid) != conn_index_map.end()) {
		return;
	}
	ConnectionState cs;
	cs.conn_id = cid;
	cs.obj_states.resize(slots.size());
	conn_index_map[cid] = conns.size();
	conns.push_back(std::move(cs));
}

void FgIrisNativeServer::remove_connection(int64_t p_conn_id) {
	const uint32_t cid = static_cast<uint32_t>(p_conn_id);
	auto it = conn_index_map.find(cid);
	if (it == conn_index_map.end()) {
		return;
	}
	const size_t idx = it->second;
	const size_t last = conns.size() - 1;
	if (idx != last) {
		conns[idx] = std::move(conns[last]);
		conn_index_map[conns[idx].conn_id] = idx;
	}
	conns.pop_back();
	conn_index_map.erase(it);
}

void FgIrisNativeServer::set_viewpoint(int64_t p_conn_id, const Vector2 &p_pos) {
	auto it = conn_index_map.find(static_cast<uint32_t>(p_conn_id));
	if (it == conn_index_map.end()) {
		return;
	}
	ConnectionState &c = conns[it->second];
	c.vp_x = p_pos.x;
	c.vp_y = p_pos.y;
	c.has_viewpoint = true;
}

void FgIrisNativeServer::_quantize_pos(float x, float y, int32_t &r_cx, int32_t &r_cy, uint16_t &r_rx, uint16_t &r_ry) const {
	const double cs = static_cast<double>(cell_size);
	const double cx_d = std::floor(static_cast<double>(x) / cs);
	const double cy_d = std::floor(static_cast<double>(y) / cs);
	r_cx = static_cast<int32_t>(cx_d);
	r_cy = static_cast<int32_t>(cy_d);
	const double rx_norm = ((static_cast<double>(x) - cx_d * cs) / cs) * 65535.0;
	const double ry_norm = ((static_cast<double>(y) - cy_d * cs) / cs) * 65535.0;
	r_rx = static_cast<uint16_t>(std::clamp(static_cast<int32_t>(std::llround(rx_norm)), 0, 65535));
	r_ry = static_cast<uint16_t>(std::clamp(static_cast<int32_t>(std::llround(ry_norm)), 0, 65535));
}

uint16_t FgIrisNativeServer::_quantize_rot(float angle) {
	double norm = std::fmod(static_cast<double>(angle), kTau);
	if (norm < 0.0) {
		norm += kTau;
	}
	return static_cast<uint16_t>(std::clamp(static_cast<int32_t>(std::llround((norm / kTau) * 65535.0)), 0, 65535));
}

Dictionary FgIrisNativeServer::register_object(const Vector2 &p_pos, double p_rot, int64_t p_health, int64_t p_owner_peer_id, double p_priority, bool p_owner_only, const String &p_owner_secret, int64_t p_server_tick) {
	Dictionary out;
	if (!std::isfinite(p_pos.x) || !std::isfinite(p_pos.y) || !std::isfinite(p_rot) || p_health < 0 || p_health > 65535) {
		out["ok"] = false;
		out["reason"] = "invalid_initial_values";
		return out;
	}
	uint32_t idx = 0;
	if (free_indices.empty()) {
		idx = static_cast<uint32_t>(slots.size());
		slots.emplace_back();
		slots[idx].index = idx;
		slots[idx].generation = 1;
		for (auto &c : conns) {
			c.obj_states.resize(slots.size());
		}
	} else {
		idx = free_indices.back();
		free_indices.pop_back();
		slots[idx].generation += 1;
	}

	ObjectSlot &s = slots[idx];
	s.owner_peer_id = static_cast<uint32_t>(std::max<int64_t>(0, p_owner_peer_id));
	s.priority = static_cast<float>(std::max(0.01, p_priority));
	s.pos_x = p_pos.x;
	s.pos_y = p_pos.y;
	s.owner_only = p_owner_only ? 1 : 0;
	s.alive = 1;
	s.dormant = 0;
	s.dirty_queued = 0;
	s.current_revision = 1;
	s.tombstone_revision = 0;
	s.pending_dirty_mask = 0;
	s.last_changed_tick = static_cast<uint32_t>(std::max<int64_t>(0, p_server_tick));
	s.grid_cx = static_cast<int32_t>(std::floor(p_pos.x / grid_cell_size));
	s.grid_cy = static_cast<int32_t>(std::floor(p_pos.y / grid_cell_size));

	QuantizedSnap snap;
	snap.revision = 1;
	snap.tick = s.last_changed_tick;
	snap.dirty_mask = MASK_OWNER;
	_quantize_pos(p_pos.x, p_pos.y, snap.cell_x, snap.cell_y, snap.rem_x, snap.rem_y);
	snap.rot_u16 = _quantize_rot(static_cast<float>(p_rot));
	snap.health_u16 = static_cast<uint16_t>(p_health);
	const CharString secret_utf8 = p_owner_secret.utf8();
	snap.owner_secret.assign(secret_utf8.get_data(), static_cast<size_t>(std::min<int>(64, secret_utf8.length())));
	snap.inv_encoded.assign(6, 0); // transaction_revision=0 (4B), item_count=0 (2B)

	s.pending = snap;
	s.history[0] = std::move(snap);
	s.history_count = 1;
	s.history_head = 1;

	alive_indices.push_back(idx);
	spatial_grid_dirty = true;

	out["ok"] = true;
	out["index"] = static_cast<int64_t>(idx);
	out["generation"] = static_cast<int64_t>(s.generation);
	return out;
}

bool FgIrisNativeServer::set_object_transform_health(int64_t p_index, int64_t p_generation, const Vector2 &p_pos, double p_rot, int64_t p_health) {
	if (p_index < 0 || static_cast<size_t>(p_index) >= slots.size()) {
		return false;
	}
	ObjectSlot &s = slots[static_cast<size_t>(p_index)];
	if (!s.alive || s.generation != static_cast<uint32_t>(p_generation)) {
		return false;
	}
	if (!std::isfinite(p_pos.x) || !std::isfinite(p_pos.y) || !std::isfinite(p_rot) || p_health < 0 || p_health > 65535) {
		return false;
	}
	int32_t cx, cy;
	uint16_t rx, ry;
	_quantize_pos(p_pos.x, p_pos.y, cx, cy, rx, ry);
	const uint16_t rot_q = _quantize_rot(static_cast<float>(p_rot));
	const uint16_t hp_q = static_cast<uint16_t>(p_health);

	uint32_t mask = 0;
	if (cx != s.pending.cell_x || cy != s.pending.cell_y || rx != s.pending.rem_x || ry != s.pending.rem_y) {
		s.pending.cell_x = cx;
		s.pending.cell_y = cy;
		s.pending.rem_x = rx;
		s.pending.rem_y = ry;
		s.pos_x = p_pos.x;
		s.pos_y = p_pos.y;
		mask |= BIT_POS | BIT_ROT; // atomic group [1, 2]
		const int32_t gcx = static_cast<int32_t>(std::floor(p_pos.x / grid_cell_size));
		const int32_t gcy = static_cast<int32_t>(std::floor(p_pos.y / grid_cell_size));
		if (gcx != s.grid_cx || gcy != s.grid_cy) {
			s.grid_cx = gcx;
			s.grid_cy = gcy;
			spatial_grid_dirty = true;
		}
	}
	if (rot_q != s.pending.rot_u16) {
		s.pending.rot_u16 = rot_q;
		mask |= BIT_POS | BIT_ROT;
	}
	if (hp_q != s.pending.health_u16) {
		s.pending.health_u16 = hp_q;
		mask |= BIT_HEALTH;
	}
	if (mask != 0) {
		s.pending_dirty_mask |= mask;
		s.dormant = 0;
		if (!s.dirty_queued) {
			s.dirty_queued = 1;
			dirty_indices.push_back(s.index);
		}
	}
	return true;
}

bool FgIrisNativeServer::set_object_owner(int64_t p_index, int64_t p_generation, int64_t p_new_owner_peer_id) {
	if (p_index < 0 || static_cast<size_t>(p_index) >= slots.size()) {
		return false;
	}
	ObjectSlot &s = slots[static_cast<size_t>(p_index)];
	if (!s.alive || s.generation != static_cast<uint32_t>(p_generation)) {
		return false;
	}
	const uint32_t new_owner = static_cast<uint32_t>(std::max<int64_t>(0, p_new_owner_peer_id));
	if (s.owner_peer_id == new_owner) {
		return true;
	}
	s.owner_peer_id = new_owner;
	s.dormant = 0;
	s.pending_dirty_mask |= (BIT_INVENTORY | BIT_OWNER_SECRET);
	if (!s.dirty_queued) {
		s.dirty_queued = 1;
		dirty_indices.push_back(s.index);
	}
	return true;
}

bool FgIrisNativeServer::set_object_dormant(int64_t p_index, int64_t p_generation, bool p_dormant) {
	if (p_index < 0 || static_cast<size_t>(p_index) >= slots.size()) {
		return false;
	}
	ObjectSlot &s = slots[static_cast<size_t>(p_index)];
	if (!s.alive || s.generation != static_cast<uint32_t>(p_generation)) {
		return false;
	}
	s.dormant = p_dormant ? 1 : 0;
	return true;
}

Dictionary FgIrisNativeServer::destroy_object(int64_t p_index, int64_t p_generation, int64_t p_server_tick) {
	Dictionary out;
	if (p_index < 0 || static_cast<size_t>(p_index) >= slots.size()) {
		out["ok"] = false;
		out["reason"] = "unknown_object";
		return out;
	}
	ObjectSlot &s = slots[static_cast<size_t>(p_index)];
	if (!s.alive || s.generation != static_cast<uint32_t>(p_generation)) {
		out["ok"] = false;
		out["reason"] = "unknown_or_already_destroyed";
		return out;
	}
	const uint32_t tomb_rev = s.current_revision + 1;
	s.alive = 0;
	s.dormant = 0;
	s.dirty_queued = 0;
	s.current_revision = tomb_rev;
	s.tombstone_revision = tomb_rev;
	s.last_changed_tick = static_cast<uint32_t>(std::max<int64_t>(0, p_server_tick));
	recently_destroyed.push_back(s.index);
	// Notify connections holding this object immediately into pending_tombstones.
	for (auto &c : conns) {
		if (s.index < c.obj_states.size() && c.obj_states[s.index].relevant && c.obj_states[s.index].generation == s.generation) {
			c.obj_states[s.index].relevant = 0;
			c.pending_tombstones.push_back(PendingTombstone{ s.index, s.generation, tomb_rev });
		}
	}
	// Remove from alive_indices (swap-pop).
	auto it = std::find(alive_indices.begin(), alive_indices.end(), s.index);
	if (it != alive_indices.end()) {
		*it = alive_indices.back();
		alive_indices.pop_back();
	}
	free_indices.push_back(s.index);
	spatial_grid_dirty = true;
	out["ok"] = true;
	out["tombstone_revision"] = static_cast<int64_t>(tomb_rev);
	return out;
}

int64_t FgIrisNativeServer::capture_tick(int64_t p_server_tick) {
	const auto t0 = std::chrono::steady_clock::now();
	const uint32_t stick = static_cast<uint32_t>(std::max<int64_t>(0, p_server_tick));
	int64_t captured = 0;
	for (uint32_t idx : dirty_indices) {
		ObjectSlot &s = slots[idx];
		s.dirty_queued = 0;
		if (!s.alive || s.pending_dirty_mask == 0) {
			s.pending_dirty_mask = 0;
			continue;
		}
		uint32_t mask = s.pending_dirty_mask;
		if ((mask & (BIT_POS | BIT_ROT)) != 0) {
			mask |= (BIT_POS | BIT_ROT);
		}
		const uint32_t next_rev = s.current_revision + 1;
		s.current_revision = next_rev;
		s.last_changed_tick = stick;
		s.pending_dirty_mask = 0;

		QuantizedSnap snap = s.pending;
		snap.revision = next_rev;
		snap.tick = stick;
		snap.dirty_mask = mask;
		s.history[s.history_head] = std::move(snap);
		s.history_head = (s.history_head + 1) % MAX_HISTORY;
		if (s.history_count < MAX_HISTORY) {
			s.history_count++;
		}
		captured++;
	}
	dirty_indices.clear();
	if (spatial_enabled && spatial_grid_dirty) {
		_rebuild_spatial_grid();
	}
	const auto t1 = std::chrono::steady_clock::now();
	last_capture_us = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count());
	return captured;
}

void FgIrisNativeServer::_rebuild_spatial_grid() {
	spatial_grid.clear();
	for (uint32_t idx : alive_indices) {
		const ObjectSlot &s = slots[idx];
		spatial_grid[_grid_key(s.grid_cx, s.grid_cy)].push_back(idx);
	}
	spatial_grid_dirty = false;
}

const FgIrisNativeServer::QuantizedSnap *FgIrisNativeServer::_find_history(const ObjectSlot &slot, uint32_t rev) {
	for (uint32_t i = 0; i < slot.history_count; i++) {
		if (slot.history[i].revision == rev) {
			return &slot.history[i];
		}
	}
	return nullptr;
}

bool FgIrisNativeServer::_has_sent_rev(const ConnObjState &cobj, uint32_t rev) {
	for (uint32_t i = 0; i < cobj.sent_rev_count; i++) {
		if (cobj.sent_revs[i] == rev) {
			return true;
		}
	}
	return false;
}

void FgIrisNativeServer::_record_sent_rev(ConnObjState &cobj, uint32_t rev) {
	if (_has_sent_rev(cobj, rev)) {
		return;
	}
	constexpr uint32_t cap = MAX_HISTORY * 2;
	cobj.sent_revs[cobj.sent_rev_head] = rev;
	cobj.sent_rev_head = (cobj.sent_rev_head + 1) % cap;
	if (cobj.sent_rev_count < cap) {
		cobj.sent_rev_count++;
	}
}

void FgIrisNativeServer::_append_header(std::vector<uint8_t> &buf, uint8_t msg_type) const {
	put_u8(buf, MAGIC_0);
	put_u8(buf, MAGIC_1);
	put_u8(buf, msg_type);
	put_u32_le(buf, world_epoch);
	buf.insert(buf.end(), hash_prefix, hash_prefix + 8);
}

bool FgIrisNativeServer::_encode_full(const ObjectSlot &slot, const QuantizedSnap &snap, uint32_t allowed_mask, std::vector<uint8_t> &out) const {
	out.clear();
	out.reserve(64);
	_append_header(out, MSG_SPAWN_OR_FULL);
	put_u32_le(out, slot.index);
	put_u32_le(out, slot.generation);
	put_u32_le(out, slot.owner_peer_id);
	put_u32_le(out, snap.revision);
	put_u32_le(out, allowed_mask);
	if (allowed_mask & BIT_POS) {
		put_i32_le(out, snap.cell_x);
		put_i32_le(out, snap.cell_y);
		put_u16_le(out, snap.rem_x);
		put_u16_le(out, snap.rem_y);
	}
	if (allowed_mask & BIT_ROT) {
		put_u16_le(out, snap.rot_u16);
	}
	if (allowed_mask & BIT_HEALTH) {
		put_u16_le(out, snap.health_u16);
	}
	if (allowed_mask & BIT_INVENTORY) {
		out.insert(out.end(), snap.inv_encoded.begin(), snap.inv_encoded.end());
	}
	if (allowed_mask & BIT_OWNER_SECRET) {
		const uint16_t slen = static_cast<uint16_t>(std::min<size_t>(64, snap.owner_secret.size()));
		put_u16_le(out, slen);
		out.insert(out.end(), snap.owner_secret.data(), snap.owner_secret.data() + slen);
	}
	return out.size() <= max_datagram_bytes;
}

bool FgIrisNativeServer::_encode_delta(const ObjectSlot &slot, const QuantizedSnap &snap, uint32_t base_rev, uint32_t dirty_mask, std::vector<uint8_t> &out) const {
	out.clear();
	out.reserve(48);
	_append_header(out, MSG_DELTA);
	put_u32_le(out, slot.index);
	put_u32_le(out, slot.generation);
	put_u32_le(out, base_rev);
	put_u32_le(out, snap.revision);
	put_u32_le(out, dirty_mask);
	if (dirty_mask & BIT_POS) {
		put_i32_le(out, snap.cell_x);
		put_i32_le(out, snap.cell_y);
		put_u16_le(out, snap.rem_x);
		put_u16_le(out, snap.rem_y);
	}
	if (dirty_mask & BIT_ROT) {
		put_u16_le(out, snap.rot_u16);
	}
	if (dirty_mask & BIT_HEALTH) {
		put_u16_le(out, snap.health_u16);
	}
	if (dirty_mask & BIT_INVENTORY) {
		out.insert(out.end(), snap.inv_encoded.begin(), snap.inv_encoded.end());
	}
	if (dirty_mask & BIT_OWNER_SECRET) {
		const uint16_t slen = static_cast<uint16_t>(std::min<size_t>(64, snap.owner_secret.size()));
		put_u16_le(out, slen);
		out.insert(out.end(), snap.owner_secret.data(), snap.owner_secret.data() + slen);
	}
	return out.size() <= max_datagram_bytes;
}

void FgIrisNativeServer::_encode_tombstone(uint32_t idx, uint32_t gen, uint32_t tomb_rev, std::vector<uint8_t> &out) const {
	out.clear();
	out.reserve(27);
	_append_header(out, MSG_TOMBSTONE);
	put_u32_le(out, idx);
	put_u32_le(out, gen);
	put_u32_le(out, tomb_rev);
}

void FgIrisNativeServer::_encode_despawn(uint32_t idx, uint32_t gen, uint32_t rev, std::vector<uint8_t> &out) const {
	out.clear();
	out.reserve(27);
	_append_header(out, MSG_DESPAWN_INTEREST);
	put_u32_le(out, idx);
	put_u32_le(out, gen);
	put_u32_le(out, rev);
}

// Executed per connection (safe on worker threads: reads immutable slots/grid, writes ONLY its own ConnectionState).
void FgIrisNativeServer::_build_for_connection(ConnectionState &c, uint32_t server_tick) const {
	c.out_flat.clear();
	c.out_pkt_count = 0;
	c.out_full = 0;
	c.out_delta = 0;
	c.out_tomb = 0;
	c.out_despawn = 0;
	c.out_bytes = 0;
	c.out_deferred = 0;
	c.out_dormant_skipped = 0;

	uint32_t used_bytes = 0;
	std::vector<uint8_t> pkt;
	auto emit_pkt = [&](const std::vector<uint8_t> &p) {
		const uint16_t plen = static_cast<uint16_t>(p.size());
		put_u16_le(c.out_flat, plen);
		c.out_flat.insert(c.out_flat.end(), p.begin(), p.end());
		c.out_pkt_count++;
		used_bytes += plen;
		c.out_bytes += plen;
		c.bytes_sent += plen;
		c.packets_sent++;
	};

	// 1) Tombstones first (lifecycle never silently dropped)
	for (const auto &t : c.pending_tombstones) {
		_encode_tombstone(t.index, t.generation, t.tombstone_revision, pkt);
		if (used_bytes + pkt.size() <= budget_bytes_per_tick || c.out_pkt_count == 0) {
			emit_pkt(pkt);
			c.out_tomb++;
		}
	}

	const float enter_r2 = enter_radius * enter_radius;
	const float exit_r2 = exit_radius * exit_radius;

	// 2) Check existing active objects for exit-AOI or destruction
	size_t write_pos = 0;
	for (size_t i = 0; i < c.active_indices.size(); i++) {
		const uint32_t idx = c.active_indices[i];
		const ObjectSlot &s = slots[idx];
		ConnObjState &cobj = c.obj_states[idx];
		if (!s.alive || s.generation != cobj.generation || !cobj.relevant) {
			cobj.relevant = 0;
			continue;
		}
		bool keep = true;
		if (s.owner_only) {
			keep = (s.owner_peer_id == c.conn_id && c.conn_id > 0);
		} else if (spatial_enabled && s.owner_peer_id != c.conn_id) {
			if (!c.has_viewpoint) {
				keep = false;
			} else {
				const float dx = s.pos_x - c.vp_x;
				const float dy = s.pos_y - c.vp_y;
				keep = (dx * dx + dy * dy) <= exit_r2;
			}
		}
		if (!keep) {
			cobj.relevant = 0;
			_encode_despawn(s.index, s.generation, s.current_revision, pkt);
			emit_pkt(pkt);
			c.out_despawn++;
			continue;
		}
		c.active_indices[write_pos++] = idx;
	}
	c.active_indices.resize(write_pos);

	// 3) Discover newly relevant objects via spatial hash grid (O(local cells)) or full list when non-spatial
	auto consider_enter = [&](uint32_t idx) {
		const ObjectSlot &s = slots[idx];
		if (!s.alive) {
			return;
		}
		ConnObjState &cobj = c.obj_states[idx];
		if (cobj.relevant && cobj.generation == s.generation) {
			return;
		}
		const bool is_owner = (s.owner_peer_id == c.conn_id && c.conn_id > 0);
		if (s.owner_only && !is_owner) {
			return;
		}
		if (spatial_enabled && !is_owner) {
			if (!c.has_viewpoint) {
				return;
			}
			const float dx = s.pos_x - c.vp_x;
			const float dy = s.pos_y - c.vp_y;
			if ((dx * dx + dy * dy) > enter_r2) {
				return;
			}
		}
		cobj = ConnObjState{};
		cobj.generation = s.generation;
		cobj.relevant = 1;
		cobj.force_full = 1;
		cobj.last_owner_scoped = is_owner ? 1 : 0;
		c.active_indices.push_back(idx);
	};

	if (spatial_enabled && c.has_viewpoint) {
		const int32_t vcx = static_cast<int32_t>(std::floor(c.vp_x / grid_cell_size));
		const int32_t vcy = static_cast<int32_t>(std::floor(c.vp_y / grid_cell_size));
		for (int32_t dy = -1; dy <= 1; dy++) {
			for (int32_t dx = -1; dx <= 1; dx++) {
				auto it = spatial_grid.find(_grid_key(vcx + dx, vcy + dy));
				if (it == spatial_grid.end()) {
					continue;
				}
				for (uint32_t idx : it->second) {
					consider_enter(idx);
				}
			}
		}
	} else if (!spatial_enabled) {
		for (uint32_t idx : alive_indices) {
			consider_enter(idx);
		}
	}

	// 4) Collect dirty/unsynced relevant candidates and sort by priority
	struct Candidate {
		uint32_t idx;
		float prio;
	};
	std::vector<Candidate> candidates;
	candidates.reserve(std::min<size_t>(c.active_indices.size(), 256));

	for (uint32_t idx : c.active_indices) {
		const ObjectSlot &s = slots[idx];
		ConnObjState &cobj = c.obj_states[idx];
		const uint8_t is_owner = (s.owner_peer_id == c.conn_id && c.conn_id > 0) ? 1 : 0;
		if (cobj.last_owner_scoped != is_owner) {
			cobj.last_owner_scoped = is_owner;
			cobj.force_full = 1;
			cobj.acked_baseline_rev = 0;
			cobj.synced_server_rev = 0;
		}
		const uint32_t cur_rev = s.current_revision;
		if (cobj.synced_server_rev == cur_rev && cobj.lifecycle_acked && !cobj.force_full) {
			if (s.dormant) {
				c.out_dormant_skipped++;
			}
			continue;
		}
		const float owner_bonus = is_owner ? 4.0f : 1.0f;
		const uint32_t age = (cobj.last_sent_tick >= 0 && static_cast<int64_t>(server_tick) > cobj.last_sent_tick)
				? (server_tick - static_cast<uint32_t>(cobj.last_sent_tick))
				: max_wait_ticks;
		float wait_factor = 1.0f + (static_cast<float>(age) / static_cast<float>(max_wait_ticks)) * 3.0f;
		if (age >= max_wait_ticks) {
			wait_factor += 10.0f;
		}
		float dist_factor = 1.0f;
		if (spatial_enabled && c.has_viewpoint) {
			const float dx = s.pos_x - c.vp_x;
			const float dy = s.pos_y - c.vp_y;
			dist_factor = 1.0f / (1.0f + std::sqrt(dx * dx + dy * dy) / enter_radius);
		}
		const float spawn_bonus = (cobj.acked_baseline_rev == 0) ? 5.0f : 1.0f;
		candidates.push_back(Candidate{ idx, s.priority * owner_bonus * wait_factor * dist_factor * spawn_bonus });
	}

	std::sort(candidates.begin(), candidates.end(), [](const Candidate &a, const Candidate &b) {
		return a.prio > b.prio;
	});

	// 5) Encode Full or Delta within connection tick budget
	for (const auto &cand : candidates) {
		const ObjectSlot &s = slots[cand.idx];
		ConnObjState &cobj = c.obj_states[cand.idx];
		const uint32_t cur_rev = s.current_revision;
		const QuantizedSnap *cur_snap = _find_history(s, cur_rev);
		if (!cur_snap) {
			continue;
		}
		const bool is_owner = (s.owner_peer_id == c.conn_id && c.conn_id > 0);
		const uint32_t allowed_mask = is_owner ? MASK_OWNER : MASK_PUBLIC;

		bool is_full = (cobj.force_full != 0) || (cobj.acked_baseline_rev == 0) || (cobj.lifecycle_acked == 0);
		bool ok = false;
		if (!is_full) {
			const QuantizedSnap *base_snap = _find_history(s, cobj.acked_baseline_rev);
			if (!base_snap) {
				is_full = true;
			} else {
				uint32_t dirty_mask = 0;
				if ((allowed_mask & BIT_POS) && (base_snap->cell_x != cur_snap->cell_x || base_snap->cell_y != cur_snap->cell_y || base_snap->rem_x != cur_snap->rem_x || base_snap->rem_y != cur_snap->rem_y)) {
					dirty_mask |= BIT_POS | BIT_ROT;
				}
				if ((allowed_mask & BIT_ROT) && base_snap->rot_u16 != cur_snap->rot_u16) {
					dirty_mask |= BIT_POS | BIT_ROT;
				}
				if ((allowed_mask & BIT_HEALTH) && base_snap->health_u16 != cur_snap->health_u16) {
					dirty_mask |= BIT_HEALTH;
				}
				if ((allowed_mask & BIT_INVENTORY) && base_snap->inv_encoded != cur_snap->inv_encoded) {
					dirty_mask |= BIT_INVENTORY;
				}
				if ((allowed_mask & BIT_OWNER_SECRET) && base_snap->owner_secret != cur_snap->owner_secret) {
					dirty_mask |= BIT_OWNER_SECRET;
				}
				dirty_mask &= allowed_mask;
				if (dirty_mask == 0) {
					cobj.synced_server_rev = cur_rev;
					continue;
				}
				ok = _encode_delta(s, *cur_snap, cobj.acked_baseline_rev, dirty_mask, pkt);
			}
		}
		if (is_full) {
			ok = _encode_full(s, *cur_snap, allowed_mask, pkt);
		}
		if (!ok || pkt.empty()) {
			continue;
		}
		if (used_bytes + pkt.size() > budget_bytes_per_tick && c.out_pkt_count > 0) {
			c.out_deferred++;
			continue;
		}
		emit_pkt(pkt);
		cobj.last_sent_rev = cur_rev;
		cobj.last_sent_tick = static_cast<int32_t>(server_tick);
		cobj.force_full = 0;
		_record_sent_rev(cobj, cur_rev);
		if (is_full) {
			c.out_full++;
		} else {
			c.out_delta++;
		}
	}
}

void FgIrisNativeServer::_run_tick_build(uint32_t server_tick) {
	capture_tick(server_tick);
	const auto t0 = std::chrono::steady_clock::now();
	const size_t n = conns.size();
	// Ensure each connection has dense slots sized before parallel phase.
	for (auto &c : conns) {
		if (c.obj_states.size() < slots.size()) {
			c.obj_states.resize(slots.size());
		}
	}
	if (n >= 4 && worker_threads > 1) {
		const size_t tcount = std::min<size_t>(worker_threads, n);
		std::vector<std::thread> workers;
		workers.reserve(tcount - 1);
		std::atomic<size_t> next_conn{ 0 };
		auto worker_fn = [&]() {
			for (;;) {
				const size_t idx = next_conn.fetch_add(1, std::memory_order_relaxed);
				if (idx >= n) {
					break;
				}
				_build_for_connection(conns[idx], server_tick);
			}
		};
		for (size_t t = 1; t < tcount; t++) {
			workers.emplace_back(worker_fn);
		}
		worker_fn();
		for (auto &w : workers) {
			w.join();
		}
	} else {
		for (size_t i = 0; i < n; i++) {
			_build_for_connection(conns[i], server_tick);
		}
	}
	for (const auto &c : conns) {
		stat_full_sent += c.out_full;
		stat_delta_sent += c.out_delta;
		stat_tombstones_sent += c.out_tomb;
		stat_despawns_sent += c.out_despawn;
		stat_bytes_sent += c.out_bytes;
		stat_budget_deferred += c.out_deferred;
		stat_dormant_skipped += c.out_dormant_skipped;
	}
	const auto t1 = std::chrono::steady_clock::now();
	last_build_us = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count());
}

Dictionary FgIrisNativeServer::build_packets_for_tick(int64_t p_server_tick) {
	_run_tick_build(static_cast<uint32_t>(std::max<int64_t>(0, p_server_tick)));
	Dictionary result;
	for (const auto &c : conns) {
		Array arr;
		const uint8_t *ptr = c.out_flat.data();
		size_t pos = 0;
		const size_t total = c.out_flat.size();
		while (pos + 2 <= total) {
			const uint16_t plen = static_cast<uint16_t>(ptr[pos]) | (static_cast<uint16_t>(ptr[pos + 1]) << 8);
			pos += 2;
			if (pos + plen > total) {
				break;
			}
			PackedByteArray pba;
			pba.resize(plen);
			std::memcpy(pba.ptrw(), ptr + pos, plen);
			arr.push_back(pba);
			pos += plen;
		}
		result[static_cast<int64_t>(c.conn_id)] = arr;
	}
	return result;
}

PackedByteArray FgIrisNativeServer::build_packets_for_tick_flat(int64_t p_server_tick) {
	_run_tick_build(static_cast<uint32_t>(std::max<int64_t>(0, p_server_tick)));
	size_t total_size = 0;
	for (const auto &c : conns) {
		total_size += 8 + c.out_flat.size();
	}
	PackedByteArray out;
	out.resize(static_cast<int64_t>(total_size));
	uint8_t *dst = out.ptrw();
	size_t ofs = 0;
	for (const auto &c : conns) {
		const uint32_t cid = c.conn_id;
		const uint32_t cnt = c.out_pkt_count;
		std::memcpy(dst + ofs, &cid, 4);
		ofs += 4;
		std::memcpy(dst + ofs, &cnt, 4);
		ofs += 4;
		if (!c.out_flat.empty()) {
			std::memcpy(dst + ofs, c.out_flat.data(), c.out_flat.size());
			ofs += c.out_flat.size();
		}
	}
	return out;
}

Dictionary FgIrisNativeServer::handle_client_packet(int64_t p_conn_id, const PackedByteArray &p_raw) {
	Dictionary out;
	auto it = conn_index_map.find(static_cast<uint32_t>(p_conn_id));
	if (it == conn_index_map.end()) {
		out["ok"] = false;
		out["reason"] = "unknown_connection";
		return out;
	}
	if (p_raw.size() < 15 || p_raw.size() > static_cast<int64_t>(max_datagram_bytes)) {
		stat_malformed_inbound++;
		out["ok"] = false;
		out["reason"] = "invalid_packet_size";
		return out;
	}
	const uint8_t *p = p_raw.ptr();
	if (p[0] != MAGIC_0 || p[1] != MAGIC_1) {
		stat_malformed_inbound++;
		out["ok"] = false;
		out["reason"] = "bad_magic";
		return out;
	}
	const uint8_t msg_type = p[2];
	const uint32_t ep = get_u32_le(p + 3);
	if (ep != world_epoch) {
		stat_malformed_inbound++;
		out["ok"] = false;
		out["reason"] = "world_epoch_mismatch";
		return out;
	}
	if (std::memcmp(p + 7, hash_prefix, 8) != 0) {
		stat_malformed_inbound++;
		out["ok"] = false;
		out["reason"] = "protocol_hash_mismatch";
		return out;
	}

	ConnectionState &c = conns[it->second];
	if (msg_type == MSG_STORAGE_ACK) {
		if (p_raw.size() < 28) {
			stat_malformed_inbound++;
			out["ok"] = false;
			out["reason"] = "truncated_ack";
			return out;
		}
		const uint32_t idx = get_u32_le(p + 15);
		const uint32_t gen = get_u32_le(p + 19);
		const uint32_t rev = get_u32_le(p + 23);
		const uint8_t flags = p[27];
		if (flags & ACK_FLAG_TOMBSTONE) {
			for (size_t i = 0; i < c.pending_tombstones.size(); i++) {
				const auto &t = c.pending_tombstones[i];
				if (t.index == idx && t.generation == gen && t.tombstone_revision == rev) {
					c.pending_tombstones[i] = c.pending_tombstones.back();
					c.pending_tombstones.pop_back();
					stat_acks_accepted++;
					out["ok"] = true;
					out["kind"] = "tombstone_ack";
					return out;
				}
			}
			stat_forged_acks_rejected++;
			out["ok"] = false;
			out["reason"] = "invalid_tombstone_ack";
			return out;
		}
		if (idx >= c.obj_states.size() || !c.obj_states[idx].relevant || c.obj_states[idx].generation != gen) {
			stat_forged_acks_rejected++;
			out["ok"] = false;
			out["reason"] = "ack_for_untracked_object";
			return out;
		}
		ConnObjState &cobj = c.obj_states[idx];
		if (!_has_sent_rev(cobj, rev)) {
			stat_forged_acks_rejected++;
			out["ok"] = false;
			out["reason"] = "forged_future_or_unsent_revision";
			return out;
		}
		if (rev > cobj.acked_baseline_rev) {
			cobj.acked_baseline_rev = rev;
		}
		if (rev > cobj.synced_server_rev) {
			cobj.synced_server_rev = rev;
		}
		if (flags & ACK_FLAG_LIFECYCLE) {
			cobj.lifecycle_acked = 1;
		}
		stat_acks_accepted++;
		out["ok"] = true;
		out["kind"] = "storage_ack";
		out["revision"] = static_cast<int64_t>(rev);
		return out;
	}

	if (msg_type == MSG_FULL_REFRESH_REQ) {
		if (p_raw.size() < 27) {
			stat_malformed_inbound++;
			out["ok"] = false;
			out["reason"] = "truncated_refresh_req";
			return out;
		}
		const uint32_t idx = get_u32_le(p + 15);
		const uint32_t gen = get_u32_le(p + 19);
		if (idx < c.obj_states.size() && c.obj_states[idx].relevant && c.obj_states[idx].generation == gen) {
			c.obj_states[idx].force_full = 1;
			c.obj_states[idx].acked_baseline_rev = 0;
			c.obj_states[idx].synced_server_rev = 0;
		}
		stat_refresh_requests++;
		out["ok"] = true;
		out["kind"] = "full_refresh_req";
		return out;
	}

	stat_malformed_inbound++;
	out["ok"] = false;
	out["reason"] = "unexpected_client_msg_type";
	return out;
}

int64_t FgIrisNativeServer::ack_all_sent_for_benchmark() {
	int64_t acked = 0;
	for (auto &c : conns) {
		for (uint32_t idx : c.active_indices) {
			ConnObjState &cobj = c.obj_states[idx];
			if (cobj.last_sent_rev > cobj.acked_baseline_rev) {
				cobj.acked_baseline_rev = cobj.last_sent_rev;
				cobj.synced_server_rev = std::max(cobj.synced_server_rev, cobj.last_sent_rev);
				cobj.lifecycle_acked = 1;
				stat_acks_accepted++;
				acked++;
			}
		}
	}
	return acked;
}

Dictionary FgIrisNativeServer::get_stats() const {
	Dictionary d;
	d["full_sent"] = static_cast<int64_t>(stat_full_sent);
	d["delta_sent"] = static_cast<int64_t>(stat_delta_sent);
	d["tombstones_sent"] = static_cast<int64_t>(stat_tombstones_sent);
	d["despawns_sent"] = static_cast<int64_t>(stat_despawns_sent);
	d["acks_accepted"] = static_cast<int64_t>(stat_acks_accepted);
	d["forged_acks_rejected"] = static_cast<int64_t>(stat_forged_acks_rejected);
	d["refresh_requests"] = static_cast<int64_t>(stat_refresh_requests);
	d["malformed_inbound"] = static_cast<int64_t>(stat_malformed_inbound);
	d["bytes_sent"] = static_cast<int64_t>(stat_bytes_sent);
	d["budget_deferred"] = static_cast<int64_t>(stat_budget_deferred);
	d["dormant_skipped"] = static_cast<int64_t>(stat_dormant_skipped);
	d["last_capture_us"] = static_cast<int64_t>(last_capture_us);
	d["last_build_us"] = static_cast<int64_t>(last_build_us);
	d["worker_threads"] = static_cast<int64_t>(worker_threads);
	return d;
}

void initialize_playforge_iris_native(ModuleInitializationLevel p_level) {
	if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
		GDREGISTER_CLASS(FgIrisNativeServer);
	}
}

void uninitialize_playforge_iris_native(ModuleInitializationLevel p_level) {
	if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
		return;
	}
}

} // namespace godot

extern "C" {
GDExtensionBool GDE_EXPORT playforge_iris_native_library_init(
		GDExtensionInterfaceGetProcAddress p_get_proc_address,
		GDExtensionClassLibraryPtr p_library,
		GDExtensionInitialization *r_initialization) {
	godot::GDExtensionBinding::InitObject init_object(p_get_proc_address, p_library, r_initialization);
	init_object.register_initializer(godot::initialize_playforge_iris_native);
	init_object.register_terminator(godot::uninitialize_playforge_iris_native);
	init_object.set_minimum_library_initialization_level(godot::MODULE_INITIALIZATION_LEVEL_SCENE);
	return init_object.init();
}
}
