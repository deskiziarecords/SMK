import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

class ReversalModelManager:
    """
    Manages multiple ML models for reversal prediction.
    Supports switching between models, training, and persistence.
    """
    def __init__(self, models_dir: str = "models"):
        self.models_dir = models_dir
        if not os.path.exists(models_dir):
            os.makedirs(models_dir)
        
        self.models: Dict[str, Any] = {}
        self.active_model_name: str = "default_rf"
        self._load_all_models()

    def _load_all_models(self):
        # Default simple models if none exist
        self.models["random_forest"] = RandomForestClassifier(n_estimators=50, max_depth=5)
        self.models["logistic_regression"] = LogisticRegression()
        
        # Load from disk if available
        for f in os.listdir(self.models_dir):
            if f.endswith(".joblib"):
                name = f.replace(".joblib", "")
                try:
                    self.models[name] = joblib.load(os.path.join(self.models_dir, f))
                    print(f"[REVERSAL] Loaded model: {name}")
                except Exception as e:
                    print(f"[REVERSAL] Failed to load {f}: {e}")

    def select_model(self, name: str):
        if name in self.models:
            self.active_model_name = name
            return True
        return False

    def predict(self, features: np.ndarray) -> float:
        """Returns probability of reversal (0.0 to 1.0)"""
        model = self.models.get(self.active_model_name)
        if not model:
            return 0.5
        
        try:
            # Reshape if single sample
            if features.ndim == 1:
                features = features.reshape(1, -1)
            
            # Use predict_proba for classification
            if hasattr(model, "predict_proba"):
                # Assume binary classification where class 1 is reversal
                probs = model.predict_proba(features)
                return float(probs[0][1])
            return float(model.predict(features)[0])
        except Exception as e:
            print(f"[REVERSAL] Prediction error: {e}")
            return 0.5

    def train_model(self, name: str, X: np.ndarray, y: np.ndarray):
        """Train or retrain a model and save it."""
        print(f"[REVERSAL] Training model: {name} with {len(X)} samples")
        model = self.models.get(name)
        if not model:
            # Create a default RF if name is new
            model = RandomForestClassifier(n_estimators=100)
            self.models[name] = model
        
        try:
            model.fit(X, y)
            self.save_model(name)
            return True
        except Exception as e:
            print(f"[REVERSAL] Training error: {e}")
            return False

    def save_model(self, name: str):
        model = self.models.get(name)
        if model:
            path = os.path.join(self.models_dir, f"{name}.joblib")
            joblib.dump(model, path)
            print(f"[REVERSAL] Saved model to {path}")

    def list_models(self) -> List[str]:
        return list(self.models.keys())
