---
theme: dashboard
title: New Music Friday
toc: false
---

# New Music Friday

```js
const data = FileAttachment("data/new-music-friday.json").json();
```

```js
const {releases, artists} = data;
const parseDate = (s) => new Date(`${s}T00:00`);
const fmtDay = d3.timeFormat("%b %-d");
// generated_at carries an MT offset; format in MT regardless of the viewer's timezone
const fmtUpdated = (d) => d.toLocaleDateString("en-US", {timeZone: "America/Denver", weekday: "short", month: "short", day: "numeric"});
const fmtTime = (d) => d.toLocaleTimeString("en-US", {timeZone: "America/Denver", hour: "2-digit", minute: "2-digit", second: "2-digit"});
```

<p class="muted">Updated ${fmtUpdated(new Date(data.generated_at))} (${fmtTime(new Date(data.generated_at))} MT)<br>Releases since ${fmtDay(parseDate(data.date_since))}</p>

${data.partial ? html`<div class="note">Spotify rate-limited this refresh, so only ${data.artists_checked} artists were checked. Results are incomplete until the next refresh.</div>` : ""}

```js
// pill categories, in display order; `rank` is the artist field holding the top-artists rank
const CATEGORIES = [
  {id: "following", label: "Following", rank: null},
  {id: "long", label: "Long-Term", rank: "long_term"},
  {id: "short", label: "Short-Term", rank: "short_term"},
  {id: "medium", label: "Medium-Term", rank: "medium_term"}
];

const hasCategory = (artist, c) => c.rank ? artist[c.rank] != null : artist.following;

// pills for one artist: [{id, label}]
function artistPills(artist) {
  return CATEGORIES
    .filter((c) => hasCategory(artist, c))
    .map((c) => ({id: c.id, label: c.rank ? `${c.label}, Top #${artist[c.rank]}` : c.label}));
}

// pills for a release: best rank per category across all matched artists
function releasePills(release) {
  const matched = release.matched_artist_ids.map((id) => artists[id]);
  return CATEGORIES.flatMap((c) => {
    const hits = matched.filter((a) => hasCategory(a, c));
    if (!hits.length) return [];
    return [{id: c.id, label: c.rank ? `${c.label}, Top #${d3.min(hits, (a) => a[c.rank])}` : c.label}];
  });
}

const pill = ({id, label}) => html`<span class="pill pill-${id}">${label}</span>`;
const pillRow = (pills) => html`<span class="pill-row">${pills.map(pill)}</span>`;

// toggleable filter pills; value is the array of active category ids
function pillToggle(categories, {value = categories.map((c) => c.id)} = {}) {
  const active = new Set(value);
  const form = html`<div class="pill-row pill-toggle">${categories.map((c) => {
    const button = html`<button type="button" class="pill pill-${c.id}">${c.label}</button>`;
    button.classList.toggle("off", !active.has(c.id));
    button.onclick = () => {
      active.has(c.id) ? active.delete(c.id) : active.add(c.id);
      button.classList.toggle("off", !active.has(c.id));
      form.value = categories.map((c) => c.id).filter((id) => active.has(id));
      form.dispatchEvent(new Event("input", {bubbles: true}));
    };
    return button;
  })}</div>`;
  form.value = categories.map((c) => c.id).filter((id) => active.has(id));
  return form;
}
```

```js
const viewMode = view(Inputs.radio(["Grouped by artist", "All releases"], {label: "View", value: "Grouped by artist"}));
```

<div class="filter-line"><span class="filter-label">Show</span>${showInput}</div>

```js
const showInput = pillToggle(CATEGORIES);
const show = Generators.input(showInput);
```

```js
// OR logic: keep a release if any matched artist is in any active category
const activeCategories = CATEGORIES.filter((c) => show.includes(c.id));
const filtered = releases.filter((r) =>
  r.matched_artist_ids.some((id) => activeCategories.some((c) => hasCategory(artists[id], c)))
);
const filteredArtistIds = new Set(filtered.map((r) => r.primary_artist_id));

// current release week: the Friday on or before today (matches the loader's release_week)
const today = new Date();
const thisWeek = d3.timeFormat("%Y-%m-%d")(d3.timeDay.offset(today, -((today.getDay() + 2) % 7)));
const thisWeekCount = filtered.filter((r) => r.release_week === thisWeek).length;
```

<div class="grid grid-cols-3">
  <div class="card">
    <h2>Artists with releases</h2>
    <span class="big">${filteredArtistIds.size}</span>
    <div class="muted">of ${data.artists_checked} checked</div>
  </div>
  <div class="card">
    <h2>New releases (this week)</h2>
    <span class="big">${thisWeekCount}</span>
    <div class="muted">since ${fmtDay(parseDate(thisWeek))}</div>
  </div>
  <div class="card">
    <h2>New releases (total)</h2>
    <span class="big">${filtered.length}</span>
    <div class="muted">since ${fmtDay(parseDate(data.date_since))}</div>
  </div>
</div>

```js
const TYPE_ORDER = {album: 0, single: 1, compilation: 2};
const TYPE_LABEL = {album: "Album", single: "Single", compilation: "Compilation"};

const releaseMeta = (r) =>
  `${TYPE_LABEL[r.album_type] ?? r.album_type} · ${r.total_tracks} track${r.total_tracks === 1 ? "" : "s"} · ${fmtDay(parseDate(r.release_date))}`;

// artist sort within a week: more pills, then best rank (mirrors the loader's primary-artist rule)
function artistPriority(artist) {
  const pills = artistPills(artist).length;
  const best = d3.min(CATEGORIES.filter((c) => c.rank), (c) => artist[c.rank]) ?? Infinity;
  return [-pills, best];
}

function artistCard(artistId, artistReleases) {
  const artist = artists[artistId];
  // headline: most substantial release (album > single), newest first
  const sorted = d3.sort(artistReleases, (r) => TYPE_ORDER[r.album_type] ?? 9, (r) => -parseDate(r.release_date));
  const [headline, ...rest] = sorted;
  // all credited artists, grouping artist first and bolded
  const credits = [artist.name, ...headline.artists.filter((a) => a.id !== artistId).map((a) => a.name)];
  return html`<div class="card release-card">
    <img class="artwork" src=${headline.artwork_url} alt="">
    <div class="release-body">
      ${pillRow(releasePills(headline))}
      <div class="artist-line">${credits.map((name, i) => i ? html`, ${name}` : html`<span class="artist-name">${name}</span>`)}</div>
      <a class="release-title" href=${headline.album_url} target="_blank">${headline.album_name}</a>
      <div class="muted small">${releaseMeta(headline)}</div>
      ${rest.length ? html`<div class="muted small">Also: ${rest.map((r, i) => html`${i ? " · " : ""}<a href=${r.album_url} target="_blank">${r.album_name}</a> (${TYPE_LABEL[r.album_type] ?? r.album_type}, ${fmtDay(parseDate(r.release_date))})`)}</div>` : ""}
    </div>
  </div>`;
}

function groupedView(rows) {
  const weeks = d3.groups(rows, (r) => r.release_week, (r) => r.primary_artist_id)
    .sort(([a], [b]) => d3.descending(a, b));
  if (!weeks.length) return html`<p class="muted">No releases match the current filters.</p>`;
  return html`${weeks.map(([week, byArtist]) => html`
    <h2 class="week-heading">Week of ${fmtDay(parseDate(week))}</h2>
    <div class="grid grid-cols-2">${d3.sort(byArtist, ([id]) => artistPriority(artists[id])[0], ([id]) => artistPriority(artists[id])[1])
      .map(([id, rs]) => artistCard(id, rs))}</div>`)}`;
}

function tableView(rows) {
  return Inputs.table(rows.map((r) => ({...r, artist_names: r.artists, pills: releasePills(r)})), {
    columns: ["artwork_thumb_url", "release_date", "album_name", "album_type", "artist_names", "pills"],
    header: {artwork_thumb_url: "", release_date: "Released", album_name: "Release", album_type: "Type", artist_names: "Artist", pills: "Tier"},
    format: {
      artwork_thumb_url: (url) => html`<img src=${url} width=32 height=32 class="thumb" alt="">`,
      album_name: (name, i, data) => html`<a href=${data[i].album_url} target="_blank">${name}</a>`,
      album_type: (t) => TYPE_LABEL[t] ?? t,
      // matched artists in bold, other credits plain
      artist_names: (list, i, data) => html`${list.map((a, j) => html`${j ? ", " : ""}${data[i].matched_artist_ids.includes(a.id) ? html`<b>${a.name}</b>` : a.name}`)}`,
      pills: (p) => pillRow(p)
    },
    sort: "release_date",
    reverse: true,
    rows: 20,
    width: {artwork_thumb_url: 44, release_date: 90, album_type: 70}
  });
}
```

```js
display(viewMode === "Grouped by artist" ? groupedView(filtered) : tableView(filtered));
```

<style>
  .muted { color: var(--theme-foreground-muted); }
  .small { font-size: 12px; }
  .filter-line { display: flex; align-items: center; gap: 1rem; margin: 0.5rem 0 1rem; font: 13px var(--sans-serif); }
  .filter-label { width: 120px; }

  /* pills: filled = active/tag, .off = outline only */
  .pill-row { display: inline-flex; flex-wrap: wrap; gap: 4px 6px; vertical-align: middle; }
  .pill {
    display: inline-block; padding: 1px 9px; border-radius: 999px; border: 1.5px solid var(--pill);
    background: var(--pill); color: var(--pill-text);
    font: 500 11.5px/1.5 var(--sans-serif); white-space: nowrap;
  }
  .pill-following { --pill: #1E3888; --pill-text: #fff; }
  .pill-long { --pill: #9C3848; --pill-text: #fff; }
  .pill-short { --pill: #F5B841; --pill-text: #161616; }
  .pill-medium { --pill: #8ED081; --pill-text: #161616; }
  .pill.off { background: none; color: var(--theme-foreground-muted); }
  .pill-toggle .pill { cursor: pointer; font-size: 12px; padding: 2px 10px; }

  .week-heading { margin-top: 1.5rem; }
  .release-card { display: flex; gap: 1rem; align-items: flex-start; margin: 0; }
  .release-card .artwork { width: 72px; height: 72px; border-radius: 4px; flex: none; object-fit: cover; background: var(--theme-background-alt); }
  .release-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .artist-line { font: 16px var(--sans-serif); color: var(--theme-foreground-muted); margin-top: 2px; }
  .artist-name { font-weight: 600; color: var(--theme-foreground); }
  .release-title { font: 500 14px var(--sans-serif); }
  .thumb { display: block; border-radius: 3px; }
</style>
