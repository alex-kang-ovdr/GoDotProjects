#pragma once

#include "ball_simulator/core/ball_simulation_core.hpp"

namespace ball_simulator {

// Consumes an already calculated trajectory. It never integrates motion or queries a physics world.
enum class BallPlaybackState : std::uint8_t {
	Simulated,
	Playing,
	Paused,
	Stopped,
};

class BallTrajectoryPlayback {
public:
	bool load(const BallTrajectory &p_trajectory);
	bool play();
	void pause();
	void stop();
	bool replay();
	void advance(double p_render_delta_s);

	bool has_trajectory() const;
	BallPlaybackState get_state() const;
	double get_playback_time_s() const;
	BallSnapshot get_current_snapshot() const;

private:
	static BallSnapshot sample_at_time(const BallTrajectory &p_trajectory, double p_time_s);

	BallTrajectory trajectory_;
	BallPlaybackState state_ = BallPlaybackState::Stopped;
	double playback_time_s_ = 0.0;
};

} // namespace ball_simulator
