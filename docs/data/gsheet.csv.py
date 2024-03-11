
import os, sys
from google.oauth2 import service_account
import gspread
import pandas as pd

# initialize google sheets access
creds_scope = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
creds_file = None
for f in ["/Users/ben-tanen/secrets/gsheet-sa.json", "gsheet-sa.json"]:
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