"""
Core implementation of the Reverse Period Detection Equation.
"""

from __future__ import annotations
import numpy as np
from .utils import atr, fft_dominant_frequency, liquidity_potential_gradient


class ReversePeriodDetector:
    """
    Computes λ₁…λ₅, the unified trigger 𝓡ₜ, the severity score,
    and provides state-transition logic.
    """

    def __init__(
        self,
        *,
        tau_max: int = 20,
        delta: float = 0.3,
        gamma: float = 0.0,
        n_killzone: int = 20,
        n_confluence: int = 10,
        w1: float = 0.35,
        w2: float = 0.25,
        w3: float = 0.20,
        w4: float = 0.15,
        w5: float = 0.05,
        score_threshold: float = 0.6,
    ):
        self.tau_max = tau_max
        self.delta = delta
        self.gamma = gamma
        self.n_killzone = n_killzone
        self.n_confluence = n_confluence
        self.weights = np.array([w1, w2, w3, w4, w5])
        self.score_threshold = score_threshold

    # ------------------------------------------------------------------ #
    # Individual λ detectors
    # ------------------------------------------------------------------ #

    def lambda_1_phase_entrapment(
        self,
        sigma: np.ndarray,
        price: np.ndarray,
        atr_20: np.ndarray,
    ) -> np.ndarray:
        """
        λ₁ = 1[σ_t = 2 ∧ τ_stay > τ_max ∧ (∫|∇P| dt / ATR20) < δ]
        """
        sigma = np.asarray(sigma)
        price = np.asarray(price)
        atr_20 = np.asarray(atr_20)

        stay = self._tau_stay(sigma)

        price_diff = np.abs(np.diff(price, prepend=price[0]))
        cum_var = np.zeros_like(price_diff)
        for i in range(len(price_diff)):
            cum_var[i] = price_diff[i] + (cum_var[i - 1] if i > 0 and sigma[i] == 2 else 0)

        norm_var = np.where(atr_20 > 0, cum_var / atr_20, np.inf)

        return ((sigma == 2) & (stay > self.tau_max) & (norm_var < self.delta)).astype(int)

    def lambda_2_temporal_alignment_failure(
        self,
        returns: np.ndarray,
        killzone_mask: np.ndarray,
    ) -> np.ndarray:
        """
        λ₂ = 1[ K(t)=1 ∧ mean(sign(r_i), lookback=n_killzone) < γ ]
        """
        returns = np.asarray(returns)
        killzone_mask = np.asarray(killzone_mask, dtype=bool)

        signed = np.sign(returns)
        # Single convolution — kernel already normalises, do NOT divide again
        kernel = np.ones(self.n_killzone) / self.n_killzone
        mean_signed = np.convolve(signed, kernel, mode='same')
        # Mask edges where the window is incomplete
        half = self.n_killzone // 2
        mean_signed[:half] = np.nan
        mean_signed[-half:] = np.nan

        return (killzone_mask & (mean_signed < self.gamma)).astype(int)

    def lambda_3_spectral_phase_inversion(
        self,
        price: np.ndarray,
        sampling_rate: float = 1.0,
    ) -> np.ndarray:
        """
        λ₃ = 1[ angle( f̂_pred / f̂_actual ) > π/2 ]

        fft_dominant_frequency returns a real frequency scalar. To get a
        meaningful phase comparison we compute the FFT of both windows and
        compare the phase of the dominant bin, not the frequency ratio.
        """
        price = np.asarray(price, dtype=float)
        n = len(price)
        lambda3 = np.zeros(n, dtype=int)

        win = max(30, self.n_killzone * 2)

        for i in range(win, n):
            short_window = price[i - win:i]
            long_window  = price[:i]

            # FFT of each window — use the dominant-frequency bin index
            fft_short = np.fft.rfft(short_window - short_window.mean())
            fft_long  = np.fft.rfft(long_window  - long_window.mean())

            # Dominant bin in the short window
            dom_bin_short = int(np.argmax(np.abs(fft_short)))

            # Corresponding bin in long window (scale to same frequency)
            # Map short-window bin → frequency → long-window bin
            freq = dom_bin_short / win  # normalised frequency
            dom_bin_long = int(round(freq * len(long_window)))
            dom_bin_long = min(dom_bin_long, len(fft_long) - 1)

            if dom_bin_long == 0 or dom_bin_short == 0:
                continue

            phase_short = np.angle(fft_short[dom_bin_short])
            phase_long  = np.angle(fft_long[dom_bin_long])
            phase_diff  = np.abs(phase_short - phase_long)
            # Wrap to [0, π]
            phase_diff  = min(phase_diff, 2 * np.pi - phase_diff)

            lambda3[i] = int(phase_diff > np.pi / 2)

        return lambda3

    def lambda_4_confluence_collapse(
        self,
        phi: np.ndarray,
        returns: np.ndarray,
    ) -> np.ndarray:
        """
        λ₄ = 1[ φ_t > 0.6 ∧ E[P&L | φ_t > 0.6] < 0 ]
        """
        phi     = np.asarray(phi)
        returns = np.asarray(returns)

        kernel   = np.ones(self.n_confluence) / self.n_confluence
        mean_ret = np.convolve(returns, kernel, mode='same')
        half = self.n_confluence // 2
        mean_ret[:half] = np.nan
        mean_ret[-half:] = np.nan

        return ((phi > 0.6) & (mean_ret < 0)).astype(int)

    def lambda_5_liquidity_field_inversion(
        self,
        price: np.ndarray,
        volume: np.ndarray,
        hist_gradient: np.ndarray | None = None,
    ) -> np.ndarray:
        """
        λ₅ = 1[ ∇U(P_t) · ∇U_hist(P_t) < 0 ]
        """
        price  = np.asarray(price)
        volume = np.asarray(volume)
        grad_cur = liquidity_potential_gradient(price, volume)

        if hist_gradient is None:
            alpha = 2 / (self.n_killzone + 1)
            hist = np.empty_like(grad_cur)
            hist[0] = grad_cur[0]
            for i in range(1, len(grad_cur)):
                hist[i] = alpha * grad_cur[i] + (1 - alpha) * hist[i - 1]
            hist_gradient = hist

        return ((grad_cur * hist_gradient) < 0).astype(int)

    # ------------------------------------------------------------------ #
    # Compute all lambdas in one pass (avoids double work)
    # ------------------------------------------------------------------ #

    def _compute_all_lambdas(
        self,
        sigma: np.ndarray,
        phi: np.ndarray,
        price: np.ndarray,
        high: np.ndarray,
        low: np.ndarray,
        close: np.ndarray,
        volume: np.ndarray,
        returns: np.ndarray,
        killzone_mask: np.ndarray,
        sampling_rate: float = 1.0,
    ) -> tuple[np.ndarray, ...]:
        atr_20 = atr(high, low, close, period=20)
        λ1 = self.lambda_1_phase_entrapment(sigma, price, atr_20)
        λ2 = self.lambda_2_temporal_alignment_failure(returns, killzone_mask)
        λ3 = self.lambda_3_spectral_phase_inversion(price, sampling_rate)
        λ4 = self.lambda_4_confluence_collapse(phi, returns)
        λ5 = self.lambda_5_liquidity_field_inversion(price, volume)
        return λ1, λ2, λ3, λ4, λ5

    # ------------------------------------------------------------------ #
    # Unified trigger 𝓡ₜ
    # ------------------------------------------------------------------ #

    def compute_trigger(
        self,
        sigma: np.ndarray,
        phi: np.ndarray,
        price: np.ndarray,
        high: np.ndarray,
        low: np.ndarray,
        close: np.ndarray,
        volume: np.ndarray,
        returns: np.ndarray,
        killzone_mask: np.ndarray,
        sampling_rate: float = 1.0,
    ) -> np.ndarray:
        """
        𝓡ₜ = λ₁ ∨ λ₂ ∨ λ₃ ∨ λ₄ ∨ λ₅
        Returns int array (1 = triggered).
        """
        λ1, λ2, λ3, λ4, λ5 = self._compute_all_lambdas(
            sigma, phi, price, high, low, close,
            volume, returns, killzone_mask, sampling_rate,
        )
        R = λ1.astype(bool) | λ2.astype(bool) | λ3.astype(bool) \
          | λ4.astype(bool) | λ5.astype(bool)
        return R.astype(int)

    # ------------------------------------------------------------------ #
    # Severity score
    # ------------------------------------------------------------------ #

    def severity_score(
        self,
        sigma: np.ndarray,
        phi: np.ndarray,
        price: np.ndarray,
        high: np.ndarray,
        low: np.ndarray,
        close: np.ndarray,
        volume: np.ndarray,
        returns: np.ndarray,
        killzone_mask: np.ndarray,
        sampling_rate: float = 1.0,
    ) -> np.ndarray:
        """
        𝓡_score = Σ wᵢ λᵢ  ∈ [0, 1]
        """
        λ1, λ2, λ3, λ4, λ5 = self._compute_all_lambdas(
            sigma, phi, price, high, low, close,
            volume, returns, killzone_mask, sampling_rate,
        )
        lambdas = np.vstack([λ1, λ2, λ3, λ4, λ5])
        return self.weights @ lambdas

    def is_triggered_by_score(self, score: np.ndarray) -> np.ndarray:
        return (score > self.score_threshold).astype(int)

    # ------------------------------------------------------------------ #
    # State transition helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def force_reset_sigma() -> int:
        """𝓡ₜ = 1 → σ_{t+1} = 0 (Accumulation)."""
        return 0

    @staticmethod
    def halt_execution() -> float:
        """𝓡ₜ = 1 → u_t = 0 (no trading)."""
        return 0.0

    # ------------------------------------------------------------------ #
    # Internal utilities
    # ------------------------------------------------------------------ #

    @staticmethod
    def _tau_stay(sigma: np.ndarray) -> np.ndarray:
        """Consecutive bars where sigma == 2 (distribution phase)."""
        sigma = np.asarray(sigma)
        stay  = np.zeros_like(sigma, dtype=int)
        for i in range(1, len(sigma)):
            stay[i] = stay[i - 1] + 1 if sigma[i] == 2 else 0
        return stay
