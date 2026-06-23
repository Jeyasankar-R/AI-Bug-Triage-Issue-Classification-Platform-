import os
import pickle
import pandas as pd
import re
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score

# Directory paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dataset_dir = os.path.join(base_dir, "dataset")
test_path = os.path.join(dataset_dir, "test.csv")
model_dir = os.path.join(base_dir, "model")

# Text cleaning helper from our preprocessing step
url_pattern = re.compile(r'https?://\S+|www\.\S+')
html_pattern = re.compile(r'<[^>]+>')
emoji_pattern = re.compile(r'[\U00010000-\U0010ffff\u2600-\u27bf]')
dup_pattern = re.compile(r'\b(\w+)(?:\s+\1\b)+', re.IGNORECASE)

def clean_text(text):
    if not isinstance(text, str):
        return ""
    text = url_pattern.sub('', text)
    text = html_pattern.sub('', text)
    text = emoji_pattern.sub('', text)
    text = dup_pattern.sub(r'\1', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def load_and_standardize_dataset(file_path):
    print(f"\nProcessing dataset: {os.path.basename(file_path)}")
    df = pd.read_csv(file_path)
    print(f"Original shape: {df.shape}")
    
    # Column detection
    cat_col = None
    id_col = None
    title_col = None
    desc_col = None
    
    for col in df.columns:
        col_lower = col.lower().strip()
        if col_lower in ['category', 'category_name', 'class', 'label']:
            cat_col = col
        elif col_lower in ['id', 'bugid', 'bug id', 'bug_id', 'key']:
            id_col = col
        elif col_lower in ['title', 'short description', 'short_description', 'summary', 'subject', 'headline']:
            title_col = col
        elif col_lower in ['description', 'desc', 'details', 'long description', 'long_description']:
            desc_col = col

    # Fallbacks for key columns
    if title_col is None:
        for col in df.columns:
            col_l = col.lower()
            if 'title' in col_l or 'summary' in col_l or 'desc' in col_l or 'subject' in col_l:
                title_col = col
                break
        if title_col is None and len(df.columns) > 0:
            for col in df.columns:
                if df[col].dtype == object:
                    title_col = col
                    break
            if title_col is None:
                title_col = df.columns[0]

    if desc_col is None:
        for col in df.columns:
            col_l = col.lower()
            if 'desc' in col_l or 'detail' in col_l or 'body' in col_l:
                desc_col = col
                break
        if desc_col is None:
            desc_col = title_col

    if id_col is None:
        for col in df.columns:
            if 'id' in col.lower():
                id_col = col
                break

    print(f"Mapped columns: id='{id_col}', title='{title_col}', description='{desc_col}', category='{cat_col}'")

    standardized_rows = []
    
    if cat_col is not None:
        print(f"-> Labeled dataset detected.")
        for idx, row in df.iterrows():
            bug_id = row[id_col] if id_col is not None else (idx + 1)
            try:
                bug_id = int(float(bug_id))
            except (ValueError, TypeError):
                bug_id = idx + 1
            
            title = clean_text(row[title_col]) if title_col in df.columns else ""
            description = clean_text(row[desc_col]) if desc_col in df.columns else ""
            category = clean_text(row[cat_col]) if cat_col in df.columns else ""
            
            if category:
                standardized_rows.append({
                    'id': bug_id,
                    'title': title,
                    'description': description,
                    'category': category
                })
    else:
        print(f"-> Unlabeled dataset detected. Applying heuristic auto-labeler...")
        auto_rules = {
            "UI Bug": ["alignment", "overlap", "truncation", "misaligned", "layout", "visual", "font", "color", "render", "button", "css"],
            "Performance Issue": ["slow", "latency", "timeout", "takes over", "memory spike", "high cpu", "delay"],
            "Crash/Error": ["crashes", "oom", "null pointer", "exception", "unhandled", "pointer exception"],
            "Security Vulnerability": ["security", "injection", "vulnerability", "escalation", "xss", "token exposed", "privilege"],
            "Feature Request": ["feature", "request", "bulk edit", "scheduling", "dark mode"],
            "Integration Failure": ["webhook", "gateway", "integration", "connection error", "auth issue"],
            "Configuration Error": ["config", "api key", "environment variable", "settings", "variable"],
            "Data Inconsistency": ["discrepancy", "totals displayed", "sync", "duplicate records", "inconsistency", "negative"]
        }
        counts = {cat: 0 for cat in auto_rules.keys()}
        max_samples_per_class = 10000
        
        for idx, row in df.iterrows():
            text_to_check = str(row[title_col]) if title_col in df.columns else ""
            if desc_col in df.columns and desc_col != title_col:
                text_to_check += " " + str(row[desc_col])
            
            text_lower = text_to_check.lower()
            matched_categories = []
            for cat, keywords in auto_rules.items():
                for kw in keywords:
                    if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
                        matched_categories.append(cat)
                        break
                        
            if len(matched_categories) == 1:
                cat = matched_categories[0]
                if counts[cat] < max_samples_per_class:
                    counts[cat] += 1
                    bug_id = row[id_col] if id_col is not None else (idx + 1)
                    try:
                        bug_id = int(float(bug_id))
                    except (ValueError, TypeError):
                        bug_id = idx + 1
                    
                    standardized_rows.append({
                        'id': bug_id,
                        'title': clean_text(row[title_col]),
                        'description': clean_text(row[desc_col]) if desc_col in df.columns else clean_text(row[title_col]),
                        'category': cat
                    })
        print(f"-> Auto-labeled counts: {counts}")
        print(f"-> Total auto-labeled rows: {len(standardized_rows)}")
        
    return pd.DataFrame(standardized_rows)

# 1. Discover all CSV files in the dataset folder
print("Scanning dataset directory for CSV files...")
if not os.path.exists(dataset_dir):
    raise FileNotFoundError(f"Dataset directory not found: {dataset_dir}")

all_files = [os.path.join(dataset_dir, f) for f in os.listdir(dataset_dir) if f.endswith(".csv")]
exclude_files = ["test.csv", "combined_train.csv"]
train_files = [f for f in all_files if os.path.basename(f) not in exclude_files]

print(f"Found datasets for training: {[os.path.basename(f) for f in train_files]}")
print(f"Using for evaluation: {os.path.basename(test_path)}")

# 2. Load and standardize each dataset
standardized_dfs = []
for f in train_files:
    standardized_dfs.append(load_and_standardize_dataset(f))

# Combine all standardized datasets
if not standardized_dfs:
    raise ValueError("No training datasets found to process!")

combined_df = pd.concat(standardized_dfs, ignore_index=True)
print(f"\nCombined dataset size: {len(combined_df)} rows")

# 3. Perform a stratified train-test split (5000 test samples)
print("Performing stratified train/test split (5000 test samples)...")
train_df, test_df = train_test_split(
    combined_df,
    test_size=5000,
    random_state=42,
    stratify=combined_df['category']
)

print(f"Train set size: {len(train_df)} rows")
print(f"Test set size: {len(test_df)} rows")

# Preprocess text data
train_df['text'] = train_df['title'].fillna('').apply(clean_text) + " " + train_df['description'].fillna('').apply(clean_text)
test_df['text'] = test_df['title'].fillna('').apply(clean_text) + " " + test_df['description'].fillna('').apply(clean_text)

X_train, y_train = train_df['text'], train_df['category']
X_test, y_test = test_df['text'], test_df['category']

# 4. Fit TF-IDF Vectorizer
print("\nFitting TF-IDF Vectorizer...")
vectorizer = TfidfVectorizer(stop_words='english', min_df=1, ngram_range=(1, 2), sublinear_tf=True)
X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)
print(f"Feature matrix shape: {X_train_vec.shape}")

# 5. Fit Logistic Regression Classifier
print("Training Logistic Regression classifier...")
classifier = LogisticRegression(C=10.0, class_weight='balanced', max_iter=200, solver='liblinear')
classifier.fit(X_train_vec, y_train)

# 6. Evaluate Performance
print("\nEvaluating on test.csv...")
y_pred = classifier.predict(X_test_vec)
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy:.4f}")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, zero_division=0))

# 7. Save new model artifacts and split datasets
print(f"\nSaving model artifacts to {model_dir}...")
os.makedirs(model_dir, exist_ok=True)
with open(os.path.join(model_dir, "classifier.pkl"), "wb") as f:
    pickle.dump(classifier, f)
with open(os.path.join(model_dir, "vectorizer.pkl"), "wb") as f:
    pickle.dump(vectorizer, f)

# Save stratified splits to files
test_df_to_save = test_df.drop(columns=['text'], errors='ignore')
test_df_to_save.to_csv(test_path, index=False)
print(f"Saved stratified test dataset to {test_path}")

combined_train_csv = os.path.join(dataset_dir, "combined_train.csv")
train_df_to_save = train_df.drop(columns=['text'], errors='ignore')
train_df_to_save.to_csv(combined_train_csv, index=False)
print(f"Saved combined training dataset to {combined_train_csv}")

print("AI model successfully updated and ready!")

