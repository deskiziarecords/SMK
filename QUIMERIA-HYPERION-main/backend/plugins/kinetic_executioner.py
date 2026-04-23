"""
plugins/kinetic_executioner.py
EXE-ext — System3 KineticExecutioner
Displacement confirmation + FVG re-entry zone + Mandra gate check.
Outputs a high-conviction execution signal when all three conditions align.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from plugins import SMKPlugin


class KineticExecutionerPlugin(SMKPlugin):
    name            = "KineticExec"
    layer           = "EXE-ext"
    sensor_id       = "p07"
    requires_warmup = 3   # needs at least prev + current bar

    def __init__(self, body_threshold: float = 0.6, fvg_min_size: float = 0.0001):
        super().__init__()
        self.body_threshold = body_threshold
        self.fvg_min_size   = fvg_min_size

    # ── core kinetics ─────────────────────────────────────────────────────────

    def _displacement(self, candle: dict) -> tuple[bool, float]:
        rng  = candle["high"] - candle["low"]
        if rng < 1e-9:
            return False, 0.0
        body  = abs(candle["close"] - candle["open"])
        ratio = body / rng
        return bool(ratio >= self.body_threshold), float(round(ratio, 4))

    def _fvg(self, prev: dict, cur: dict) -> tuple[bool, float, float, str]:
        """Two-candle FVG check — gap between prev high/low and cur low/high."""
        # Bullish FVG: prev high < cur low (gap above prev, below cur)
        if prev["high"] < cur["low"]:
            size = cur["low"] - prev["high"]
            if size >= self.fvg_min_size:
                return True, float(cur["low"]), float(prev["high"]), "BULLISH"
        # Bearish FVG: prev low > cur high (gap below prev, above cur)
        elif prev["low"] > cur["high"]:
            size = prev["low"] - cur["high"]
            if size >= self.fvg_min_size:
                return True, float(prev["low"]), float(cur["high"]), "BEARISH"
        return False, 0.0, 0.0, "NONE"

    def _mandra_gate(self, smk: dict) -> bool:
        """
        Real Mandra gate check wired to SMK output.
        Passes when: gate open AND delta_e non-negative AND regime stable.
        """
        mandra = smk.get("mandra", {})
        kl     = smk.get("kl",     {})
        topo   = smk.get("topology",{})
        return (
            bool(mandra.get("open", True)) and
            float(mandra.get("delta_e", 0.0)) >= 0 and
            bool(kl.get("stable", True)) and
            not bool(topo.get("fractured", False))
        )

    def _signal(self, cur: dict, fvg_top: float, fvg_bottom: float,
                direction: str, atr: float) -> dict:
        if direction == "BULLISH":
            entry = fvg_top
            sl    = fvg_bottom - atr * 0.5
            tp    = entry + atr * 2.5
        else:
            entry = fvg_bottom
            sl    = fvg_top + atr * 0.5
            tp    = entry - atr * 2.5

        risk      = abs(entry - sl)
        rr        = abs(tp - entry) / risk if risk > 1e-9 else 0.0
        risk_pips = risk / 0.0001

        return {
            "signal_action":    "EXECUTE",
            "signal_direction": str(direction),
            "signal_entry":     float(round(entry, 5)),
            "signal_sl":        float(round(sl,    5)),
            "signal_tp":        float(round(tp,    5)),
            "signal_rr":        float(round(rr,    2)),
            "signal_pips":      float(round(risk_pips, 1)),
            "confidence":       "HIGH_KINETIC",
        }

    # ── plugin entry point ────────────────────────────────────────────────────

    def update(self, bar: dict, df: pd.DataFrame, smk: dict) -> dict:
        if len(df) < 2:
            return {"status": "INSUFFICIENT_DATA", "active": False, "score": 0.0}

        cur  = bar
        prev = df.iloc[-2].to_dict()
        atr  = float(df["atr"].iloc[-1]) if "atr" in df.columns else 0.001
        atr  = max(atr, 1e-5)

        # Add ATR to cur dict for signal generation
        cur_with_atr = dict(cur, atr=atr)

        # --- 1. Displacement check ---
        is_disp, body_ratio = self._displacement(cur)

        # --- 2. FVG check ---
        fvg_exists, fvg_top, fvg_bottom, fvg_dir = self._fvg(prev, cur)

        # --- 3. Mandra gate (wired to real SMK output) ---
        gate_open = self._mandra_gate(smk)

        # --- 4. Direction confirmation from SMK bias ---
        smk_dir   = smk.get("displacement", {}).get("dir", 0)
        bias      = smk.get("bias", {}).get("bias", "NEUTRAL")
        # Confirm FVG direction agrees with SMK structural bias
        bias_agrees = (
            (fvg_dir == "BULLISH" and (smk_dir == 1 or bias == "BULLISH")) or
            (fvg_dir == "BEARISH" and (smk_dir == -1 or bias == "BEARISH")) or
            fvg_dir == "NONE"
        )

        # --- 5. Kinetic signal ---
        armed   = bool(is_disp and fvg_exists and gate_open and bias_agrees)
        score   = float(body_ratio * (1.0 if fvg_exists else 0.0) * (1.0 if gate_open else 0.5))
        score   = float(round(min(1.0, score), 3))

        base = {
            "is_displacement":  bool(is_disp),
            "body_ratio":       float(body_ratio),
            "fvg_exists":       bool(fvg_exists),
            "fvg_top":          float(fvg_top),
            "fvg_bottom":       float(fvg_bottom),
            "fvg_direction":    str(fvg_dir),
            "mandra_gate_open": bool(gate_open),
            "bias_agrees":      bool(bias_agrees),
            "active":           armed,
            "score":            score,
            "status":           "KINETIC_ARMED" if armed else "SCANNING",
            # empty signal defaults
            "signal_action":    "HOLD",
            "signal_direction": "NONE",
            "signal_entry":     0.0,
            "signal_sl":        0.0,
            "signal_tp":        0.0,
            "signal_rr":        0.0,
            "signal_pips":      0.0,
            "confidence":       "NONE",
        }

        if armed:
            sig = self._signal(cur_with_atr, fvg_top, fvg_bottom, fvg_dir, atr)
            base.update(sig)

        return base
