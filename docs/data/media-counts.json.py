import os
import sys
import json
import base64
import requests

REPO = "ben-tanen/media-count-automation"
DATA_PATH = "aggregated_data"

# token from env var (CI) or secrets.json (local)
token = os.environ.get("MEDIA_COUNTS_PAT")
if not token:
    secrets_path = os.path.join(os.path.dirname(__file__), "..", "..", "env", "secrets.json")
    if os.path.isfile(secrets_path):
        secrets = json.load(open(secrets_path))
        token = secrets.get("media-counts-pat")

assert token, "MEDIA_COUNTS_PAT not found in env or secrets.json"

headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
}

# list all files in aggregated_data/
listing = requests.get(
    f"https://api.github.com/repos/{REPO}/contents/{DATA_PATH}",
    headers=headers,
)
listing.raise_for_status()

# fetch and flatten each daily JSON
rows = []
for file_info in listing.json():
    if not file_info["name"].endswith(".json"):
        continue

    resp = requests.get(file_info["url"], headers=headers)
    resp.raise_for_status()
    content = base64.b64decode(resp.json()["content"]).decode("utf-8")
    day_data = json.loads(content)

    date = day_data["date"]
    for service_id, metrics in day_data["summary"].items():
        row = {"date": date, "service": service_id}
        row.update(metrics)
        rows.append(row)

json.dump(rows, sys.stdout)
