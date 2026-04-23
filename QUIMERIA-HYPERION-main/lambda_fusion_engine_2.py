# lambda_fusion_engine.py
# System: QUIMERIA Sovereign Market Kernel
# Layer: Ring 0 (Fusion & Veto Authority)
# Purpose: The "Synthetic Fuse" - Integrates Structure (S1), Geometry (S2), and Kinetics (S3)
#          into a single executable decision (Full Send, Caution, Halt).

import math
from typing import Dict, List, Tuple, Any

class LambdaFusionEngine:
    """
    The central decision brain of QUIMERIA.
    
    It takes the raw telemetry from L1-L4 sensors and applies the 
    'Synthetic Fuse' logic to determine the validity of a trade setup.
    """
    
    def __init__(self):
        # Thresholds for the "Execution Force"
        self.MIN_BODY_RATIO = 0.6      # System 3: Impulsive move requirement
        self.MIN_CONFIDENCE = 0.2      # Minimum fusion confidence to proceed
        self.TOPOLOGY_THRESHOLD = 0.7  # Sensitivity to topological fractures
        
    def evaluate(self, smk_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point. Called by SMKPipeline on every bar step.
        
        Args:
            smk_data: The aggregated dictionary from smk_pipeline.step() containing 
                      telemetry from all 18+ modules.
                      
        Returns:
            A dictionary containing the fusion decision, confidence, and veto status.
        """
        
        # --- 1. EXTRACT TELEMETRY (Safe Access) ---
        
        # System 1: Structure (Discount/Premium)
        pd_status = smk_data.get('premium_discount', {}).get('status', 'NEUTRAL')
        
        # System 2: Geometry (Stability/Veto)
        # We check Topological Fracture (Persistent Homology) and KL Divergence (Regime Shift)
        topo_fractured = smk_data.get('topology', {}).get('fractured', False)
        kl_regime_fracture = smk_data.get('kl', {}).get('stable', True) == False
        mandra_stable = smk_data.get('mandra', {}).get('regime_stable', True)
        
        # System 3: Kinetics (Displacement + FVG)
        disp_data = smk_data.get('displacement', {})
        is_displacement = disp_data.get('is_disp', False)
        disp_dir = disp_data.get('dir', 0)  # 1 (Bull) or -1 (Bear)
        body_ratio = disp_data.get('body_ratio', 0.0)
        
        fvg_data = smk_data.get('fvg', {})
        fvg_list = fvg_data.get('recent', [])
        
        # --- 2. THE CIRCUIT BREAKER (System 2 Veto) ---
        # SCENARIO C: HALT (The "Trap" Scenario)
        # If Geometry is fractured, or Information Energy (Mandra) is negative, 
        # we HALT immediately regardless of Kinetics.
        
        veto_reasons = []
        
        if topo_fractured:
            veto_reasons.append("TOPO:H1_FRACTURE")
            
        if kl_regime_fracture:
            veto_reasons.append("KL:REGIME_FRACTURE")
            
        if not mandra_stable:
            veto_reasons.append("MANDRA:GATE_CLOSED")
            
        # If ANY veto condition is met, we override everything else.
        if veto_reasons:
            return self._build_output(
                decision="HALT",
                confidence=0.0,
                veto_active=True,
                regime="MALFUNCTION",
                reasons=veto_reasons,
                active_lambdas=[]
            )

        # --- 3. CHECK KINETIC ENTRY (System 3) ---
        # We require a REAL displacement, not a slow grind.
        # We require an FVG aligned with that displacement.
        
        kinetic_valid = False
        aligned_fvg = None
        
        # 3a. Validate Displacement Quality
        # Is the body ratio high enough to count as "Force"?
        if is_displacement and body_ratio >= self.MIN_BODY_RATIO:
            
            # 3b. Validate FVG Alignment
            # Look for an FVG that supports the displacement direction
            for fvg in fvg_list:
                # fvg['type'] is usually 'bullish' or 'bearish' in the engine
                if (disp_dir == 1 and fvg['type'] == 'bullish') or \
                   (disp_dir == -1 and fvg['type'] == 'bearish'):
                    kinetic_valid = True
                    aligned_fvg = fvg
                    break # Found our entry point
        
        # If no kinetic force, we wait.
        if not kinetic_valid:
            return self._build_output(
                decision="WAIT",
                confidence=0.1, # Low confidence, just monitoring
                veto_active=False,
                regime="STASIS",
                reasons=["NO_KINETIC_FORCE"],
                active_lambdas=[]
            )

        # --- 4. THE WEIGHTED LOGIC (Scenario A & B) ---
        
        # SCENARIO A: FULL SEND
        # Structure: Discount
        # Geometry: Stable (Passed checks above)
        # Kinetics: Displacement + FVG
        if pd_status == 'DISCOUNT' and disp_dir == 1:
            return self._build_output(
                decision="FULL_SEND",
                confidence=0.95,
                veto_active=False,
                regime="ACCM_EXPANSION",
                reasons=["S1:DISCOUNT", "S3:DISPLACEMENT+FVG", "S2:STABLE"],
                active_lambdas=["DISP", "FVG", "Mandra"]
            )
            
        elif pd_status == 'DISCOUNT' and disp_dir == -1:
            # Short at discount? Unlikely but possible in complex corrections.
            # Treat as Caution unless we are in a clear distribution phase (not covered here directly).
            pass

        # SCENARIO B: CAUTION (Wait for Retrace)
        # Structure: Premium
        # Geometry: Stable
        # Kinetics: Displacement + FVG
        elif pd_status == 'PREMIUM' and disp_dir == 1:
            # We have a bullish trigger, but we are in expensive territory.
            # We signal CAUTION to reduce size or wait for price to return to value.
            return self._build_output(
                decision="CAUTION",
                confidence=0.60, # Valid signal, bad location
                veto_active=False,
                regime="DISTRIBUTION_RISK",
                reasons=["S1:PREMIUM", "S3:DISPLACEMENT+FVG", "WAIT_FOR_RETRACE"],
                active_lambdas=["DISP", "FVG"]
            )
            
        # Generic Fallback for valid kinetics but neutral structure
        return self._build_output(
            decision="MONITOR",
            confidence=0.5,
            veto_active=False,
            regime="TRANSITION",
            reasons=["KINETIC_ACTIVE", "STRUCTURE_NEUTRAL"],
            active_lambdas=["DISP", "FVG"]
        )

    def _build_output(self, decision: str, confidence: float, veto_active: bool, 
                      regime: str, reasons: List[str], active_lambdas: List[str]) -> Dict[str, Any]:
        """
        Formats the output dictionary to match the expectations of smk_pipeline.py
        and the Frontend.
        """
        return {
            "p_fused": confidence,
            "confidence": confidence,
            "veto_active": veto_active,
            "regime": regime,
            "status": decision, # "FULL_SEND", "HALT", "CAUTION", "WAIT"
            "active_lambdas": active_lambdas,
            "reasons": reasons,
            # Helper for AEGIS bridge to determine position size
            "risk_multiplier": 1.0 if decision == "FULL_SEND" else (0.5 if decision == "CAUTION" else 0.0)
        }

# Singleton instance for the pipeline
_fusion_instance = LambdaFusionEngine()

def fuse(smk_data: Dict[str, Any]) -> Dict[str, Any]:
    """Wrapper function for easy import in smk_pipeline.py"""
    return _fusion_instance.evaluate(smk_data)
