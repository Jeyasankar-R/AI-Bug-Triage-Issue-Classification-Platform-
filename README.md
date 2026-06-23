# AI Bug Classifier - FastAPI Service & ML Pipeline

This repository contains the AI/ML Classification service for the **AI Bug Triage & Issue Classification Platform**. It categorizes incoming bug reports, predicts severity, provides root cause hints, and detects duplicates.

## 📂 Folder Structure

```text
bug-classifier-ai/
├── dataset/
│   ├── train.csv          # Training data with sample bug categories
│   └── test.csv           # Evaluation data
├── model/
│   ├── classifier.pkl     # Serialized classifier model
│   └── vectorizer.pkl     # Serialized TF-IDF vectorizer model
├── api/
│   ├── app.py             # FastAPI App microservice entrypoint
│   └── predict.py         # Predictor module with heuristic/ML inference pipeline
├── notebooks/
│   └── training.ipynb     # Jupyter notebook for training and model evaluation
├── docs/
│   └── project_report.pdf # PDF containing project plan & metrics report
├── requirements.txt       # Python package requirements
└── README.md              # Project documentation
```

## 🚀 Getting Started

### 1. Installation

Create a virtual environment and install dependencies:

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 2. Run the FastAPI Microservice

To launch the FastAPI server, run:

```bash
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload
```

The server will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000). You can explore the interactive OpenAPI/Swagger documentation at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 3. Training/Updating the ML Model

1. Open `notebooks/training.ipynb` in your Jupyter environment.
2. Run all cells to load the datasets from `dataset/`, train the TF-IDF Vectorizer and Logistic Regression classifier, and save the model artifacts.
3. Once running, the API will automatically transition from the default rule-based baseline to using the newly trained ML models.

## 🔌 API Endpoints

### `POST /analyze`
Accepts a bug description payload and returns the classification category, confidence, predicted severity, and root-cause hints.

**Request Payload:**
```json
{
  "title": "SQL injection vulnerability in user search",
  "description": "The search query concatenates inputs directly without sanitization.",
  "steps_to_reproduce": "1. Navigate to search\n2. Enter ' OR '1'='1' --",
  "environment": "Windows 10, Chrome 120"
}
```

**Response Payload:**
```json
{
  "category": "Security Vulnerability",
  "confidence_score": 0.90,
  "severity_prediction": "Critical",
  "root_cause_hints": [
    "Use parameterized queries/prepared statements to prevent SQL injections.",
    "Sanitize and validate all user inputs against regex whitelists.",
    "Verify CORS origins and check session token expiration parameters."
  ]
}
```

### `POST /feedback`
Collects developer corrections on prediction misclassifications to feed into future model iterations.

**Request Payload:**
```json
{
  "bug_id": 105,
  "correct_category": "Performance Issue",
  "correct_severity": "High"
}
```
