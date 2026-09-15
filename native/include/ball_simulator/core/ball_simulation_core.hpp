#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace ball_simulator {

// Stable Godot class name reserved for the M4 GDExtension Node3D binding.
inline constexpr std::string_view BALL_SIMULATOR_COMPONENT_3D_CLASS_NAME = "BallSimulatorComponent3D";

struct BallVector3 {
	constexpr BallVector3() = default;
	constexpr BallVector3(double p_x, double p_y, double p_z) : x(p_x), y(p_y), z(p_z) {}

	double x = 0.0;
	double y = 0.0;
	double z = 0.0;

	constexpr BallVector3 operator+(const BallVector3 &p_other) const {
		return { x + p_other.x, y + p_other.y, z + p_other.z };
	}
	constexpr BallVector3 operator*(double p_scalar) const {
		return { x * p_scalar, y * p_scalar, z * p_scalar };
	}
	BallVector3 &operator+=(const BallVector3 &p_other) {
		x += p_other.x;
		y += p_other.y;
		z += p_other.z;
		return *this;
	}
};

enum class BallMotionMode : std::uint8_t {
	Airborne,
	Rolling,
	Stopped,
};

// Godot-compatible counterpart to Unreal FSimulateParams. Public values use m, s, kg, and rad/s.
struct BallSimulateParams {
	BallVector3 start_position_m {};
	BallVector3 linear_velocity_mps {};
	BallVector3 angular_velocity_radps {};
	BallVector3 gravity_mps2 { 0.0, -9.81, 0.0 };
	double ball_mass_kg = 0.43;
	double ball_radius_m = 0.11;
	double fixed_dt_s = 1.0 / 60.0;
	std::int32_t max_step_count = 600;
};

// Godot-compatible counterpart to Unreal FBallSnapshot.
struct BallSnapshot {
	std::int32_t snapshot_index = 0;
	double playback_time_s = 0.0;
	BallVector3 position_m {};
	BallVector3 linear_velocity_mps {};
	BallVector3 angular_velocity_radps {};
	BallMotionMode motion_mode = BallMotionMode::Airborne;
};

// Godot-compatible counterpart to Unreal FSimulationFrame. M1 reserves the
// public data contract; M3 populates interpolation and collision-frame data.
struct BallSimulationFrame {
	std::int32_t first_snapshot_index = 0;
	std::int32_t last_snapshot_index = 0;
	double start_time_s = 0.0;
	double end_time_s = 0.0;
};

// Godot-compatible counterpart to Unreal FBallBounce. Collision response is added in milestone M2.
struct BallBounce {
	std::int32_t event_index = -1;
	std::int32_t snapshot_index = -1;
	double bounced_time_s = 0.0;
	BallVector3 bounced_position_m {};
	BallVector3 hit_normal {};
	BallVector3 pre_linear_velocity_mps {};
	BallVector3 post_linear_velocity_mps {};
};

struct BallCollisionQuery {
	BallVector3 start_position_m {};
	BallVector3 motion_m {};
	double ball_radius_m = 0.0;
	std::uint32_t collision_mask = 0xffffffffU;
};

struct BallCollisionQueryResult {
	bool collided = false;
	double safe_fraction = 1.0;
	double unsafe_fraction = 1.0;
	BallVector3 position_m {};
	BallVector3 normal {};
	double restitution = 0.0;
	double friction = 0.0;
};

// A strictly observer-only boundary. Implementations may query a world but must never create,
// move, apply forces to, or otherwise mutate a Godot physics body.
class BallCollisionQueryWorld {
public:
	virtual ~BallCollisionQueryWorld() = default;
	virtual BallCollisionQueryResult sweep_sphere(const BallCollisionQuery &p_query) const = 0;
	virtual BallCollisionQueryResult ray_cast(const BallCollisionQuery &p_query) const = 0;
};

struct BallSimulationDiagnostics {
	bool succeeded = true;
	std::string failure_reason;
	std::int32_t fixed_step_count = 0;
	std::int32_t collision_query_count = 0;
};

struct BallTrajectory {
	std::vector<BallSnapshot> snapshots;
	std::vector<BallSimulationFrame> frames;
	std::vector<BallBounce> bounces;
	BallSimulationDiagnostics diagnostics;
};

class BallSimulationCore {
public:
	BallTrajectory simulate(const BallSimulateParams &p_params, double p_duration_s) const;

private:
	static bool validate(const BallSimulateParams &p_params, double p_duration_s, std::string &r_error);
};

} // namespace ball_simulator
