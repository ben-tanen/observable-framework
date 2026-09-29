import sys, json, re, base64, html as html_lib
import requests
import markdown

# import secrets (for use below)
secrets = json.load(open("env/secrets.json"))
db_id = secrets['notion-media-count-update-log-db-id']

# define notion api params
notion_api_header = {
    "Authorization": f"Bearer {secrets['notion-api-key']}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}
# the page markdown endpoint needs a newer api version than the database query
notion_markdown_header = {**notion_api_header, "Notion-Version": "2026-03-11"}

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


# get a page's full body (including nested blocks) as notion-flavored markdown
def get_page_markdown(page_id):
    resp = requests.get(f"https://api.notion.com/v1/pages/{page_id}/markdown", headers = notion_markdown_header)
    assert resp.status_code == 200, f"Notion markdown fetch failed for {page_id}: {resp.text}"
    body = resp.json()
    if body.get("truncated") or body.get("unknown_block_ids"):
        print(f"warning: page {page_id} has truncated or unsupported blocks: {body.get('unknown_block_ids')}", file=sys.stderr)
    return body["markdown"]


LIST_RE = re.compile(r"^\s*([-*+]|\d+\.)\s")

def list_kind(line):
    m = LIST_RE.match(line)
    return None if not m else ("ol" if m.group(1)[0].isdigit() else "ul")

# notion joins top-level blocks with single newlines, but markdown needs blank lines between
# blocks; add them everywhere except inside code fences and between items of the same list
def separate_blocks(md):
    lines = md.split("\n")
    out, in_fence = [], False
    for i, line in enumerate(lines):
        out.append(line)
        if line.strip().startswith("```"):
            in_fence = not in_fence
        if in_fence or i == len(lines) - 1:
            continue
        nxt = lines[i + 1]
        if not line.strip() or not nxt.strip():
            continue
        is_list = bool(LIST_RE.match(line)) or line.startswith((" ", "\t"))
        next_is_list = bool(LIST_RE.match(nxt)) or nxt.startswith((" ", "\t"))
        # nested children stay attached; a bullet -> numbered switch starts a new list
        if is_list and next_is_list and (nxt.startswith((" ", "\t")) or list_kind(line) == list_kind(nxt)):
            continue
        out.append("")
    return "\n".join(out)


# notion-hosted files come back as pre-signed urls that expire shortly after the build,
# so inline them as data uris; external image urls are left as-is
NOTION_FILE_HOSTS = ("prod-files-secure.s3", "s3.us-west-2.amazonaws.com", "file.notion.so")

def inline_notion_images(html):
    def replace(match):
        url = html_lib.unescape(match.group(2))  # markdown escapes & -> &amp; in attributes, which breaks the s3 signature
        if not any(host in url for host in NOTION_FILE_HOSTS):
            return match.group(0)
        resp = requests.get(url)
        assert resp.status_code == 200, f"Notion image download failed ({resp.status_code}): {url[:80]}"
        mime = resp.headers.get("Content-Type", "image/png").split(";")[0]
        data = base64.b64encode(resp.content).decode("ascii")
        return f'{match.group(1)}data:{mime};base64,{data}{match.group(3)}'
    return re.sub(r'(<img[^>]*\ssrc=")([^"]+)(")', replace, html)


def markdown_to_html(md):
    md = re.sub(r"<unknown[^>]*/>", "", md)  # drop unsupported-block placeholders
    html = markdown.markdown(separate_blocks(md), extensions = ["fenced_code", "sane_lists", "tables"])
    # open links in a new tab, matching the rest of the dashboard
    html = html.replace("<a href=", '<a target="_blank" rel="noopener noreferrer" href=')
    return inline_notion_images(html)


# flatten each page to {date, title, content}
updates = []
for page in results:
    props = page["properties"]
    updates.append({
        "id": page["id"],
        "date": (props["Date"]["date"] or {}).get("start"),
        "title": "".join(rt["plain_text"] for rt in props["Title"]["title"]),
        "content": markdown_to_html(get_page_markdown(page["id"])),
    })

# export results
json.dump(updates, sys.stdout)
