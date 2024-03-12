import os, sys
import requests
from bs4 import BeautifulSoup
import pandas as pd

films = []

for pix in range(1, 15):
    res = requests.get(f"https://letterboxd.com/btanen/watchlist/page/{pix}/")
    soup = BeautifulSoup(res.text, 'html.parser')
    poster_containers = soup.find_all("li", class_ = "poster-container")
    if len(poster_containers) == 0:
        continue
    posters = [p.find("div") for p in poster_containers]
    films += [{
        "id": p.find("div")["data-film-slug"],
        "title": p.find("div").find("img")["alt"],
        "link": p.find("div")["data-target-link"]
    } for p in soup.find_all("li", class_ = "poster-container")]

df = pd.DataFrame(films)

df.to_csv(sys.stdout, index = False)
