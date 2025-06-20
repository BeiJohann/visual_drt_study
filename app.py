from flask import Flask, jsonify, request
import os
import json
from datetime import datetime
import numpy as np

app = Flask(__name__, static_url_path="", static_folder="static")

DATA_DIR = "data"

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
            if fname.endswith(".npy") and not fname.endswith("labels.npy"):
                if fname.endswith(f"_{dataset}.npy"):
                    proj_name = fname.replace(f"_{dataset}.npy", "")
                    projections.append(proj_name)
        index[dataset] = sorted(projections)
    return jsonify(index)

@app.route("/data/<dataset>/<projection>")
def load_data(dataset, projection):
    try:
        proj_path = os.path.join(DATA_DIR, dataset, f"{projection}_{dataset}.npy")
        label_path = os.path.join(DATA_DIR, dataset, "labels.npy")

        X = np.load(proj_path).tolist()
        y = np.load(label_path).tolist()

        return jsonify({"X": X, "y": y})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/submit", methods=["POST"])
def submit():
    os.makedirs("results", exist_ok=True)
    data = request.json
    fname = datetime.utcnow().strftime("results/result_%Y%m%d_%H%M%S.json")
    with open(fname, "w") as f:
        json.dump(data, f, indent=2)
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))  # Render expects $PORT
    app.run(host="0.0.0.0", port=port)