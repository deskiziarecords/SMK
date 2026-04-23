import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Optional

@dataclass
class ExpansionTelemetry:
    sigma_t: int           # 0=ACCUM, 1=MANIP, 2=EXPANSION [8]
    expansion_prob: float  # P_amp score [9]
    is_entrapped: bool     # λ1 status [10]
    target_dol: float      # Draw on Liquidity target (ERL/IRL) [11]
    status: str

class IPDAExpansionPredictor:
    """
    Sovereign Market Kernel: Expansion Prediction Engine.
    Predicts displacement by identifying mathematical exhaustion of volatility.
    """
    def __init__(self, delta: float = 0.7, tau_max: int = 20):
        self.delta = delta      # Volatility ratio threshold (0.7δ) [3]
        self.tau_max = tau_max  # Stagnation persistence limit [10]
        self.timer = 0

    def calculate_volatility_ratio(self, prices: np.ndarray, atr20: float) -> float:
        """Quantifies the exact decay rate of intra-range volatility [2, 3]."""
        # Price Variation Integral (Vt)
        price_variation = np.sum(np.abs(np.diff(prices)))
        return price_variation / (atr20 + 1e-9)

    def predict_expansion(self, 
                          ohlcv_window: pd.DataFrame, 
                          magnets: Dict[str, float], 
                          news_interrupt: bool = False) -> ExpansionTelemetry:
        """
        Master Logic: Fuses λ1 Entrapment with Macro Interrupt sentiment [9].
        """
        close_prices = ohlcv_window['close'].values
        atr20 = ohlcv_window['atr'].iloc[-1]
        
        # 1. Evaluate λ1 Phase Entrapment
        v_ratio = self.calculate_volatility_ratio(close_prices, atr20)
        is_entrapped = v_ratio < self.delta
        
        if is_entrapped:
            self.timer += 1
        else:
            self.timer = 0

        # 2. Probability Scoring (P_amp)
        # Re-weight if news_interrupt is False to allow expansion detection on decay alone
        if not news_interrupt:
            p_amp = min(1.0, (self.timer / self.tau_max) * 1.5) # Boost persistence impact
        else:
            p_amp = (0.4 * min(1.0, self.timer / self.tau_max)) + 0.6

        # 3. Check for Displacement (λ6 Veto check for early activation) [12, 13]
        last_candle = ohlcv_window.iloc[-1]
        body_ratio = abs(last_candle['close'] - last_candle['open']) / (last_candle['high'] - last_candle['low'] + 1e-9)
        has_displacement = body_ratio > 0.75 and (last_candle['high'] - last_candle['low']) > (1.2 * atr20)

        # 4. State Assignment and DOL Targeting [11]
        current_state = 0 # ACCUMULATION
        if p_amp > 0.6 or has_displacement:
            current_state = 2 # EXPANSION/DISTRIBUTION
            status = "EXPANSION_ACTIVE"
        elif is_entrapped:
            status = "PHASE_ENTRAPMENT_λ1"
        else:
            status = "IDLE_STASIS"

        # Targets are set at External Range Liquidity (ERL) - H60/L60 [11, 15]
        target = magnets.get('H60') if last_candle['close'] > magnets.get('EQ') else magnets.get('L60')

        return ExpansionTelemetry(
            sigma_t=current_state,
            expansion_prob=round(p_amp, 4),
            is_entrapped=is_entrapped,
            target_dol=target,
            status=status
        )

