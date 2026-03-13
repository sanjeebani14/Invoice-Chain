from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, roc_auc_score
from xgboost import XGBClassifier


def benford_prob(digit: int) -> float:
    return float(np.log10(1 + 1 / max(1, digit)))


def first_digit(amount: float) -> int:
    if amount <= 0:
        return 1
    for ch in str(int(abs(amount))):
        if ch.isdigit() and ch != "0":
            return int(ch)
    return 1


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    data = df.copy()

    data["step"] = pd.to_numeric(data["step"], errors="coerce").fillna(0)
    data["amount"] = pd.to_numeric(data["amount"], errors="coerce").fillna(0)
    data["oldbalanceOrg"] = pd.to_numeric(data["oldbalanceOrg"], errors="coerce").fillna(0)
    data["newbalanceOrig"] = pd.to_numeric(data["newbalanceOrig"], errors="coerce").fillna(0)
    data["oldbalanceDest"] = pd.to_numeric(data["oldbalanceDest"], errors="coerce").fillna(0)
    data["newbalanceDest"] = pd.to_numeric(data["newbalanceDest"], errors="coerce").fillna(0)

    data = data.sort_values(["nameOrig", "step"]).reset_index(drop=True)

    rolling_mean = (
        data.groupby("nameOrig")["amount"]
        .transform(lambda s: s.rolling(window=30, min_periods=3).mean().shift(1))
    )
    rolling_std = (
        data.groupby("nameOrig")["amount"]
        .transform(lambda s: s.rolling(window=30, min_periods=3).std().shift(1))
    )
    rolling_std = rolling_std.replace(0, np.nan)

    data["amount_velocity_zscore"] = ((data["amount"] - rolling_mean) / rolling_std).fillna(0)

    first_digits = data["amount"].apply(first_digit)
    observed = first_digits.value_counts(normalize=True).to_dict()
    data["benford_expected"] = first_digits.map(benford_prob)
    data["benford_observed"] = first_digits.map(observed).fillna(0)
    data["benford_deviation"] = (data["benford_observed"] - data["benford_expected"]).abs()

    # PaySim `step` is hours from start of simulation.
    data["hour_of_day"] = data["step"] % 24
    data["weekday"] = (data["step"] // 24) % 7
    data["hour_sin"] = np.sin(2 * np.pi * data["hour_of_day"] / 24.0)
    data["hour_cos"] = np.cos(2 * np.pi * data["hour_of_day"] / 24.0)
    data["weekday_sin"] = np.sin(2 * np.pi * data["weekday"] / 7.0)
    data["weekday_cos"] = np.cos(2 * np.pi * data["weekday"] / 7.0)

    data["log_amount"] = np.log1p(data["amount"])

    type_dummies = pd.get_dummies(data["type"], prefix="txn", dtype=int)
    data = pd.concat([data, type_dummies], axis=1)

    feature_cols = [
        "amount",
        "log_amount",
        "oldbalanceOrg",
        "newbalanceOrig",
        "oldbalanceDest",
        "newbalanceDest",
        "amount_velocity_zscore",
        "benford_deviation",
        "hour_sin",
        "hour_cos",
        "weekday_sin",
        "weekday_cos",
    ] + list(type_dummies.columns)

    return data[feature_cols].astype(float)


def train_model(df: pd.DataFrame, contamination: float) -> tuple[IsolationForest, pd.DataFrame, pd.Series]:
    feature_df = build_features(df)
    labels = pd.to_numeric(df["isFraud"], errors="coerce").fillna(0).astype(int)

    # Train on all examples to preserve broad transaction geometry.
    model = IsolationForest(
        n_estimators=300,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(feature_df)

    return model, feature_df, labels


def train_supervised_classifier(
    df: pd.DataFrame,
    minority_target_fraction: float = 0.05,
) -> tuple[XGBClassifier, pd.DataFrame, pd.Series, dict[str, float]]:
    """
    Train an XGBoost classifier on the same feature space using SMOTE to
    rebalance the minority fraud class. Designed to be used once you have a
    meaningful number of resolved fraud examples.
    """
    feature_df = build_features(df)
    y = pd.to_numeric(df["isFraud"], errors="coerce").fillna(0).astype(int)

    # Guardrail: if there are almost no positive labels, supervised learning
    # will not be meaningful – fall back to passthrough behaviour.
    pos_frac = float(y.mean())
    if pos_frac <= 0 or y.sum() < 10:
        baseline = {
            "pos_fraction": pos_frac,
            "used_smote": False,
            "note": "Not enough fraud labels to train a stable supervised model.",
        }
        dummy_model = XGBClassifier()
        return dummy_model, feature_df, y, baseline

    smote = SMOTE(sampling_strategy=minority_target_fraction, random_state=42)
    x_res, y_res = smote.fit_resample(feature_df, y)

    clf = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(x_res, y_res)

    return clf, feature_df, y, {
        "pos_fraction": pos_frac,
        "used_smote": True,
        "rows_original": int(len(df)),
        "rows_after_smote": int(len(x_res)),
    }


def evaluate_model(model: IsolationForest, x: pd.DataFrame, y: pd.Series) -> dict[str, float]:
    pred = model.predict(x)
    pred_binary = (pred == -1).astype(int)
    raw_score = -model.decision_function(x)

    report = classification_report(y, pred_binary, output_dict=True, zero_division=0)
    auc = roc_auc_score(y, raw_score) if y.nunique() > 1 else 0.0

    return {
        "fraud_precision": float(report["1"]["precision"]),
        "fraud_recall": float(report["1"]["recall"]),
        "fraud_f1": float(report["1"]["f1-score"]),
        "roc_auc": float(auc),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train InvoiceChain anomaly model from PaySim")
    parser.add_argument(
        "--dataset",
        type=str,
        default="data/paysim dataset.csv",
        help="Path to PaySim CSV relative to backend/",
    )
    parser.add_argument(
        "--out-model",
        type=str,
        default="app/ml/invoice_iforest.joblib",
        help="Output path for serialized IsolationForest model.",
    )
    parser.add_argument(
        "--out-meta",
        type=str,
        default="app/ml/invoice_iforest_meta.json",
        help="Output path for metadata and feature list.",
    )
    parser.add_argument(
        "--contamination",
        type=float,
        default=0.01,
        help="Expected anomaly rate for IsolationForest.",
    )
    parser.add_argument(
        "--out-supervised-model",
        type=str,
        default="app/ml/invoice_fraud_xgb.json",
        help="Output path for supervised XGBoost classifier.",
    )

    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parents[1]
    dataset_path = (base_dir / args.dataset).resolve()
    model_path = (base_dir / args.out_model).resolve()
    meta_path = (base_dir / args.out_meta).resolve()
    supervised_model_path = (base_dir / args.out_supervised_model).resolve()

    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    model_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.parent.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(dataset_path)
    model, x, y = train_model(df, contamination=args.contamination)
    metrics = evaluate_model(model, x, y)

    joblib.dump(model, model_path)

    # Supervised path (optional; will no-op gracefully if there are no labels)
    clf, x_sup, y_sup, smote_meta = train_supervised_classifier(df)
    try:
        clf.save_model(supervised_model_path)
        supervised_info = {
            "path": str(supervised_model_path),
            "enabled": bool(y_sup.sum() >= 10),
            "smote": smote_meta,
        }
    except Exception:
        supervised_info = {
            "path": str(supervised_model_path),
            "enabled": False,
            "smote": smote_meta,
            "note": "Failed to serialise supervised model; anomaly engine will ignore it.",
        }

    metadata = {
        "dataset": str(dataset_path),
        "model": "IsolationForest",
        "contamination": args.contamination,
        "feature_columns": list(x.columns),
        "rows": int(len(df)),
        "metrics": metrics,
        "supervised": supervised_info,
    }

    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Model saved to: {model_path}")
    print(f"Metadata saved to: {meta_path}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
