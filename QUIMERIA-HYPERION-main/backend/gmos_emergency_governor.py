# gmos_emergency_governor.py

from dataclasses import dataclass
import jax
import jax.numpy as jnp


# =========================
# Configuration
# =========================
@dataclass
class GMOSConfig:
    tau: float = 0.65               # Bayesian confidence threshold
    max_drawdown: float = 0.12      # Capital preservation
    hamiltonian_min: float = 1e-3   # Minimum market energy
    coherence_min: float = 0.2      # Sensor agreement threshold
    reset_strength: float = 0.5     # 0=full reset, 1=no reset


# =========================
# Core Governor
# =========================
class GMOSGovernor:

    def __init__(self, config: GMOSConfig):
        self.cfg = config

    # -------------------------
    # Sensor Coherence Measure
    # -------------------------
    @jax.jit
    def compute_coherence(self, sensor_probs):
        """
        Measures agreement across sensors.
        1.0 = perfect agreement, 0.0 = total contradiction
        """
        mean = jnp.mean(sensor_probs)
        variance = jnp.mean((sensor_probs - mean) ** 2)

        # Normalize (bounded)
        coherence = 1.0 / (1.0 + variance * 10.0)
        return coherence


    # -------------------------
    # Stable Bayesian Fusion
    # -------------------------
    @jax.jit
    def stable_fusion(self, sensor_probs):
        """
        Log-domain fusion to avoid collapse.
        """
        eps = 1e-8
        log_probs = jnp.log(sensor_probs + eps)
        fused_log = jnp.mean(log_probs)
        return jnp.exp(fused_log)


    # -------------------------
    # Hamiltonian Energy
    # -------------------------
    @jax.jit
    def compute_hamiltonian(self, price_velocity, deviation):
        kinetic = 0.5 * jnp.sum(price_velocity ** 2)
        potential = 0.05 * jnp.sum(deviation ** 2)
        return kinetic + potential


    # -------------------------
    # Control Law (PURE JAX)
    # -------------------------
    @jax.jit
    def compute_control(
        self,
        sensor_probs,
        regime_stable,
        drawdown,
        price_velocity,
        deviation
    ):
        p_fused = self.stable_fusion(sensor_probs)
        coherence = self.compute_coherence(sensor_probs)
        h_t = self.compute_hamiltonian(price_velocity, deviation)

        decision = (
            regime_stable
            & (p_fused > self.cfg.tau)
            & (drawdown < self.cfg.max_drawdown)
            & (h_t > self.cfg.hamiltonian_min)
            & (coherence > self.cfg.coherence_min)
        )

        return decision, p_fused, coherence, h_t


    # -------------------------
    # Graduated Beta Reset
    # -------------------------
    def reset_beliefs(self, alpha, beta, sensor_probs):
        """
        Soft reset weighted by sensor reliability.
        """
        reliability = 1.0 - jnp.abs(sensor_probs - 0.5) * 2.0  # low = unreliable

        strength = self.cfg.reset_strength

        new_alpha = alpha * strength + (1.0 - strength) * (1.0 + reliability)
        new_beta  = beta  * strength + (1.0 - strength) * (1.0 + reliability)

        return new_alpha, new_beta


    # -------------------------
    # Python Control Layer (SAFE)
    # -------------------------
    def step(
        self,
        sensor_probs,
        regime_stable,
        drawdown,
        price_velocity,
        deviation,
        alpha,
        beta,
        phase
    ):
        """
        SAFE control layer (no JIT here → avoids tracer errors)
        """

        decision, p_fused, coherence, h_t = self.compute_control(
            sensor_probs,
            regime_stable,
            drawdown,
            price_velocity,
            deviation
        )

        decision = bool(decision)

        telemetry = {
            "p_fused": float(p_fused),
            "coherence": float(coherence),
            "hamiltonian": float(h_t),
            "drawdown": float(drawdown),
            "regime_stable": bool(regime_stable),
        }

        if not decision:
            # 🚨 METACOGNITIVE HALT
            new_alpha, new_beta = self.reset_beliefs(alpha, beta, sensor_probs)
            new_phase = 0  # reset to accumulation

            telemetry["action"] = "HALT_AND_RESET"

            return {
                "execute": False,
                "alpha": new_alpha,
                "beta": new_beta,
                "phase": new_phase,
                "telemetry": telemetry
            }

        telemetry["action"] = "EXECUTE"

        return {
            "execute": True,
            "alpha": alpha,
            "beta": beta,
            "phase": phase,
            "telemetry": telemetry
        }


# =========================
# Example Usage
# =========================
if __name__ == "__main__":
    cfg = GMOSConfig()
    governor = GMOSGovernor(cfg)

    # Example inputs
    sensor_probs = jnp.array([0.9, 0.1, 0.85])  # contradictory → liar state
    regime_stable = False
    drawdown = 0.04
    price_velocity = jnp.array([0.0, 0.0])
    deviation = jnp.array([0.0, 0.0])

    alpha = jnp.ones(3)
    beta = jnp.ones(3)
    phase = 2

    result = governor.step(
        sensor_probs,
        regime_stable,
        drawdown,
        price_velocity,
        deviation,
        alpha,
        beta,
        phase
    )

    print(result)
