#include "ball_simulator/core/ball_simulation_core.hpp"

#include <cmath>

namespace ball_simulator {

bool BallSimulationCore::validate(const BallSimulateParams &p_params, double p_duration_s, std::string &r_error) {
	if (!std::isfinite(p_duration_s) || p_duration_s < 0.0) {
		r_error = "duration_s must be finite and non-negative";
		return false;
	}
	if (!std::isfinite(p_params.fixed_dt_s) || p_params.fixed_dt_s <= 0.0) {
		r_error = "fixed_dt_s must be finite and greater than zero";
		return false;
	}
	if (!std::isfinite(p_params.ball_mass_kg) || p_params.ball_mass_kg <= 0.0) {
		r_error = "ball_mass_kg must be finite and greater than zero";
		return false;
	}
	if (!std::isfinite(p_params.ball_radius_m) || p_params.ball_radius_m <= 0.0) {
		r_error = "ball_radius_m must be finite and greater than zero";
		return false;
	}
	if (p_params.max_step_count <= 0) {
		r_error = "max_step_count must be greater than zero";
		return false;
	}
	return true;
}

BallTrajectory BallSimulationCore::simulate(const BallSimulateParams &p_params, double p_duration_s) const {
	BallTrajectory trajectory;
	std::string validation_error;
	if (!validate(p_params, p_duration_s, validation_error)) {
		trajectory.diagnostics.succeeded = false;
		trajectory.diagnostics.failure_reason = validation_error;
		return trajectory;
	}

	BallSnapshot state;
	state.position_m = p_params.start_position_m;
	state.linear_velocity_mps = p_params.linear_velocity_mps;
	state.angular_velocity_radps = p_params.angular_velocity_radps;
	trajectory.snapshots.push_back(state);

	double remaining_s = p_duration_s;
	while (remaining_s > 1e-12 && trajectory.diagnostics.fixed_step_count < p_params.max_step_count) {
		const double dt_s = remaining_s < p_params.fixed_dt_s ? remaining_s : p_params.fixed_dt_s;
		const BallSnapshot previous_state = state;
		const BallVector3 half_gravity_step = p_params.gravity_mps2 * (0.5 * dt_s * dt_s);
		state.position_m += state.linear_velocity_mps * dt_s + half_gravity_step;
		state.linear_velocity_mps += p_params.gravity_mps2 * dt_s;
		state.playback_time_s += dt_s;
		state.snapshot_index += 1;
		trajectory.diagnostics.fixed_step_count += 1;
		trajectory.snapshots.push_back(state);
		trajectory.frames.push_back({
			previous_state.snapshot_index,
			state.snapshot_index,
			previous_state.playback_time_s,
			state.playback_time_s,
		});
		remaining_s -= dt_s;
	}

	if (remaining_s > 1e-12) {
		trajectory.diagnostics.succeeded = false;
		trajectory.diagnostics.failure_reason = "max_step_count reached before requested duration";
	}

	return trajectory;
}

} // namespace ball_simulator
