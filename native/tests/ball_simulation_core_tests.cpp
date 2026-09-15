#include "ball_simulator/core/ball_simulation_core.hpp"
#include "ball_simulator/core/ball_trajectory_playback.hpp"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

constexpr double EPSILON = 1e-9;

void expect_true(bool p_condition, const std::string &p_message) {
	if (!p_condition) {
		std::cerr << "FAIL: " << p_message << '\n';
		std::exit(EXIT_FAILURE);
	}
}

void expect_close(double p_actual, double p_expected, const std::string &p_message) {
	expect_true(std::abs(p_actual - p_expected) <= EPSILON, p_message + " actual=" + std::to_string(p_actual) + " expected=" + std::to_string(p_expected));
}

void test_exact_constant_acceleration() {
	ball_simulator::BallSimulateParams params;
	params.fixed_dt_s = 0.1;
	params.max_step_count = 20;
	const ball_simulator::BallTrajectory trajectory = ball_simulator::BallSimulationCore().simulate(params, 1.0);
	expect_true(trajectory.diagnostics.succeeded, "one-second gravity trajectory should succeed");
	expect_true(trajectory.snapshots.size() == 11, "0.1 second step should produce initial plus ten snapshots");
	expect_true(trajectory.frames.size() == 10, "each fixed step must create one simulation frame");
	const ball_simulator::BallSnapshot &final_state = trajectory.snapshots.back();
	expect_close(final_state.playback_time_s, 1.0, "final time must equal requested duration");
	expect_close(final_state.position_m.y, -4.905, "position must use constant-acceleration integration");
	expect_close(final_state.linear_velocity_mps.y, -9.81, "velocity must integrate gravity");
}

void test_horizontal_velocity_and_indices() {
	ball_simulator::BallSimulateParams params;
	params.gravity_mps2 = { 0.0, 0.0, 0.0 };
	params.linear_velocity_mps = { 3.5, 0.0, -2.0 };
	params.fixed_dt_s = 0.25;
	const ball_simulator::BallTrajectory trajectory = ball_simulator::BallSimulationCore().simulate(params, 1.0);
	expect_true(trajectory.diagnostics.succeeded, "horizontal trajectory should succeed");
	expect_true(trajectory.snapshots.size() == 5, "0.25 second step should produce five snapshots");
	const ball_simulator::BallSnapshot &final_state = trajectory.snapshots.back();
	expect_close(final_state.position_m.x, 3.5, "x displacement must preserve velocity");
	expect_close(final_state.position_m.z, -2.0, "z displacement must preserve velocity");
	expect_true(final_state.snapshot_index == 4, "snapshot indices must monotonically increase from zero");
}

void test_invalid_parameters_are_reported() {
	ball_simulator::BallSimulateParams params;
	params.ball_radius_m = 0.0;
	const ball_simulator::BallTrajectory trajectory = ball_simulator::BallSimulationCore().simulate(params, 1.0);
	expect_true(!trajectory.diagnostics.succeeded, "invalid radius must fail without producing a trajectory");
	expect_true(trajectory.snapshots.empty(), "invalid input must not produce partial snapshots");
}

void test_precomputed_trajectory_playback() {
	ball_simulator::BallSimulateParams params;
	params.fixed_dt_s = 0.1;
	params.max_step_count = 20;
	const ball_simulator::BallTrajectory trajectory = ball_simulator::BallSimulationCore().simulate(params, 1.0);

	ball_simulator::BallTrajectoryPlayback playback;
	expect_true(playback.load(trajectory), "a completed trajectory must load into the playback controller");
	expect_true(playback.get_state() == ball_simulator::BallPlaybackState::Simulated, "loading must not start simulation again");
	expect_true(playback.play(), "a simulated trajectory must be playable");
	playback.advance(0.35);
	expect_close(playback.get_playback_time_s(), 0.35, "playback advances display time without recalculating the trajectory");
	expect_close(playback.get_current_snapshot().position_m.y, -0.613125, "playback samples the precomputed trajectory");

	playback.pause();
	playback.advance(0.25);
	expect_close(playback.get_playback_time_s(), 0.35, "paused playback must not advance");
	playback.stop();
	expect_true(playback.get_state() == ball_simulator::BallPlaybackState::Stopped, "stop must enter the stopped state");
	expect_close(playback.get_playback_time_s(), 0.0, "stop must return to the precomputed initial snapshot");
	expect_true(playback.replay(), "a stopped trajectory must replay without a second simulation");
	playback.advance(0.5);
	expect_close(playback.get_current_snapshot().position_m.y, -1.22625, "replay samples the same immutable trajectory");
}

} // namespace

int main() {
	test_exact_constant_acceleration();
	test_horizontal_velocity_and_indices();
	test_invalid_parameters_are_reported();
	test_precomputed_trajectory_playback();
	std::cout << "BALL_CORE_TEST_RESULT PASS\n";
	return EXIT_SUCCESS;
}
