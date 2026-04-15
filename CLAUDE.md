# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Virtualenv lives at `.venv/`. Activate before running.

- Install deps: `pip install -r requirements.txt`
- Run server: `python main.py` (listens `ws://0.0.0.0:3030`)

No test suite, no linter configured.

## Architecture

Spacecraft (quadcopter-style) attitude stabilization loop. Unity client streams IMU telemetry over WebSocket; server returns per-motor thrust commands each tick.

Data flow:

1. [main.py](main.py) `WebsocketServer` accepts JSON frames with keys `eulerAngles`, `acceleration`, `gyro`, `magnet`.
2. Payload parsed into [maps.py](maps.py) `IMU` (wraps four `Coords` 3-vectors; `Coords.vector` is the `np.array` form).
3. [modules/stabilization.py](modules/stabilization.py) `Stabilization.update_orientation()` runs PD controller against `standby_orientation` (target = zero roll/pitch/yaw).
4. `correction_pd(kp, kd)` computes error vs current euler angles, damped by gyro angular velocity. Note roll axis (x) is sign-inverted vs pitch/yaw.
5. `apply_correction(correction, base_thrust)` mixes correction into 4 motors (`m1`–`m4`) using quad-X mixer signs, returned as JSON dict to client.

Key constants live inline in `update_orientation`: `kp=0.05`, `kd=0.015`, `base_thrust=20`.

`Madgwick` filter and `quaternion_to_euler_angle_vectorized` helper are scaffolded but unused — current loop trusts the euler angles sent by Unity directly rather than fusing raw IMU.

State per connection: a single `Stabilization` instance is shared across all clients (created in `WebsocketServer.__init__`).
