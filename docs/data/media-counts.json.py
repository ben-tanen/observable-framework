import os
import sys
import json
import requests
from concurrent.futures import ThreadPoolExecutor

OWNER, NAME = "ben-tanen", "media-count-automation"
REPO = f"{OWNER}/{NAME}"
BRANCH = "main"
DATA_PATH = "aggregated_data"
HISTORY_BATCH = 50  # aliased history lookups per query (keeps query cost/complexity low)

# token from env var (CI) or secrets.json (local)
token = os.environ.get("MEDIA_COUNTS_PAT")
if not token:
    secrets_path = os.path.join(os.path.dirname(__file__), "..", "..", "env", "secrets.json")
    if os.path.isfile(secrets_path):
        secrets = json.load(open(secrets_path))
        token = secrets.get("media-counts-pat")

assert token, "MEDIA_COUNTS_PAT not found in env or secrets.json"

session = requests.Session()
session.headers.update({"Authorization": f"Bearer {token}"})


def graphql(query, variables=None):
    resp = session.post("https://api.github.com/graphql", json={"query": query, "variables": variables or {}})
    resp.raise_for_status()
    body = resp.json()
    # GraphQL returns 200 with an errors array on failure, so check explicitly
    if body.get("errors"):
        raise RuntimeError(f"GraphQL errors: {body['errors']}")
    return body["data"]


# 1 query: every file in aggregated_data/ with its contents
tree = graphql("""
query($owner: String!, $name: String!, $expr: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expr) {
      ... on Tree {
        entries { name path object { ... on Blob { text isTruncated } } }
      }
    }
  }
}
""", {"owner": OWNER, "name": NAME, "expr": f"{BRANCH}:{DATA_PATH}"})["repository"]["object"]

files = sorted((e for e in tree["entries"] if e["name"].endswith(".json")), key=lambda e: e["name"])
for e in files:
    blob = e["object"]
    if blob is None or blob["text"] is None or blob["isTruncated"]:
        raise RuntimeError(f"could not read full contents of {e['path']} via GraphQL")


def fetch_last_edited(batch):
    # 1 query per batch: last commit date per file via aliased history lookups
    aliases = "\n".join(
        f'f{i}: history(first: 1, path: {json.dumps(e["path"])}) {{ nodes {{ committedDate }} }}'
        for i, e in enumerate(batch)
    )
    target = graphql(f"""
    query($owner: String!, $name: String!, $ref: String!) {{
      repository(owner: $owner, name: $name) {{
        ref(qualifiedName: $ref) {{ target {{ ... on Commit {{ {aliases} }} }} }}
      }}
    }}
    """, {"owner": OWNER, "name": NAME, "ref": BRANCH})["repository"]["ref"]["target"]
    return {
        e["path"]: (target[f"f{i}"]["nodes"] or [{}])[0].get("committedDate")
        for i, e in enumerate(batch)
    }


# history lookups are slow server-side (~1.5s per batch), so run batches in parallel
batches = [files[i:i + HISTORY_BATCH] for i in range(0, len(files), HISTORY_BATCH)]
last_edited = {}
with ThreadPoolExecutor(max_workers=len(batches) or 1) as pool:
    for result in pool.map(fetch_last_edited, batches):
        last_edited.update(result)

# flatten into rows + sources (same output shape as before)
rows = []
sources = []
for e in files:
    day_data = json.loads(e["object"]["text"])
    date = day_data["date"]
    for service_id, metrics in day_data["summary"].items():
        data_date = metrics.get("data_date")
        stale = bool(data_date and data_date < date)
        row = {"date": date, "service": service_id, "stale": stale}
        row.update(metrics)
        rows.append(row)

    sources.append({
        "file": e["name"],
        "url": f"https://github.com/{REPO}/blob/{BRANCH}/{e['path']}",
        "date": date,
        "last_edited": last_edited[e["path"]],
    })

json.dump({"rows": rows, "sources": sources}, sys.stdout)
