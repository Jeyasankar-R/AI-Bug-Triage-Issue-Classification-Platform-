import os
import json
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

# Import predictor
try:
    from predict import BugPredictor
except ImportError:
    from .predict import BugPredictor

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("bug-classifier-api")

app = FastAPI(
    title="AI Bug Triage & Classification Service",
    description="Microservice to automatically classify software bugs, predict severity, and suggest root cause hints.",
    version="1.0.0"
)

# CORS middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate predictor
predictor = BugPredictor()

class BugAnalysisRequest(BaseModel):
    title: str = Field(..., example="Button click does not open modal")
    description: str = Field(..., example="When clicking on the 'Submit' button on the dashboard, nothing happens.")
    steps_to_reproduce: Optional[str] = Field(None, example="1. Navigate to dashboard\n2. Click 'Submit' button")
    environment: Optional[str] = Field(None, example="Windows 11, Chrome 120")

class DuplicateCandidate(BaseModel):
    bug_id: str
    title: str
    similarity_score: float

class BugAnalysisResponse(BaseModel):
    category: str
    confidence_score: float
    severity_prediction: str
    root_cause_hints: List[str]
    potential_duplicates: List[DuplicateCandidate] = []

class FeedbackRequest(BaseModel):
    bug_id: int = Field(..., example=123)
    correct_category: Optional[str] = Field(None, example="UI Bug")
    correct_severity: Optional[str] = Field(None, example="High")

@app.get("/", response_class=HTMLResponse)
def read_root():
    template_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates", "index.html")
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>AI Bug Triage Platform</h1><p>UI Template not found.</p>")

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "AI Bug Triage & Classification Platform",
        "model_status": {
            "is_heuristic": predictor.is_heuristic,
            "classifier_found": os.path.exists(predictor.classifier_path),
            "vectorizer_found": os.path.exists(predictor.vectorizer_path)
        }
    }

@app.post("/analyze", response_model=BugAnalysisResponse)
async def analyze_bug(request: BugAnalysisRequest):
    try:
        logger.info(f"Analyzing bug report: {request.title[:50]}...")
        
        category, confidence = predictor.predict_category(request.title, request.description)
        severity = predictor.predict_severity(request.title, request.description)
        hints = predictor.generate_root_cause_hints(request.title, request.description, category)
        
        # Detect potential duplicates
        duplicates = predictor.detect_duplicates(request.title, request.description)
        
        return BugAnalysisResponse(
            category=category,
            confidence_score=confidence,
            severity_prediction=severity,
            root_cause_hints=hints,
            potential_duplicates=duplicates
        )
    except Exception as e:
        logger.error(f"Error during bug analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis engine error: {str(e)}")

@app.post("/feedback")
async def log_feedback(request: FeedbackRequest):
    try:
        logger.info(f"Received correction feedback for bug {request.bug_id}: category={request.correct_category}, severity={request.correct_severity}")
        # Log to file or console (MVP). In production, this would go to a database or feedback queue.
        feedback_log = os.path.join(os.path.dirname(predictor.classifier_path), "feedback_log.jsonl")
        
        with open(feedback_log, "a", encoding="utf-8") as f:
            feedback_data = {
                "bug_id": request.bug_id,
                "correct_category": request.correct_category,
                "correct_severity": request.correct_severity
            }
            f.write(json.dumps(feedback_data) + "\n")
            
        return {"status": "success", "message": "Feedback recorded successfully."}
    except Exception as e:
        # Fallback to simple console log if file write fails (e.g. permission or import issues)
        import json
        logger.info(f"Logged feedback to console: {request.model_dump()}")
        return {"status": "success", "message": "Feedback logged to console."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
