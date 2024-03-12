import os, sys, json
import requests

# import secrets (for use below)
secrets = json.load(open("env/secrets.json"))

# define notion api params
notion_api_key = secrets["notion-api-key"]
notion_api_query_url = f"https://api.notion.com/v1/databases/{secrets['notion-vinyl-db-id']}/query"
notion_api_header = {
    "Authorization": f"Bearer {secrets['notion-api-key']}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}

# get first batch of results
init_req = requests.post(f"https://api.notion.com/v1/databases/{secrets['notion-vinyl-db-id']}/query",
    headers = notion_api_header,
    json = {
        "sorts": [{
            "property": "Added",
            "direction": "ascending"
        }]
    })

assert init_req.status_code == 200, "Initial Notion API call failed"

# while more results, keep getting them
req = init_req
results = req.json()["results"]
while req.json()["has_more"]:
    req = requests.post(f"https://api.notion.com/v1/databases/{secrets['notion-vinyl-db-id']}/query",
        headers = notion_api_header,
        json = {
            "start_cursor": req.json()["next_cursor"],
            "sorts": [{
                "property": "Added",
                "direction": "ascending"
            }]
        })
    assert req.status_code == 200, f"Subsequent Notion API call failed"
    results += req.json()["results"]

# export results
json.dump(results, sys.stdout)