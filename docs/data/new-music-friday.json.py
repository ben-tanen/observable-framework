
import json, os, sys, time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import pandas as pd
import spotipy
from spotipy.cache_handler import MemoryCacheHandler
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

###

SPOTIFY_SCOPES = "user-top-read user-follow-read"

def get_secret(env_key, secrets_key):
	# value from env var (CI) or secrets.json (local)
	value = os.environ.get(env_key)
	if not value:
		secrets_path = os.path.join(os.path.dirname(__file__), "..", "..", "env", "secrets.json")
		if os.path.isfile(secrets_path):
			value = json.load(open(secrets_path)).get(secrets_key)
	assert value, f"{env_key} not found in env or secrets.json"
	return value

def get_sp_client():
	auth_manager = spotipy.SpotifyOAuth(
		client_id = get_secret("SPOTIPY_CLIENT_ID", "spotify-client-id"),
		client_secret = get_secret("SPOTIPY_CLIENT_SECRET", "spotify-client-secret"),
		redirect_uri = os.environ.get("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback"),
		scope = SPOTIFY_SCOPES,
		open_browser = False,
		cache_handler = MemoryCacheHandler(), # no .cache file written during builds
	)
	# refresh token from a one-time interactive OAuth flow, so builds never prompt
	auth_manager.refresh_access_token(get_secret("SPOTIFY_REFRESH_TOKEN", "spotify-refresh-token"))

	# surface 429s immediately instead of sleeping through Retry-After
	session = requests.Session()
	session.mount("https://", HTTPAdapter(max_retries = Retry(
		total = 3,
		status_forcelist = (500, 502, 503, 504),
		allowed_methods = frozenset(["GET"]),
		respect_retry_after_header = False,
	)))
	return spotipy.Spotify(auth_manager = auth_manager, requests_session = session, requests_timeout = 10)

class QuotaExceeded(Exception):
	pass

MAX_SHORT_WAIT = 60 # Retry-After at or below this is the rolling rate limit; above it is the quota lockout

def call_spotify(fn, *args, **kwargs):
	# wait out short 429s (rolling 30s rate limit); raise on long ones (quota lockout)
	for attempt in range(3):
		try:
			return fn(*args, **kwargs)
		except spotipy.SpotifyException as e:
			if e.http_status != 429:
				raise
			wait = int((e.headers or {}).get("Retry-After", 0))
			if wait > MAX_SHORT_WAIT:
				raise QuotaExceeded(f"Rate limited for {wait}s (~{wait / 3600:.1f}h)") from e
			print(f"429, retrying in {wait + 1}s", file = sys.stderr)
			time.sleep(wait + 1)
	return fn(*args, **kwargs)

###

def get_top_artists(artists = {}, time_ranges = ["short_term", "medium_term", "long_term"], limit = 50):
	for time_range in time_ranges:
		offset = 0
		while True:
			print(f"Fetching {time_range} artists, offset {offset}", file = sys.stderr)
			result = call_spotify(sp.current_user_top_artists, limit = limit, offset = offset, time_range = time_range)
			for ix, artist in enumerate(result["items"]):
				artists[artist["id"]] = {
					**artists.get(artist["id"], {}),
					**{
						"id": artist["id"],
						"name": artist["name"],
						time_range: offset + ix + 1
					}
				}
			if not result["next"]:
				break
			else:
				offset += limit
	return artists

def get_followed_artists(artists = {}, limit = 50):
	after = None
	while True:
		result = call_spotify(sp.current_user_followed_artists, limit = limit, after = after)
		for artist in result["artists"]["items"]:
			artists[artist["id"]] = {
				**artists.get(artist["id"], {}),
				**{
					"id": artist["id"],
					"name": artist["name"],
					"following": True
				}
			}
		if not result["artists"]["next"]:
			break
		else:
			after = result["artists"]["cursors"]["after"]
	return artists

def pick_image(images, target_width):
	# smallest image at least target_width wide, else the largest available
	if not images:
		return None
	wide_enough = [i for i in images if (i.get("width") or 0) >= target_width]
	return (min(wide_enough, key = lambda i: i["width"]) if wide_enough else max(images, key = lambda i: i.get("width") or 0))["url"]

def add_album(album, albums, artists, artist_id):
	albums[album["id"]] = {
		**albums.get(album["id"], {}),
		**{
			"album_id": album["id"],
			"album_name": album["name"],
			"album_type": album["album_type"],
			"album_tracks": album["total_tracks"],
			"album_release_date": album["release_date"],
			"artists": [{ "id": artist["id"], "name": artist["name"] } for artist in album["artists"]],
			"album_url": album["external_urls"]["spotify"],
			"artwork_url": pick_image(album["images"], 300),
			"artwork_thumb_url": pick_image(album["images"], 64),
			"album_src": albums.get(album["id"], {}).get("album_src", []) + [f"spotify:artist:{artist_id}"]
		}
	}
	return albums

def get_artist_recent_albums_v1(artist_id, artist_name, date_since, album_types = ["album", "single"], limit = 10, sleep = 0.5, albums = {}, artists = {}):
	for album_type in album_types:
		offset = 0
		total = None
		done = False
		while not done:
			print(f"Fetching {album_type}s for artist {artist_name} ({artist_id}), offset {offset} of {total if total else '???'}", file = sys.stderr)
			result = sp.artist_albums(
				artist_id = artist_id,
				album_type = album_type,
				limit = limit,
				offset = offset
			)
			time.sleep(sleep)
			total = result["total"]
			for album in result["items"]:
				if album["release_date"] >= date_since:
					albums = add_album(album, albums, artists, artist_id)
				else:
					done = True
					break
			if not result["next"]:
				done = True
				break
			else:
				offset += limit
		return albums

def get_artist_recent_albums_v2(artist_id, artist_name, date_since, limit = 10, albums = {}, artists = {}):
	search_name = artist_name.replace('"', "")
	offset = 0
	total = None
	done = False
	while not done:
		print(f"Fetching tag:new albums for artist {artist_name} ({artist_id}), offset {offset} of {total if total else '???'}", file = sys.stderr)
		result = call_spotify(sp.search, q = f'artist:"{search_name}" tag:new', type = "album", limit = limit, offset = offset)
		total = result["albums"]["total"]
		for album in result["albums"]["items"]:
			if artist_id in [a["id"] for a in album["artists"]] and album["release_date"] >= date_since:
				albums = add_album(album, albums, artists, artist_id)
		if not result["albums"]["next"]:
			done = True
			break
		else:
			offset += limit
	return albums

def get_recent_albums(artists = {}, date_since = None, query = "following or long_term <= 200 or medium_term <= 100 or short_term <= 100", limit = None):
	albums = {}
	artists_df = pd.DataFrame(artists.values()).set_index("id")
	artists_df["following"] = artists_df["following"].eq(True)
	artist_ids = artists_df.query(query).index
	artist_ids = artist_ids[:limit] if (limit and isinstance(limit, int) and limit < artists_df.shape[0]) else artist_ids
	for i, artist_id in enumerate(artist_ids):
		artist_name = artists_df.loc[artist_id, "name"]
		try:
			albums = get_artist_recent_albums_v2(artist_id, artist_name, date_since, albums = albums, artists = artists)
		except QuotaExceeded as e:
			# keep what we have rather than failing the whole site build
			print(f"Stopping after {i} of {len(artist_ids)} artists: {e}", file = sys.stderr)
			return albums, i, True
	return albums, len(artist_ids), False

TERMS = ["short_term", "medium_term", "long_term"]

def artist_priority(artist):
	# more pills first, then best rank across time ranges
	pills = int(bool(artist.get("following"))) + sum(artist.get(t) is not None for t in TERMS)
	best_rank = min([artist[t] for t in TERMS if artist.get(t) is not None], default = float("inf"))
	return (-pills, best_rank)

def release_week(release_date):
	# Friday that starts the release's week (releases land on Fridays)
	d = datetime.strptime(release_date, "%Y-%m-%d")
	return (d - timedelta(days = (d.weekday() - 4) % 7)).strftime("%Y-%m-%d")

def build_output(albums, artists, date_since, artists_checked, partial):
	releases = []
	for album in albums.values():
		matched = [a["id"] for a in album["artists"] if a["id"] in artists]
		if not matched:
			continue
		# stable sort keeps release credit order as the final tie-break
		primary = sorted(matched, key = lambda i: artist_priority(artists[i]))[0]
		releases.append({
			"album_id": album["album_id"],
			"album_name": album["album_name"],
			"album_type": album["album_type"],
			"total_tracks": album["album_tracks"],
			"release_date": album["album_release_date"],
			"release_week": release_week(album["album_release_date"]),
			"album_url": album["album_url"],
			"artwork_url": album["artwork_url"],
			"artwork_thumb_url": album["artwork_thumb_url"],
			"artists": album["artists"],
			"matched_artist_ids": matched,
			"primary_artist_id": primary,
		})
	releases.sort(key = lambda r: r["release_date"], reverse = True)

	matched_ids = {i for r in releases for i in r["matched_artist_ids"]}
	artist_lookup = {
		i: {
			"name": artists[i]["name"],
			"following": bool(artists[i].get("following")),
			**{ t: artists[i].get(t) for t in TERMS },
		} for i in matched_ids
	}
	return {
		"generated_at": datetime.now(ZoneInfo("America/Denver")).isoformat(timespec = "seconds"),
		"date_since": date_since,
		"partial": partial,
		"artists_checked": artists_checked,
		"releases": releases,
		"artists": artist_lookup,
	}

sp = get_sp_client()

artists = get_followed_artists(artists = get_top_artists())

print(f"Got {len(artists.keys())} artists", file = sys.stderr)

# NMF_ARTIST_LIMIT caps searches while testing (keeps us well under the API quota)
artist_limit = int(os.environ.get("NMF_ARTIST_LIMIT", 0)) or None
date_since = (datetime.today() - timedelta(days = 14)).strftime("%Y-%m-%d")
albums, artists_checked, partial = get_recent_albums(artists = artists, date_since = date_since, limit = artist_limit)

print(f"Got {len(albums.keys())} albums", file = sys.stderr)

json.dump(build_output(albums, artists, date_since, artists_checked, partial), sys.stdout)
