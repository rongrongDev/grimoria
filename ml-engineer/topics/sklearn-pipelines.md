# scikit-learn Pipelines: Leakage-Safe Classical ML

**Version 1.0 — 2026-07-06. Applies to scikit-learn 1.4–1.7 (notes where APIs changed), pandas 2.x.** Core tier. Standalone. Related principles: [../principles/data-leakage.md](../principles/data-leakage.md) (the *why* behind every rule here), [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md), [../principles/evaluation.md](../principles/evaluation.md).

---

sklearn's `Pipeline` is not a convenience API — it is the *leakage-prevention mechanism* for classical ML. The entire design point: anything fitted inside a `Pipeline` under cross-validation is refit per fold on training rows only, making preprocessing leakage ([../principles/data-leakage.md](../principles/data-leakage.md) §3) structurally impossible instead of vigilance-dependent. The rule that follows: **in modeling code, no `.fit()` or `.fit_transform()` call exists outside a Pipeline.** Every pattern below is that rule applied.

## 1. The canonical skeleton

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.model_selection import cross_validate

preprocess = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")),
                      ("scale", StandardScaler())]), NUM_COLS),
    ("cat", Pipeline([("impute", SimpleImputer(strategy="most_frequent")),
                      ("ohe", OneHotEncoder(handle_unknown="infrequent_if_exist",
                                            min_frequency=20))]), CAT_COLS),
], remainder="drop", verbose_feature_names_out=True)

model = Pipeline([("prep", preprocess), ("clf", HistGradientBoostingClassifier())])
scores = cross_validate(model, X_train, y_train, cv=cv, scoring=SCORING)  # leakage-safe
```

Judgment embedded in those defaults:
- `remainder="drop"`, columns listed **explicitly**. `remainder="passthrough"` is the silent-schema-drift welcome mat: a new upstream column flows straight into the model, unscaled, unvetted ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §3).
- `handle_unknown="infrequent_if_exist"` + `min_frequency` (sklearn ≥1.1): unseen categories at serve time map to the infrequent bucket instead of erroring at 2am. You still *monitor* the unknown rate — handling it isn't the same as being fine with it.
- `HistGradientBoostingClassifier` as the tabular default: native NaN handling, native categoricals (`categorical_features="from_dtype"` in ≥1.4), fast, strong. Reach for linear models when you need coefficients/calibration-by-construction; reach for XGBoost/LightGBM when you need their specific features, not by reflex.
- The final estimator answers `predict_proba`; whether those probabilities are *calibrated* is a separate question — wrap in `CalibratedClassifierCV` (which CVs internally — again pipeline-shaped for the same leakage reason) if downstream consumes probabilities ([../principles/evaluation.md](../principles/evaluation.md) §1).

## 2. Where leakage still gets in despite Pipeline

The Pipeline protects `.fit` boundaries. It cannot protect against:

- **Feature engineering done in pandas before the Pipeline.** Groupby-aggregates joined onto rows, target-mean columns, "just normalize by the column max real quick" — all execute on the full frame before any split. Rule: pandas-side prep is *row-local only* (parsing, type casts, per-row arithmetic); anything that aggregates across rows either moves inside the Pipeline (custom transformer) or into the point-in-time feature layer ([../principles/data-leakage.md](../principles/data-leakage.md) §1).
- **Target encoding, hand-rolled.** `df.groupby(cat)['y'].mean()` merged back is test-label exposure, CRITICAL-severity. Use `sklearn.preprocessing.TargetEncoder` (≥1.3) *inside* the Pipeline — it does internal out-of-fold fitting in `fit_transform`, which is the entire point; hand-rolled versions never do.
- **Feature selection before the split.** `SelectKBest`/mutual-info/correlation-to-target on the full dataset is the classic. Selection is a fitted step; it goes in the Pipeline like everything fitted.
- **Resampling before the split.** SMOTE/upsampling before `train_test_split` puts synthetic near-copies of test rows in train. Use `imblearn.pipeline.Pipeline` (samplers run only on fold-train) — sklearn's own Pipeline deliberately doesn't support samplers; that incompatibility is a hint, not an obstacle to hack around.
- **CV that ignores data structure.** The Pipeline makes each fold internally clean; *which rows share a fold* is your job: `GroupKFold`/`StratifiedGroupKFold` for entities, `TimeSeriesSplit(gap=...)` for time ([../principles/evaluation.md](../principles/evaluation.md) §2 decision tree). Passing `groups=` and forgetting that `cross_validate` needs it too is a classic — assert your CV object saw groups.

## 3. Custom transformers that survive production

```python
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.utils.validation import check_is_fitted

class RatioFeatures(BaseEstimator, TransformerMixin):
    def __init__(self, eps: float = 1e-9):   # params stored verbatim, no logic
        self.eps = eps
    def fit(self, X, y=None):
        self.n_features_in_ = X.shape[1]      # fitted state gets trailing _
        return self
    def transform(self, X):
        check_is_fitted(self)
        ...
    def get_feature_names_out(self, input_features=None): ...
```

Non-negotiables, each mapped to the production failure it prevents: `__init__` stores params verbatim (else `clone()` breaks → GridSearchCV silently tunes a different object); learned state suffixed `_` and created only in `fit` (else state leaks across refits); implement `get_feature_names_out` (else feature-name tracing — the substrate of every skew audit — dies at your step); **no I/O, no `datetime.now()`, no global state in `transform`** (determinism — [../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §1 tests will catch you, but don't make them). Run sklearn's own `check_estimator` on custom transformers in CI; it's free conformance testing.

## 4. Persistence and the serving seam

- Persist the **whole fitted Pipeline** — one artifact containing preprocessing + model. Persisting the model alone and re-implementing preprocessing in the service is the #1 skew factory in classical ML ([../principles/train-serve-skew.md](../principles/train-serve-skew.md) §1, fix pattern "one shared implementation").
- **Pickle/joblib is a contract with your environment:** loading requires the same sklearn (minor version at minimum — sklearn explicitly disclaims cross-version pickle compatibility), same numpy, and importability of every custom class *at the same module path* (`__main__.RatioFeatures` from a notebook will not import in the service — custom transformers live in an installed package, never in the training script). Pin, containerize, and run the serialization round-trip test ([../principles/testing-ml-systems.md](../principles/testing-ml-systems.md) §3) in CI. Consider `skops` for safer serialization if artifacts cross trust boundaries; ONNX export where the serving side isn't Python.
- **Input contract at the seam:** the Pipeline remembers `feature_names_in_`; validate incoming serving payloads against it (names *and* order for array paths). This is the signature check of [../principles/mlops-and-versioning.md](../principles/mlops-and-versioning.md) §2, and with `set_output(transform="pandas")` you can keep names flowing end-to-end for auditability.

## 5. Debugging fitted pipelines (the 10-minute toolkit)

- `model[:-1].transform(X.head())` — see exactly what the estimator sees. Half of all "model is weird" reports are resolved by looking at this frame: wrong scale, exploded one-hot width, all-NaN column post-transform.
- `model[:-1].get_feature_names_out()` — the true feature list, for importance plots and skew audits. Never label importances with your raw column list; post-OHE indices don't map 1:1 and mislabeled importance plots have launched real (wrong) product decisions.
- `set_output(transform="pandas")` on the preprocess stage during development — dtypes and names at every step.
- Single-feature ablation and permutation importance (`sklearn.inspection.permutation_importance` on *validation*, not train) — the leakage detectors from [../principles/data-leakage.md](../principles/data-leakage.md) §1, both one-liners here.

## 6. Version-specific traps (verified against 1.4–1.7)

- Pickles do not load across sklearn minor versions reliably — treat every sklearn upgrade as a *retrain-and-re-register* event, scheduled, not discovered.
- `OneHotEncoder(sparse_output=...)` replaced `sparse=` (1.2); `TargetEncoder` exists only ≥1.3; native categorical `from_dtype` in HGBT ≥1.4 — audits of older codebases should expect hand-rolled (leaky) target encoders and `pd.get_dummies` (which, unlike OHE-in-pipeline, *cannot* handle unseen categories consistently between train and serve — a skew finding every time you see it in a serving path).
- `n_jobs=-1` inside nested CV inside a parallel search multiplies workers; oversubscription looks like a hang. Parallelize at the outermost loop only.
