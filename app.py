from flask import Flask, jsonify, request
import os
import json
from datetime import datetime
import numpy as np
from email.message import EmailMessage
import smtplib
from dotenv import load_dotenv

# === KONFIGURATION ===
app = Flask(__name__, static_url_path="", static_folder="static")
DATA_DIR = "data"
RESULT_DIR = "results"
load_dotenv()  # .env einlesen

# === ROUTES ===

@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/projections")
def list_projections():
    index = {}
    for dataset in sorted(os.listdir(DATA_DIR)):
        dataset_path = os.path.join(DATA_DIR, dataset)
        if not os.path.isdir(dataset_path):
            continue
        projections = []
        for fname in os.listdir(dataset_path):
            full_path = os.path.join(dataset_path, fname)
            if fname.endswith(".npy") and fname != "labels.npy" and os.path.isfile(full_path):
                proj_name = fname.replace(".npy", "")
                projections.append(proj_name)
        if projections:
            index[dataset] = sorted(projections)
    return jsonify(index)

@app.route("/data/<dataset>/<projection>")
def load_data(dataset, projection):
    try:
        proj_path = os.path.join(DATA_DIR, dataset, f"{projection}.npy")
        label_path = os.path.join(DATA_DIR, dataset, "labels.npy")

        print(f" Loading: {proj_path}")
        print(f" Labels: {label_path}")

        X = np.load(proj_path).tolist()
        # Load labels.npy as dict so we can access worst_point_index
        labels_data = np.load(label_path, allow_pickle=True).item()
        y = labels_data["labels"]

        worst_idx = labels_data.get("worst_point_index", None)
        if worst_idx is None or not isinstance(worst_idx, (int, np.integer)):
            print(f"[WARNING] No valid worst_point_index found for dataset '{dataset}', projection '{projection}'")
            worst_idx = None
        elif worst_idx < 0 or worst_idx >= len(X):
            print(f"[ERROR] worst_point_index {worst_idx} is out of range (0-{len(X)-1})")
            worst_idx = None

        return jsonify({
            "X": X,
            "y": y.tolist() if hasattr(y, "tolist") else y,
            "worst_point_index": int(worst_idx) if worst_idx is not None else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/submit", methods=["POST"])
def submit():
    os.makedirs(RESULT_DIR, exist_ok=True)
    data = request.json
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"result_{timestamp}.json"
    local_path = os.path.join(RESULT_DIR, filename)

    # Lokal speichern
    with open(local_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"✅ Gespeichert: {local_path}")

    # Per E-Mail senden
    try:
        send_email_backup(local_path)
    except Exception as e:
        print(f"⚠️ Fehler beim E-Mail-Versand: {e}")

    return jsonify({"status": "ok"})

# === MAIL ===

def send_email_backup(json_path):
    EMAIL_SENDER = os.environ.get("EMAIL_SENDER")
    EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD")
    EMAIL_RECEIVER = os.environ.get("EMAIL_RECEIVER")
    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587

    msg = EmailMessage()
    msg["Subject"] = "📊 Visual Study Result JSON"
    msg["From"] = EMAIL_SENDER
    msg["To"] = EMAIL_RECEIVER
    msg.set_content("Backup der Studie im JSON-Anhang.")

    with open(json_path, "rb") as f:
        file_data = f.read()
        msg.add_attachment(file_data, maintype="application", subtype="json", filename=os.path.basename(json_path))

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as smtp:
        smtp.starttls()
        smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
        smtp.send_message(msg)
        print("📬 Ergebnis per E-Mail gesendet.")

# === START ===

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)