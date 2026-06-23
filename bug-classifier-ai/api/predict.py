import os
import pickle
import re

class BugPredictor:
    def __init__(self, model_dir=None):
        if model_dir is None:
            # Default to checking sibling 'model' directory relative to 'api'
            # (which resides in bug-classifier-ai/model)
            model_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model")
        
        self.classifier_path = os.path.join(model_dir, "classifier.pkl")
        self.vectorizer_path = os.path.join(model_dir, "vectorizer.pkl")
        
        self.classifier = None
        self.vectorizer = None
        self.is_heuristic = True
        
        self.load_models()
        self.load_historical_bugs()

    def load_models(self):
        if not os.path.exists(self.classifier_path) or not os.path.exists(self.vectorizer_path):
            print(f"Warning: Models not found at {self.classifier_path} or {self.vectorizer_path}. Using hardcoded fallbacks.")
            self.classifier = None
            self.vectorizer = None
            return

        try:
            with open(self.classifier_path, "rb") as f:
                self.classifier = pickle.load(f)
            with open(self.vectorizer_path, "rb") as f:
                self.vectorizer = pickle.load(f)
            
            # Check if this is the dummy heuristic structure or scikit-learn
            if isinstance(self.classifier, dict) and self.classifier.get("model_type") == "HeuristicClassifier":
                self.is_heuristic = True
                print("Loaded heuristic classifier model.")
            else:
                self.is_heuristic = False
                print("Loaded ML model (scikit-learn or custom).")
        except Exception as e:
            print(f"Error loading models: {e}. Falling back to default heuristics.")
            self.classifier = None
            self.vectorizer = None
            self.is_heuristic = True

    def predict_category(self, title, description):
        text = f"{title} {description}".lower()
        
        # If we have a real ML model loaded
        if not self.is_heuristic and self.classifier is not None and self.vectorizer is not None:
            try:
                # Preprocess and predict using loaded vectorizer and classifier
                features = self.vectorizer.transform([text])
                prediction = self.classifier.predict(features)[0]
                return prediction, 0.85 # Mock confidence for now
            except Exception as e:
                print(f"ML Prediction failed: {e}. Falling back to heuristics.")
        
        # Heuristic rules fallback
        rules = {
            "ui": "UI Bug",
            "button": "UI Bug",
            "color": "UI Bug",
            "alignment": "UI Bug",
            "modal": "UI Bug",
            "performance": "Performance Issue",
            "slow": "Performance Issue",
            "timeout": "Performance Issue",
            "memory": "Performance Issue",
            "crash": "Crash/Error",
            "oom": "Crash/Error",
            "null": "Crash/Error",
            "exception": "Crash/Error",
            "security": "Security Vulnerability",
            "sql": "Security Vulnerability",
            "injection": "Security Vulnerability",
            "auth": "Security Vulnerability",
            "vulnerability": "Security Vulnerability",
            "add": "Feature Request",
            "feature": "Feature Request",
            "export": "Feature Request",
            "api": "Integration Failure",
            "endpoint": "Integration Failure",
            "connection": "Integration Failure",
            "config": "Configuration Error",
            "parse": "Configuration Error",
            "key": "Configuration Error",
            "balance": "Data Inconsistency",
            "negative": "Data Inconsistency",
            "database": "Data Inconsistency"
        }
        
        # Override with pickled rules if available
        if self.is_heuristic and self.classifier and "rules" in self.classifier:
            rules = self.classifier["rules"]
            
        for word, cat in rules.items():
            if re.search(r'\b' + re.escape(word) + r'\b', text):
                return cat, 0.90
                
        return "UI Bug", 0.50 # Default fallback

    def predict_severity(self, title, description):
        text = f"{title} {description}".lower()
        
        # Simple rule-based severity prediction as outlined in planner
        critical_keywords = ['crash', 'data loss', 'security', 'vulnerability', 'injection', 'wallet', 'negative']
        high_keywords = ['slow', 'delay', 'timeout', 'broken', 'error', 'fails', 'failed']
        medium_keywords = ['warning', 'alignment', 'config', 'incorrect']
        
        for kw in critical_keywords:
            if kw in text:
                return "Critical"
        for kw in high_keywords:
            if kw in text:
                return "High"
        for kw in medium_keywords:
            if kw in text:
                return "Medium"
        return "Low"

    def generate_root_cause_hints(self, title, description, category):
        # Actionable hints based on categories
        hints_map = {
            "UI Bug": [
                "Verify CSS layout rules and responsiveness on small breakpoints.",
                "Check for Javascript console errors during element rendering.",
                "Ensure that event handlers are correctly bound to the button/input elements."
            ],
            "Performance Issue": [
                "Profile database query execution plans for missing indices.",
                "Verify resource leaks or high memory usage in long-running functions.",
                "Check network payload sizes and connection pool configuration limits."
            ],
            "Crash/Error": [
                "Add proper Null Pointer guards and validate all input formats.",
                "Verify that error try-catch blocks are capturing exceptions gracefully.",
                "Check if system dependencies or external libraries are up to date."
            ],
            "Security Vulnerability": [
                "Use parameterized queries/prepared statements to prevent SQL injections.",
                "Sanitize and validate all user inputs against regex whitelists.",
                "Verify CORS origins and check session token expiration parameters."
            ],
            "Feature Request": [
                "Verify scope requirements and layout a UI mock-up.",
                "Design modular service helper methods to implement export/add feature.",
                "Confirm database schema modifications needed to support persistent state."
            ],
            "Data Inconsistency": [
                "Wrap database writes in transaction blocks (Atomicity).",
                "Verify concurrent write locking mechanisms (Pessimistic/Optimistic locks).",
                "Analyze event sourcing or queue consumer message delivery guarantees."
            ],
            "Integration Failure": [
                "Check route path parameters and verify backend mapping definitions.",
                "Ensure auth bearer headers are correctly attached to outbound calls.",
                "Verify third-party endpoint health and API key validity."
            ],
            "Configuration Error": [
                "Check syntax formats (JSON, YAML, INI) and quote escapes in settings files.",
                "Ensure environment variable profiles are correctly loaded at bootstrap.",
                "Confirm file permissions and absolute path definitions for asset loading."
            ]
        }
        return hints_map.get(category, [
            "Verify environment settings and setup details.",
            "Review error logging stack traces for details.",
            "Ensure input validation rules are properly enforced."
        ])

    def load_historical_bugs(self):
        dataset_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset")
        self.combined_train_path = os.path.join(dataset_dir, "combined_train.csv")
        self.combined_df = None
        self.historical_vectors = None
        if os.path.exists(self.combined_train_path):
            try:
                import pandas as pd
                self.combined_df = pd.read_csv(self.combined_train_path)
                if not self.is_heuristic and self.vectorizer is not None:
                    texts = (self.combined_df['title'].fillna('') + " " + self.combined_df['description'].fillna('')).tolist()
                    self.historical_vectors = self.vectorizer.transform(texts)
                    print(f"Loaded {len(self.combined_df)} historical bugs for duplicate detection.")
            except Exception as e:
                print(f"Error loading combined training dataset: {e}")

    def detect_duplicates(self, title, description, threshold=0.7, top_k=3):
        # 1. Try to detect duplicates against live database bugs first
        try:
            import requests
            # Look for environment variables, otherwise use verified default config
            supabase_url = os.environ.get("SUPABASE_URL", "https://qernbleostndfqaapagu.supabase.co")
            supabase_key = os.environ.get("SUPABASE_SECRET_KEY", "sb_secret_IUFQ6fi2--aqjMd23ZqiOA_SSXvWsBI")
            
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}"
            }
            # Fetch live bugs (only id, title, description)
            res = requests.get(f"{supabase_url}/rest/v1/bugs?select=id,title,description", headers=headers, timeout=5)
            if res.status_code == 200:
                live_bugs = res.json()
                if live_bugs and self.vectorizer is not None:
                    texts = [f"{b.get('title', '')} {b.get('description', '')}" for b in live_bugs]
                    live_vectors = self.vectorizer.transform(texts)
                    
                    input_text = f"{title} {description}"
                    input_vector = self.vectorizer.transform([input_text])
                    
                    from sklearn.metrics.pairwise import cosine_similarity
                    similarities = cosine_similarity(input_vector, live_vectors)[0]
                    
                    live_results = []
                    for idx, score in enumerate(similarities):
                        if score >= threshold:
                            b = live_bugs[idx]
                            live_results.append({
                                "bug_id": str(b['id']), # UUID string
                                "title": str(b['title']),
                                "similarity_score": float(score)
                            })
                    
                    if live_results:
                        return sorted(live_results, key=lambda x: x['similarity_score'], reverse=True)[:top_k]
        except Exception as e:
            print(f"Live duplicate detection failed or skipped: {e}")

        # 2. Fallback to historical combined_train.csv dataset
        if self.combined_df is None or self.historical_vectors is None:
            return []
        
        try:
            from sklearn.metrics.pairwise import cosine_similarity
            
            # Combine and vectorize input text
            text = f"{title} {description}"
            input_vector = self.vectorizer.transform([text])
            
            # Compute cosine similarities
            similarities = cosine_similarity(input_vector, self.historical_vectors)[0]
            
            # Find indices where similarity exceeds threshold
            results = []
            for idx, score in enumerate(similarities):
                if score >= threshold:
                    row = self.combined_df.iloc[idx]
                    results.append({
                        "bug_id": str(row['id']), # return as string
                        "title": str(row['title']),
                        "similarity_score": float(score)
                    })
                    
            # Sort by score descending and take top_k
            return sorted(results, key=lambda x: x['similarity_score'], reverse=True)[:top_k]
        except Exception as e:
            print(f"Error in duplicate detection: {e}")
            return []

if __name__ == "__main__":
    predictor = BugPredictor()
    t = "SQL injection vulnerability in login form"
    d = "User input is directly executed in SQL query"
    cat, conf = predictor.predict_category(t, d)
    sev = predictor.predict_severity(t, d)
    hints = predictor.generate_root_cause_hints(t, d, cat)
    print(f"Text: {t}")
    print(f"Category: {cat} (Confidence: {conf})")
    print(f"Severity: {sev}")
    print(f"Hints: {hints}")
