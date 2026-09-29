import os, sys, json
import html
import requests

# import secrets (for use below)
secrets = json.load(open("env/secrets.json"))
db_id = secrets['notion-media-count-update-log-db-id']

# define notion api params
notion_api_key = secrets["notion-api-key"]
notion_api_query_url = f"https://api.notion.com/v1/databases/{db_id}/query"
notion_api_header = {
    "Authorization": f"Bearer {secrets['notion-api-key']}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}

# get first batch of results
init_req = requests.post(f"https://api.notion.com/v1/databases/{db_id}/query",
    headers = notion_api_header,
    json = {
        "sorts": [{
            "property": "Date",
            "direction": "descending"
        }]
    })

assert init_req.status_code == 200, "Initial Notion API call failed"

# while more results, keep getting them
req = init_req
results = req.json()["results"]
while req.json()["has_more"]:
    req = requests.post(f"https://api.notion.com/v1/databases/{db_id}/query",
        headers = notion_api_header,
        json = {
            "start_cursor": req.json()["next_cursor"],
            "sorts": [{
                "property": "Date",
                "direction": "descending"
            }]
        })
    assert req.status_code == 200, f"Subsequent Notion API call failed"
    results += req.json()["results"]


# get all child blocks of a page/block (paginated)
def get_blocks(block_id):
    blocks = []
    params = {"page_size": 100}
    while True:
        resp = requests.get(f"https://api.notion.com/v1/blocks/{block_id}/children",
            headers = notion_api_header, params = params)
        assert resp.status_code == 200, f"Notion block fetch failed for {block_id}: {resp.text}"
        body = resp.json()
        blocks += body["results"]
        if not body["has_more"]:
            return blocks
        params["start_cursor"] = body["next_cursor"]


# convert notion rich text to html (annotations, links, and in-block newlines)
def rich_text_to_html(rich_text):
    out = ""
    for rt in rich_text:
        text = html.escape(rt["plain_text"]).replace("\n", "<br>")
        ann = rt["annotations"]
        if ann["code"]: text = f"<code>{text}</code>"
        if ann["bold"]: text = f"<strong>{text}</strong>"
        if ann["italic"]: text = f"<em>{text}</em>"
        if ann["strikethrough"]: text = f"<s>{text}</s>"
        if ann["underline"]: text = f"<u>{text}</u>"
        if rt.get("href"): text = f'<a href="{html.escape(rt["href"])}" target="_blank" rel="noopener noreferrer">{text}</a>'
        out += text
    return out


# convert a list of blocks to html, grouping consecutive list items into <ul>/<ol>
LIST_TAGS = {"bulleted_list_item": "ul", "numbered_list_item": "ol", "to_do": "ul"}
SIMPLE_TAGS = {"paragraph": "p", "heading_1": "h3", "heading_2": "h4", "heading_3": "h5", "quote": "blockquote"}

def blocks_to_html(blocks):
    out = ""
    open_list = None
    for block in blocks:
        btype = block["type"]
        data = block[btype]

        # close an open list when the block type changes
        list_tag = LIST_TAGS.get(btype)
        if open_list and open_list != list_tag:
            out += f"</{open_list}>"
            open_list = None
        if list_tag and not open_list:
            out += f"<{list_tag}>"
            open_list = list_tag

        text = rich_text_to_html(data.get("rich_text", []))
        children = blocks_to_html(get_blocks(block["id"])) if block.get("has_children") else ""

        if btype in SIMPLE_TAGS:
            tag = SIMPLE_TAGS[btype]
            out += f"<{tag}>{text}{children}</{tag}>"
        elif btype == "to_do":
            box = "☑" if data.get("checked") else "☐"
            out += f"<li>{box} {text}{children}</li>"
        elif list_tag:
            out += f"<li>{text}{children}</li>"
        elif btype == "code":
            out += f"<pre><code>{html.escape(''.join(rt['plain_text'] for rt in data['rich_text']))}</code></pre>"
        elif btype == "divider":
            out += "<hr>"
        else:
            # unsupported block types: fall back to their text so nothing silently disappears
            out += f"<p>{text}</p>{children}" if text or children else ""
            print(f"warning: unsupported notion block type '{btype}'", file=sys.stderr)
    if open_list:
        out += f"</{open_list}>"
    return out


# flatten each page to {date, title, content}
updates = []
for page in results:
    props = page["properties"]
    updates.append({
        "id": page["id"],
        "date": (props["Date"]["date"] or {}).get("start"),
        "title": "".join(rt["plain_text"] for rt in props["Title"]["title"]),
        "content": blocks_to_html(get_blocks(page["id"])),
    })

# export results
json.dump(updates, sys.stdout)
