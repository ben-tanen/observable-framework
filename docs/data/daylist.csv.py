import pandas as pd
import sys

df = pd.read_csv("/Users/ben-tanen/Desktop/Projects/spotify-lastfm-utils/data/daylist-names.csv")

df.to_csv(sys.stdout)