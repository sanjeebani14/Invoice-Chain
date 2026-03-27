from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
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


def _normalize_status(raw: str | float | int | None) -> str:
    if raw is None:
        return "unknown"
    return re.sub(r"[^a-z0-9]+", "_", str(raw).strip().lower()).strip("_") or "unknown"


def _derive_seller_id(data: pd.DataFrame) -> pd.Series:
    if "seller_id" in data.columns:
        return pd.to_numeric(data["seller_id"], errors="coerce").fillna(-1).astype(int)
    if "sellerId" in data.columns:
        return pd.to_numeric(data["sellerId"], errors="coerce").fillna(-1).astype(int)

    if "client" in data.columns:
        proxy = data["client"].astype(str).str.strip().replace("", "unknown_client")
    elif "country" in data.columns:
        proxy = data["country"].astype(str).str.strip().replace("", "unknown_country")
    else:
        proxy = pd.Series(["global"] * len(data), index=data.index)

    return pd.factorize(proxy)[0] + 1


def _derive_labels(data: pd.DataFrame) -> pd.Series:
    if "isFraud" in data.columns:
        return pd.to_numeric(data["isFraud"], errors="coerce").fillna(0).astype(int)

    if "invoiceStatus" in data.columns:
        normalized = data["invoiceStatus"].map(_normalize_status)
        known_bad = {
            "overdue",
            "disputed",
            "cancelled",
            "canceled",
            "fraud",
            "fraudulent",
        }
        return normalized.isin(known_bad).astype(int)

    return pd.Series(np.zeros(len(data), dtype=int), index=data.index)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    data = df.copy()

    data["issuedDate"] = pd.to_datetime(data.get("issuedDate"), errors="coerce")
    data["dueDate"] = pd.to_datetime(data.get("dueDate"), errors="coerce")
    data["total"] = pd.to_numeric(data.get("total"), errors="coerce").fillna(0)
    data["discount"] = pd.to_numeric(data.get("discount"), errors="coerce").fillna(0)
    data["tax"] = pd.to_numeric(data.get("tax"), errors="coerce").fillna(0)
    data["balance"] = pd.to_numeric(data.get("balance"), errors="coerce").fillna(0)

    data["seller_id"] = _derive_seller_id(data)
    data["issued_ts"] = data["issuedDate"].fillna(pd.Timestamp("1970-01-01"))
    data = data.sort_values(["seller_id", "issued_ts"]).reset_index(drop=True)

    data["amount"] = data["total"].clip(lower=0)
    data["log_amount"] = np.log1p(data["amount"])

    data["net_value"] = (data["total"] - data["discount"] + data["tax"]).clip(lower=0)
    data["net_delta_abs"] = (data["net_value"] - data["total"]).abs()
    data["discount_ratio"] = (
        (data["discount"] / (data["total"].replace(0, np.nan))).fillna(0).clip(0, 2)
    )
    data["tax_ratio"] = (
        (data["tax"] / (data["total"].replace(0, np.nan))).fillna(0).clip(0, 2)
    )
    data["balance_ratio"] = (
        (data["balance"] / (data["total"].replace(0, np.nan))).fillna(0).clip(0, 3)
    )

    rolling_mean = data.groupby("seller_id")["amount"].transform(
        lambda s: s.rolling(window=30, min_periods=3).mean().shift(1)
    )
    rolling_std = data.groupby("seller_id")["amount"].transform(
        lambda s: s.rolling(window=30, min_periods=3).std().shift(1)
    )
    rolling_std = rolling_std.replace(0, np.nan)
    data["amount_velocity_zscore"] = (
        (data["amount"] - rolling_mean) / rolling_std
    ).fillna(0)

    first_digits = data["amount"].apply(first_digit)
    observed = first_digits.value_counts(normalize=True).to_dict()
    data["benford_expected"] = first_digits.map(benford_prob)
    data["benford_observed"] = first_digits.map(observed).fillna(0)
    data["benford_deviation"] = (
        data["benford_observed"] - data["benford_expected"]
    ).abs()

    data["issued_hour"] = data["issuedDate"].dt.hour.fillna(12).astype(float)
    data["issued_weekday"] = data["issuedDate"].dt.weekday.fillna(0).astype(float)
    data["hour_sin"] = np.sin(2 * np.pi * data["issued_hour"] / 24.0)
    data["hour_cos"] = np.cos(2 * np.pi * data["issued_hour"] / 24.0)
    data["weekday_sin"] = np.sin(2 * np.pi * data["issued_weekday"] / 7.0)
    data["weekday_cos"] = np.cos(2 * np.pi * data["issued_weekday"] / 7.0)

    due_days = (
        (data["dueDate"] - data["issuedDate"]).dt.total_seconds() / 86400.0
    ).fillna(30.0)
    data["days_to_due"] = due_days.clip(lower=0, upper=365)

    data["invoice_status_norm"] = data.get("invoiceStatus", "unknown").map(
        _normalize_status
    )
    data["country_norm"] = (
        data.get("country", "unknown").astype(str).str.strip().str.lower()
    )
    data["service_norm"] = (
        data.get("service", "unknown").astype(str).str.strip().str.lower()
    )

    status_dummies = pd.get_dummies(
        data["invoice_status_norm"], prefix="status", dtype=int
    )
    country_dummies = pd.get_dummies(data["country_norm"], prefix="country", dtype=int)
    service_dummies = pd.get_dummies(data["service_norm"], prefix="service", dtype=int)

    top_country_cols = list(
        country_dummies.sum().sort_values(ascending=False).head(20).index
    )
    top_service_cols = list(
        service_dummies.sum().sort_values(ascending=False).head(20).index
    )
    data = pd.concat(
        [
            data,
            status_dummies,
            country_dummies[top_country_cols],
            service_dummies[top_service_cols],
        ],
        axis=1,
    )

    feature_cols = (
        [
            "amount",
            "log_amount",
            "net_value",
            "net_delta_abs",
            "discount_ratio",
            "tax_ratio",
            "balance_ratio",
            "days_to_due",
            "amount_velocity_zscore",
            "benford_deviation",
            "hour_sin",
            "hour_cos",
            "weekday_sin",
            "weekday_cos",
        ]
        + list(status_dummies.columns)
        + top_country_cols
        + top_service_cols
    )

    return data[feature_cols].astype(float)


def train_model(
    df: pd.DataFrame, contamination: float
) -> tuple[IsolationForest, pd.DataFrame, pd.Series]:
    feature_df = build_features(df)
    labels = _derive_labels(df)

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

    feature_df = build_features(df)
    y = _derive_labels(df)

    pos_frac = float(y.mean())
    if pos_frac <= 0 or y.sum() < 10:
        baseline = {
            "pos_fraction": pos_frac,
            "used_smote": False,
            "note": "Not enough fraud labels to train a stable supervised model.",
        }
        dummy_model = XGBClassifier()
        return dummy_model, feature_df, y, baseline

    used_smote = False
    x_res = feature_df
    y_res = y
    try:
        from imblearn.over_sampling import SMOTE

        smote = SMOTE(sampling_strategy=minority_target_fraction, random_state=42)
        x_res, y_res = smote.fit_resample(feature_df, y)
        used_smote = True
    except Exception:
        x_res, y_res = feature_df, y

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

    return (
        clf,
        feature_df,
        y,
        {
            "pos_fraction": pos_frac,
            "used_smote": used_smote,
            "rows_original": int(len(df)),
            "rows_after_smote": int(len(x_res)),
        },
    )


def evaluate_model(
    model: IsolationForest, x: pd.DataFrame, y: pd.Series
) -> dict[str, float]:
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
    parser = argparse.ArgumentParser(
        description="Train InvoiceChain anomaly model from invoice dataset"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default="data/newest_invoices_data.csv",
        help="Path to invoice CSV relative to backend/",
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
        default=0.05,
        help="Expected anomaly rate for IsolationForest (auto-tuned upward if labels imply higher bad-rate).",
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
    labels = _derive_labels(df)
    bad_rate = float(labels.mean()) if len(labels) else 0.0
    tuned_contamination = min(
        0.35,
        max(
            args.contamination, bad_rate * 1.15 if bad_rate > 0 else args.contamination
        ),
    )

    model, x, y = train_model(df, contamination=tuned_contamination)
    metrics = evaluate_model(model, x, y)

    joblib.dump(model, model_path)

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
        "contamination_requested": args.contamination,
        "contamination": tuned_contamination,
        "estimated_bad_rate": bad_rate,
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
