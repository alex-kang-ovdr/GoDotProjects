#include "ball_simulator/core/ball_trajectory_playback.hpp"

#include <algorithm>
#include <cmath>

namespace ball_simulator {

namespace {

BallVector3 lerp_vector(const BallVector3 &p_from, const BallVector3 &p_to, double p_weight) {
	return {
		p_from.x + (p_to.x - p_from.x) * p_weight,
		p_from.y + (p_to.y - p_from.y) * p_weight,
		p_from.z + (p_to.z - p_from.z) * p_weight,
	};
}

} // namespace

bool BallTrajectoryPlayback::load(const BallTrajectory &p_trajectory) {
	if (!p_trajectory.diagnostics.succeeded || p_trajectory.snapshots.empty()) {
		trajectory_ = {};
		state_ = BallPlaybackState::Stopped;
		playback_time_s_ = 0.0;
		return false;
	}

	trajectory_ = p_trajectory;
	state_ = BallPlaybackState::Simulated;
	playback_time_s_ = trajectory_.snapshots.front().playback_time_s;
	return true;
}

bool BallTrajectoryPlayback::play() {
	if (!has_trajectory() || state_ == BallPlaybackState::Stopped) {
		return false;
	}
	state_ = BallPlaybackState::Playing;
	return true;
}

void BallTrajectoryPlayback::pause() {
	if (state_ == BallPlaybackState::Playing) {
		state_ = BallPlaybackState::Paused;
	}
}

void BallTrajectoryPlayback::stop() {
	if (!has_trajectory()) {
		return;
	}
	playback_time_s_ = trajectory_.snapshots.front().playback_time_s;
	state_ = BallPlaybackState::Stopped;
}

bool BallTrajectoryPlayback::replay() {
	if (!has_trajectory()) {
		return false;
	}
	playback_time_s_ = trajectory_.snapshots.front().playback_time_s;
	state_ = BallPlaybackState::Playing;
	return true;
}

void BallTrajectoryPlayback::advance(double p_render_delta_s) {
	if (state_ != BallPlaybackState::Playing || !std::isfinite(p_render_delta_s) || p_render_delta_s <= 0.0) {
		return;
	}

	const double end_time_s = trajectory_.snapshots.back().playback_time_s;
	playback_time_s_ = std::min(playback_time_s_ + p_render_delta_s, end_time_s);
	if (playback_time_s_ >= end_time_s) {
		state_ = BallPlaybackState::Paused;
	}
}

bool BallTrajectoryPlayback::has_trajectory() const {
	return !trajectory_.snapshots.empty();
}

BallPlaybackState BallTrajectoryPlayback::get_state() const {
	return state_;
}

double BallTrajectoryPlayback::get_playback_time_s() const {
	return playback_time_s_;
}

BallSnapshot BallTrajectoryPlayback::get_current_snapshot() const {
	if (!has_trajectory()) {
		return {};
	}
	return sample_at_time(trajectory_, playback_time_s_);
}

BallSnapshot BallTrajectoryPlayback::sample_at_time(const BallTrajectory &p_trajectory, double p_time_s) {
	const BallSnapshot &first = p_trajectory.snapshots.front();
	const BallSnapshot &last = p_trajectory.snapshots.back();
	if (p_time_s <= first.playback_time_s) {
		return first;
	}
	if (p_time_s >= last.playback_time_s) {
		return last;
	}

	for (std::size_t index = 1; index < p_trajectory.snapshots.size(); ++index) {
		const BallSnapshot &next = p_trajectory.snapshots[index];
		if (p_time_s > next.playback_time_s) {
			continue;
		}
		const BallSnapshot &previous = p_trajectory.snapshots[index - 1];
		const double duration_s = next.playback_time_s - previous.playback_time_s;
		const double weight = duration_s > 0.0 ? (p_time_s - previous.playback_time_s) / duration_s : 0.0;
		BallSnapshot sample = previous;
		sample.playback_time_s = p_time_s;
		sample.position_m = lerp_vector(previous.position_m, next.position_m, weight);
		sample.linear_velocity_mps = lerp_vector(previous.linear_velocity_mps, next.linear_velocity_mps, weight);
		sample.angular_velocity_radps = lerp_vector(previous.angular_velocity_radps, next.angular_velocity_radps, weight);
		return sample;
	}

	return last;
}

} // namespace ball_simulator
