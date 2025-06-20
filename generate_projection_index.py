# generate_projection_index.py
import os
import json

DATA_DIR = "data"
index = {}

for dataset in sorted(os.listdir(DATA_DIR)):
    dataset_path = os.path.join(DATA_DIR, dataset)
    if not os.path.isdir(dataset_path):
        continue

    projections = []
    for fname in os.listdir(dataset_path):
        if fname.endswith(".npy") and "_labels" not in fname:
            if fname.startswith(dataset):
                continue  # skip files like "y.npy"
            proj_name = fname.replace(f"_{dataset}.npy", "")
            projections.append(proj_name)

    index[dataset] = sorted(projections)

with open("projection_index.json", "w") as f:
    json.dump(index, f, indent=2)

print("✅ projection_index.json generated.")
