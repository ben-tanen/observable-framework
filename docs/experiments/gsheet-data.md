---
title: Google Sheet Test
description: this page is a test of using Google Sheet data
---

# Experiment: Using data from an external Google Sheet

I set up this page to experiment with getting and using external data from a Google Sheet. The Google Sheet exists [here](https://docs.google.com/spreadsheets/d/1wediAtmyRAZgCCaB4Bj9VCvWcOA6Ep8_7jjhJrR51HI/edit), though you likely don't have access - sorry 🙃

The [data loader](https://github.com/ben-tanen/observable-framework/blob/master/docs/data/gsheet.csv.py) is fairly simplistic:

1. Set up authentication via a Google service account (which is mounted via [the build/publish step for hosting via Github Pages](../experiments/gh-pages))
2. Pull the data via the `gspread` library

```python
import os, sys, json
from google.oauth2 import service_account
import gspread
import pandas as pd

# import secrets (for use below)
secrets = json.load(open("env/secrets.json"))

# initialize google sheets access
creds_scope = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
creds_file = None
for f in [secrets["gsheet-sa-local-path"], "gsheet-sa.json"]:
    if os.path.isfile(f):
        creds_file = f
assert os.path.isfile(creds_file), "No credentials file found"
creds = service_account.Credentials.from_service_account_file(creds_file, scopes = creds_scope)
gc = gspread.authorize(creds)

# get data from gsheet
wkb = gc.open_by_key("1wediAtmyRAZgCCaB4Bj9VCvWcOA6Ep8_7jjhJrR51HI")
wks = wkb.worksheet("data")
df = pd.DataFrame(wks.get_all_records())

# export data
df.to_csv(sys.stdout, index = False)
```

---

Now that we have the data, here are a few very trivial representations of the data!

```js
const gsheet = FileAttachment("../data/gsheet.csv").csv({typed: true});
```

<div class="grid grid-cols-2">
  <div class="card">
  ${Inputs.table(gsheet, {
    format: {
        w: sparkbar(d3.max(gsheet, d => d.w))
    }
  })}
  </div>
  <div class="card">
    <p>Number of observations: ${gsheet.length}</p>
    <p>Here's a sparkbar of the data inline: ${Plot.plot({axis: null, margin: 0, width: 80, height: 17, x: {type: "band", round: false}, marks: [Plot.rectY(gsheet, {x: "x", y1: 0, y2: "y", fill: "var(--theme-blue)"})]})}</p>
  </div>
</div>

Here's the code to make the columns with sparkbars within the table.

```js echo
function sparkbar(max) {
  return (x) => htl.html`<div style="
    background: var(--theme-blue);
    color: black;
    font: 10px/1.6 var(--sans-serif);
    width: ${100 * x / max}%;
    float: right;
    padding-right: 3px;
    box-sizing: border-box;
    overflow: visible;
    display: flex;
    justify-content: end;">${x.toLocaleString("en-US")}`
}
```

Here's a chart of the data using Observable Plot!

```js
function chart(data, {width} = {}) {
  return Plot.plot({
    title: "Title",
    width,
    height: 300,
    x: {grid: true, label: "X-Axis", domain: [0, 10]},
    y: {grid: true, label: "Y-Axis", domain: [0, 10]},
    r: {domain: [10, 13], range: [5, 20]},
    marks: [
      Plot.dot(gsheet, {x: "y", y: "z", tip: true, fill: "x", r: "w"})
    ]
  });
}
```

<div class="grid grid-cols-1">
  <div class="card">
    ${resize((width) => chart(gsheet, {width}))}
  </div>
</div>



