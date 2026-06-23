# Handover Documentation: AI Bug Classifier Model & Service

This document provides a comprehensive overview of the AI Bug Classifier system, including installation instructions, API endpoint documentation, and package requirements, prepared for handover.

---

## 📋 1. Project README

This is the main documentation for setting up, training, and running the project.

### Project Folder Structure
```text
bug-classifier-ai/
├── dataset/
│   ├── train.csv                # Custom training data
│   ├── test.csv                 # Evaluation test dataset (5,000 stratified samples)
│   └── combined_train.csv       # Merged dataset used to train the model (2,850 stratified samples)
├── model/
│   ├── classifier.pkl           # Trained Logistic Regression classifier
│   └── vectorizer.pkl           # Trained TF-IDF Vectorizer
├── api/
│   ├── app.py                   # FastAPI application entrypoint
│   ├── predict.py               # ML & Heuristic predictor engine
│   └── templates/
│       └── index.html           # Simple UI dashboard for interactive manual testing
├── notebooks/
│   ├── merge_and_train.py       # Python pipeline for data standardization, train/test split, and model training
│   └── training.ipynb           # Notebook playground
├── requirements.txt             # Project library dependencies
└── README.md                    # Project overview README
```

### Getting Started

#### Step 1: Install Dependencies
Ensure you have Python 3.8+ installed. Set up a virtual environment and install dependencies:
```bash
# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# On Windows:
.\venv\Scripts\activate
# On Unix or MacOS:
source venv/bin/activate

# Install the required packages
pip install -r requirements.txt
```

#### Step 2: Training the Model
To re-run the training pipeline (which standardizes datasets, performs the stratified train/test split, and saves the serialized models):
```bash
python notebooks/merge_and_train.py
```

#### Step 3: Run the API Microservice
Start the FastAPI server using Uvicorn:
```bash
uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload
```
Once started, open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser to test predictions via the web UI dashboard.

---

## 🔌 2. API Documentation

The FastAPI service exposes three main endpoints for prediction, health monitoring, and feedback collection.

### Interactive OpenAPI Documentation
When the server is running, the interactive documentation is automatically generated and accessible at:
* **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

### Endpoint: `POST /analyze`
Analyzes a bug report to predict category, severity, root-cause hints, and check for duplicates.

#### Request URL
`http://127.0.0.1:8000/analyze`

#### Request Headers
```http
Content-Type: application/json
```

#### Request Payload
```json
{
  "title": "SQL injection vulnerability in login form",
  "description": "User input is directly executed in SQL query without validation or sanitization.",
  "steps_to_reproduce": "1. Go to login page\n2. Enter \"admin' OR '1'='1\" in username.",
  "environment": "Production, Chrome 124"
}
```

#### Response Payload (JSON)
```json
{
  "category": "Security Vulnerability",
  "confidence_score": 0.85,
  "severity_prediction": "Critical",
  "root_cause_hints": [
    "Use parameterized queries/prepared statements to prevent SQL injections.",
    "Sanitize and validate all user inputs against regex whitelists.",
    "Verify CORS origins and check session token expiration parameters."
  ],
  "potential_duplicates": [
    {
      "bug_id": 132,
      "title": "Missing input validation",
      "similarity_score": 0.8241
    }
  ]
}
```

#### Curl Example
```bash
curl -X POST "http://127.0.0.1:8000/analyze" \
     -H "Content-Type: application/json" \
     -d "{\"title\": \"SQL injection vulnerability in login form\", \"description\": \"User input is directly executed in SQL query\"}"
```

---

### Endpoint: `POST /feedback`
Submits feedback or correct labels when the classifier makes a mistake. This gets written to `model/feedback_log.jsonl` to assist future re-training iterations.

#### Request URL
`http://127.0.0.1:8000/feedback`

#### Request Payload
```json
{
  "bug_id": 123,
  "correct_category": "Security Vulnerability",
  "correct_severity": "Critical"
}
```

#### Response Payload
```json
{
  "status": "success",
  "message": "Feedback recorded successfully."
}
```

---

### Endpoint: `GET /health`
Validates that the service is running and checking if the machine learning model files are loaded.

#### Request URL
`http://127.0.0.1:8000/health`

#### Response Payload
```json
{
  "status": "online",
  "service": "AI Bug Triage & Classification Platform",
  "model_status": {
    "is_heuristic": false,
    "classifier_found": true,
    "vectorizer_found": true
  }
}
```

---

## 📦 3. requirements.txt

Here are the requirements to be copy-pasted directly into a `requirements.txt` file in the root of the project folder:

```text
fastapi>=0.100.0
uvicorn>=0.22.0
scikit-learn>=1.2.0
pandas>=2.0.0
numpy>=1.24.0
joblib>=1.3.0
pydantic>=2.0
python-multipart>=0.0.6
reportlab>=4.0.0
```
