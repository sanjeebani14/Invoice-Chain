import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split


def main() -> None:

    df = pd.read_csv("data/Loan_approval_data_2025.csv")

    x = df.drop(columns=["customer_id", "loan_status"])
    y = df["loan_status"]

    x = pd.get_dummies(x)

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.10,
        random_state=42,
    )

    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="logloss",
    )

    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    print(f"Test Set Accuracy: {accuracy_score(y_test, y_pred):.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    model.save_model("model.json")
    print("\nSuccess: 'model.json' has been generated.")


if __name__ == "__main__":
    main()
