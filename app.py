from flask import Flask, jsonify, request
import os
import json
from datetime import datetime
import numpy as np
from email.message import EmailMessage
import smtplib
from dotenv import load_dotenv
import requests  # Für SendGrid REST API


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
        dataset_dir = os.path.join(DATA_DIR, dataset)
        proj_path = os.path.join(dataset_dir, f"{projection}.npy")
        label_path = os.path.join(dataset_dir, "labels.npy")

        print(f" Loading: {proj_path}")
        print(f" Labels: {label_path}")

        # Projektion laden
        X = np.load(proj_path).tolist()

        # Labels robust laden
        labels_data = np.load(label_path, allow_pickle=True).item()
        y = labels_data.get("labels", None)
        if y is None:
            raise ValueError(f"labels.npy for dataset '{dataset}' does not contain 'labels' key")

        # ----------------------
        # E2/E3/E4 optional laden
        # ----------------------
        worst_idx = None
        e2_path = os.path.join(dataset_dir, "E2_targets.npy")
        if os.path.exists(e2_path):
            try:
                e2_data = np.load(e2_path, allow_pickle=True).item()
                worst_idx = e2_data.get("worst_point_index")
                if not isinstance(worst_idx, (int, np.integer)):
                    worst_idx = None
            except Exception as e:
                print(f"[WARN] Failed to read E2_targets for {dataset}: {e}")

        e3_data = None
        e3_path = os.path.join(dataset_dir, "E3_targets.npy")
        if os.path.exists(e3_path):
            try:
                e3_data = np.load(e3_path, allow_pickle=True).item()
            except Exception as e:
                print(f"[WARN] Failed to read E3_targets for {dataset}: {e}")

        densest_cluster = None
        e4_path = os.path.join(dataset_dir, "E4_targets.npy")
        if os.path.exists(e4_path):
            try:
                e4_data = np.load(e4_path, allow_pickle=True).item()
                densest_cluster = e4_data.get("densest_cluster")
            except Exception as e:
                print(f"[WARN] Failed to read E4_targets for {dataset}: {e}")
        print(worst_idx,e3_data,densest_cluster)
        # ----------------------
        # JSON Response
        # ----------------------
        return jsonify({
            "X": X,
            "y": y.tolist() if hasattr(y, "tolist") else y,
            "worst_point_index": int(worst_idx) if worst_idx is not None else None,  # von E2
            "nearest_pair": e3_data,              # Dict oder None (von E3)
            "densest_cluster": densest_cluster    # int oder None (von E4)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/submit", methods=["POST"])
def submit():
    #os.makedirs(RESULT_DIR, exist_ok=True)
    data = request.json
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"result_{timestamp}.json"

        # Direkt JSON erzeugen
    json_data = json.dumps(data, indent=2)

    # Lokal speichern
    #local_path = os.path.join(RESULT_DIR, filename)
    #with open(local_path, "w") as f:
    #    json.dump(data, f, indent=2)
    #print(f"✅ Gespeichert: {local_path}")

    # Per E-Mail senden

    try:
        send_email_backup(json_data, filename)
    except Exception as e:
        print(f"⚠️ Fehler beim E-Mail-Versand: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "ok"})


# # === MAIL mit SendGrid ===

# def send_email_backup(json_content, filename):
#     SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
#     EMAIL_SENDER = os.environ.get("EMAIL_SENDER")
#     EMAIL_RECEIVER = os.environ.get("EMAIL_RECEIVER")

#     if not SENDGRID_API_KEY:
#         raise ValueError("SENDGRID_API_KEY not set in environment")

#     # SendGrid API Endpoint
#     url = "https://api.sendgrid.com/v3/mail/send"

#     headers = {
#         "Authorization": f"Bearer {SENDGRID_API_KEY}",
#         "Content-Type": "application/json"
#     }

#     # Base64-Encoding für Anhang
#     import base64
#     encoded_file = base64.b64encode(json_content.encode()).decode()

#     payload = {
#         "personalizations": [
#             {
#                 "to": [{"email": EMAIL_RECEIVER}],
#                 "subject": "📊 Visual Study Result JSON"
#             }
#         ],
#         "from": {"email": EMAIL_SENDER},
#         "content": [
#             {"type": "text/plain", "value": "Backup der Studie im JSON-Anhang."}
#         ],
#         "attachments": [
#             {
#                 "content": encoded_file,
#                 "type": "application/json",
#                 "filename": filename,
#                 "disposition": "attachment"
#             }
#         ]
#     }

#     response = requests.post(url, headers=headers, json=payload)
#     print("SendGrid response:", response.status_code, response.text)  # Debug
#     if response.status_code >= 400:
#         raise RuntimeError(f"SendGrid API error: {response.status_code} {response.text}")
#     else:
#         print("📬 Ergebnis erfolgreich über SendGrid verschickt.")


# === MAIL mit local ===

def send_email_backup(json_string, filename):
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

    # JSON-Daten direkt anhängen
    msg.add_attachment(json_string.encode("utf-8"),
                       maintype="application",
                       subtype="json",
                       filename=filename)

    # with open(json_path, "rb") as f:
    #    file_data = f.read()
    #    msg.add_attachment(file_data, maintype="application", subtype="json", filename=os.path.basename(json_path))

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as smtp:
        smtp.starttls()
        smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
        smtp.send_message(msg)
        print("📬 Ergebnis per E-Mail gesendet.")

# === START ===

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)