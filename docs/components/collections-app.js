// Media Collections SPA — vanilla JS component for Observable Framework
// Manages media item collections stored in GitHub (ben-tanen/media-count-automation)

const API_BASE = "https://api.github.com";
const REPO = "ben-tanen/media-count-automation";
const PAT_KEY = "media-collections-pat";
const DRAFT_KEY = "media-collections-draft";

const SERVICE_COLORS = {
  youtube: "#ef5350",
  letterboxd: "#66bb6a",
  feedly: "#ffa726",
  goodreads: "#8d6e63",
  spotify: "#1db954",
  sequel_shows: "#ab47bc",
  sequel_games: "#42a5f5",
  musicbox: "#ec407a",
  raindrop: "#26c6da",
};

const SERVICE_ID_FIELDS = {
  youtube: "video_href",
  letterboxd: "url",
  feedly: "article_link",
  goodreads: "url",
  spotify: "spotify_uri",
  sequel_shows: "imdb_id",
  sequel_games: "title",
  musicbox: "url",
  raindrop: "link",
};

const SCRAPE_SERVICES = ["youtube", "letterboxd", "feedly", "goodreads", "spotify", "raindrop"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64Decode(str) {
  const bytes = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function ghFetch(path, pat, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}/repos/${REPO}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function itemKey(service, itemId) {
  return `${service}::${itemId}`;
}

function displayName(item) {
  return item._displayName || item._item_id || "(unknown)";
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ── State ────────────────────────────────────────────────────────────────────

function createState() {
  return {
    pat: localStorage.getItem(PAT_KEY) || "",
    config: null,
    collections: null,
    collectionsSnapshot: null, // deep copy from last save/load for diffing
    collectionsSha: null,
    serviceItems: {}, // {serviceName: [normalizedItems]}
    dirty: false,
    activeTab: "browse",
    browseService: null,
    browseSearch: "",
    browseFilter: "all", // all | in-collection | has-deps | has-dependents
    collectionDetail: null, // collection UUID or null
    scrapeRuns: [],
    loading: true,
    error: null,
  };
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadConfig(pat) {
  const file = await ghFetch("contents/config.yaml", pat);
  return file.content;
}

async function loadCollections(pat) {
  const file = await ghFetch("contents/collections.json", pat);
  const data = JSON.parse(b64Decode(file.content));
  return { data, sha: file.sha };
}

async function loadServiceData(serviceName, serviceConfig, pat) {
  try {
    const cfg = serviceConfig || {};
    const dir = cfg.service_dir || serviceName;
    const listing = await ghFetch(`contents/services/${dir}/data`, pat);
    if (!Array.isArray(listing) || listing.length === 0) return [];

    // Match files using data_file_pattern (glob with * wildcard) or default to *.json
    const pattern = cfg.data_file_pattern || "*.json";
    const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
    const matched = listing.filter((f) => f.type === "file" && regex.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));

    const latest = matched[matched.length - 1];
    if (!latest) return [];
    const file = await ghFetch(`contents/services/${dir}/data/${latest.name}`, pat);
    const raw = JSON.parse(b64Decode(file.content));
    const items = Array.isArray(raw) ? raw : raw.items || [];
    return { items, latestFile: latest.name };
  } catch (e) {
    console.warn(`Failed to load service data for ${serviceName}:`, e);
    return [];
  }
}

function normalizeItems(items, serviceName, serviceConfig) {
  const cfg = serviceConfig || {};
  const idField = SERVICE_ID_FIELDS[serviceName] || "url";
  const renames = cfg.rename || {};
  const displayFields = cfg.display_fields || [];

  return items.map((item) => {
    const norm = { ...item, _service: serviceName };
    norm._item_id = item[idField] || "";

    // Build display name from rename mappings
    const nameField = Object.entries(renames).find(([, v]) => v === "name" || v === "title");
    norm._displayName = nameField ? item[nameField[0]] || "" : item.name || item.title || norm._item_id;

    // Build display fields
    norm._displayFields = displayFields.map((df) => {
      const val = item[df.field];
      if (val == null) return null;
      return { label: df.field, value: `${val}${df.suffix || ""}` };
    }).filter(Boolean);

    return norm;
  });
}

// ── Collections CRUD ─────────────────────────────────────────────────────────

function createCollection(data, name) {
  const id = crypto.randomUUID();
  data.collections[id] = { name, created: new Date().toISOString().slice(0, 10), items: [] };
  return id;
}

function deleteCollection(data, id) {
  delete data.collections[id];
  pruneOrphanedDeps(data);
}

function renameCollection(data, id, name) {
  if (data.collections[id]) data.collections[id].name = name;
}

function addItemToCollection(data, collectionId, service, itemId, note = "") {
  const col = data.collections[collectionId];
  if (!col) return;
  if (col.items.some((i) => i.service === service && i.item_id === itemId)) return;
  col.items.push({ service, item_id: itemId, note });
}

function removeItemFromCollection(data, collectionId, service, itemId) {
  const col = data.collections[collectionId];
  if (!col) return;
  col.items = col.items.filter((i) => !(i.service === service && i.item_id === itemId));
  pruneOrphanedDeps(data);
}

function moveItemInCollection(data, collectionId, service, itemId, direction) {
  const col = data.collections[collectionId];
  if (!col) return;
  const idx = col.items.findIndex((i) => i.service === service && i.item_id === itemId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= col.items.length) return;
  [col.items[idx], col.items[swapIdx]] = [col.items[swapIdx], col.items[idx]];
}

function addDependency(data, itemService, itemId, depService, depId, autoCollectionName) {
  if (!data.dependencies) data.dependencies = [];
  const exists = data.dependencies.some(
    (d) => d.item.service === itemService && d.item.item_id === itemId && d.depends_on.service === depService && d.depends_on.item_id === depId
  );
  if (exists) return;
  data.dependencies.push({
    item: { service: itemService, item_id: itemId },
    depends_on: { service: depService, item_id: depId },
  });

  // Auto-create collection if the two items don't share one
  const allCollections = Object.entries(data.collections);
  const itemCollections = new Set(allCollections.filter(([, c]) => c.items.some((i) => i.service === itemService && i.item_id === itemId)).map(([id]) => id));
  const depCollections = new Set(allCollections.filter(([, c]) => c.items.some((i) => i.service === depService && i.item_id === depId)).map(([id]) => id));
  const shared = [...itemCollections].some((id) => depCollections.has(id));
  if (!shared && autoCollectionName) {
    const newId = createCollection(data, autoCollectionName);
    addItemToCollection(data, newId, itemService, itemId);
    addItemToCollection(data, newId, depService, depId);
  }
}

function removeDependency(data, itemService, itemId, depService, depId) {
  if (!data.dependencies) return;
  data.dependencies = data.dependencies.filter(
    (d) => !(d.item.service === itemService && d.item.item_id === itemId && d.depends_on.service === depService && d.depends_on.item_id === depId)
  );
}

function pruneOrphanedDeps(data) {
  if (!data.dependencies) return;
  const allItems = new Set();
  for (const col of Object.values(data.collections)) {
    for (const i of col.items) allItems.add(itemKey(i.service, i.item_id));
  }
  data.dependencies = data.dependencies.filter(
    (d) => allItems.has(itemKey(d.item.service, d.item.item_id)) && allItems.has(itemKey(d.depends_on.service, d.depends_on.item_id))
  );
}

// ── Diff ─────────────────────────────────────────────────────────────────────

function computeDiff(oldData, newData) {
  const changes = [];
  const oldCols = oldData?.collections || {};
  const newCols = newData?.collections || {};
  const oldDeps = oldData?.dependencies || [];
  const newDeps = newData?.dependencies || [];

  // Collections added/removed/renamed
  const oldIds = new Set(Object.keys(oldCols));
  const newIds = new Set(Object.keys(newCols));

  for (const id of newIds) {
    if (!oldIds.has(id)) {
      changes.push(`+ Created collection "${newCols[id].name}"`);
    }
  }
  for (const id of oldIds) {
    if (!newIds.has(id)) {
      changes.push(`- Deleted collection "${oldCols[id].name}"`);
    }
  }
  for (const id of newIds) {
    if (!oldIds.has(id)) continue;
    const oldCol = oldCols[id];
    const newCol = newCols[id];
    if (oldCol.name !== newCol.name) {
      changes.push(`~ Renamed collection "${oldCol.name}" → "${newCol.name}"`);
    }

    // Items added/removed
    const oldItems = new Set(oldCol.items.map((i) => `${i.service}::${i.item_id}`));
    const newItems = new Set(newCol.items.map((i) => `${i.service}::${i.item_id}`));
    for (const key of newItems) {
      if (!oldItems.has(key)) {
        const [svc, ...rest] = key.split("::");
        changes.push(`+ Added ${svc} item to "${newCol.name}"`);
      }
    }
    for (const key of oldItems) {
      if (!newItems.has(key)) {
        const [svc, ...rest] = key.split("::");
        changes.push(`- Removed ${svc} item from "${newCol.name}"`);
      }
    }

    // Reorders (same items but different order)
    if (oldItems.size === newItems.size && [...newItems].every((k) => oldItems.has(k))) {
      const oldOrder = oldCol.items.map((i) => `${i.service}::${i.item_id}`).join(",");
      const newOrder = newCol.items.map((i) => `${i.service}::${i.item_id}`).join(",");
      if (oldOrder !== newOrder) {
        changes.push(`~ Reordered items in "${newCol.name}"`);
      }
    }
  }

  // Dependencies added/removed
  const depKey = (d) => `${d.item.service}::${d.item.item_id}->${d.depends_on.service}::${d.depends_on.item_id}`;
  const oldDepSet = new Set(oldDeps.map(depKey));
  const newDepSet = new Set(newDeps.map(depKey));

  for (const dep of newDeps) {
    if (!oldDepSet.has(depKey(dep))) {
      changes.push(`+ Added dependency: ${dep.item.service} item → ${dep.depends_on.service} item`);
    }
  }
  for (const dep of oldDeps) {
    if (!newDepSet.has(depKey(dep))) {
      changes.push(`- Removed dependency: ${dep.item.service} item → ${dep.depends_on.service} item`);
    }
  }

  return changes;
}

// ── Save ─────────────────────────────────────────────────────────────────────

async function saveCollections(state) {
  const content = b64Encode(JSON.stringify(state.collections, null, 2));
  const result = await ghFetch("contents/collections.json", state.pat, {
    method: "PUT",
    body: JSON.stringify({
      message: "chore: update collections",
      content,
      sha: state.collectionsSha,
    }),
  });
  state.collectionsSha = result.content.sha;
  state.collectionsSnapshot = JSON.parse(JSON.stringify(state.collections));
  state.dirty = false;
  localStorage.removeItem(DRAFT_KEY);
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function collectionsApp(yaml, cytoscape, cytoscapeFcose) {
  const state = createState();
  const root = document.createElement("div");
  root.className = "collections-app";

  // Register cytoscape-fcose
  if (cytoscapeFcose) cytoscape.use(cytoscapeFcose);

  function markDirty() {
    const changes = computeDiff(state.collectionsSnapshot, state.collections);
    state.dirty = changes.length > 0;
    try {
      if (state.dirty) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state.collections));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch { /* ignore quota errors */ }
  }

  function render() {
    root.innerHTML = "";
    if (!state.pat) {
      root.appendChild(renderSetup());
    } else if (state.loading) {
      root.appendChild(renderLoading());
    } else if (state.error) {
      root.appendChild(renderError());
    } else {
      root.appendChild(renderHeader());
      root.appendChild(renderTabContent());
    }
  }

  // ── Setup screen ───────────────────────────────────────────────────────

  function renderSetup() {
    const div = document.createElement("div");
    div.className = "card";
    div.style.maxWidth = "500px";
    div.style.margin = "2rem auto";
    div.innerHTML = `
      <h2>Media Collections Setup</h2>
      <p style="color:var(--theme-foreground-muted);font-size:0.9rem;">
        Enter a GitHub Personal Access Token with access to <code>ben-tanen/media-count-automation</code>.
        The token needs <strong>contents: read/write</strong> and <strong>actions: write</strong> scopes.
      </p>
      <input type="password" placeholder="ghp_..." style="width:100%;padding:0.5rem;margin:0.5rem 0;border:1px solid var(--theme-foreground-muted);border-radius:4px;background:var(--theme-background);color:var(--theme-foreground);font-family:monospace;" />
      <button style="margin-top:0.5rem;padding:0.5rem 1rem;border-radius:4px;border:none;background:var(--theme-foreground-focus);color:var(--theme-background);cursor:pointer;">Connect</button>
    `;
    const input = div.querySelector("input");
    const btn = div.querySelector("button");
    btn.onclick = () => {
      const val = input.value.trim();
      if (!val) return;
      localStorage.setItem(PAT_KEY, val);
      state.pat = val;
      initLoad();
    };
    input.onkeydown = (e) => { if (e.key === "Enter") btn.click(); };
    return div;
  }

  // ── Loading / Error ────────────────────────────────────────────────────

  function renderLoading() {
    const div = document.createElement("div");
    div.style.cssText = "text-align:center;padding:3rem;color:var(--theme-foreground-muted);";
    div.textContent = "Loading data from GitHub...";
    return div;
  }

  function renderError() {
    const div = document.createElement("div");
    div.className = "card";
    div.style.cssText = "max-width:500px;margin:2rem auto;";
    div.innerHTML = `<h2 style="color:#ef5350;">Error</h2><p>${escHtml(state.error)}</p>
      <button style="padding:0.5rem 1rem;border-radius:4px;border:none;background:var(--theme-foreground-focus);color:var(--theme-background);cursor:pointer;">Retry</button>`;
    div.querySelector("button").onclick = () => { state.error = null; initLoad(); };
    return div;
  }

  // ── Header ─────────────────────────────────────────────────────────────

  function renderHeader() {
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;";

    // Tabs
    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:0.25rem;";
    for (const tab of ["browse", "collections", "scrape", "graph"]) {
      const btn = document.createElement("button");
      btn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      btn.style.cssText = `padding:0.4rem 0.8rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);cursor:pointer;font-size:0.85rem;background:${state.activeTab === tab ? "var(--theme-foreground)" : "var(--theme-background)"};color:${state.activeTab === tab ? "var(--theme-background)" : "var(--theme-foreground)"};`;
      btn.onclick = () => { state.activeTab = tab; render(); };
      tabs.appendChild(btn);
    }
    header.appendChild(tabs);

    // Actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:0.5rem;align-items:center;";

    // Save button
    const saveBtn = document.createElement("button");
    saveBtn.style.cssText = "padding:0.4rem 0.8rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);cursor:pointer;font-size:0.85rem;background:var(--theme-background);color:var(--theme-foreground);position:relative;";
    saveBtn.textContent = "Save";
    if (state.dirty) {
      const dot = document.createElement("span");
      dot.style.cssText = "position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:#ffa726;";
      saveBtn.appendChild(dot);
    }
    saveBtn.onclick = () => {
      const changes = computeDiff(state.collectionsSnapshot, state.collections);
      if (changes.length === 0) { alert("No changes to save."); return; }
      showModal("Save Changes", (content, close) => {
        const list = document.createElement("ul");
        list.style.cssText = "margin:0 0 0.75rem;padding-left:1.2rem;font-size:0.85rem;line-height:1.6;";
        for (const change of changes) {
          const li = document.createElement("li");
          li.textContent = change;
          list.appendChild(li);
        }
        content.appendChild(list);

        const btns = document.createElement("div");
        btns.style.cssText = "display:flex;gap:0.5rem;justify-content:flex-end;";
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText = "padding:0.4rem 0.8rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.85rem;";
        cancelBtn.onclick = close;
        btns.appendChild(cancelBtn);

        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "Save";
        confirmBtn.style.cssText = "padding:0.4rem 0.8rem;border-radius:4px;border:none;background:var(--theme-foreground-focus);color:var(--theme-background);cursor:pointer;font-size:0.85rem;";
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Saving...";
          try {
            await saveCollections(state);
            close();
            render();
          } catch (e) {
            alert(`Save failed: ${e.message}`);
            close();
            render();
          }
        };
        btns.appendChild(confirmBtn);
        content.appendChild(btns);
      });
    };
    actions.appendChild(saveBtn);

    // Settings button
    const settingsBtn = document.createElement("button");
    settingsBtn.textContent = "Settings";
    settingsBtn.style.cssText = "padding:0.4rem 0.8rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);cursor:pointer;font-size:0.85rem;background:var(--theme-background);color:var(--theme-foreground);";
    settingsBtn.onclick = () => {
      if (confirm("Clear stored PAT and disconnect?")) {
        localStorage.removeItem(PAT_KEY);
        state.pat = "";
        render();
      }
    };
    actions.appendChild(settingsBtn);

    header.appendChild(actions);
    return header;
  }

  // ── Tab content router ─────────────────────────────────────────────────

  function renderTabContent() {
    switch (state.activeTab) {
      case "browse": return renderBrowseTab();
      case "collections": return renderCollectionsTab();
      case "scrape": return renderScrapeTab();
      case "graph": return renderGraphTab();
      default: return document.createElement("div");
    }
  }

  // ── Browse tab ─────────────────────────────────────────────────────────

  function renderBrowseTab() {
    const div = document.createElement("div");

    // Service sub-tabs
    const services = Object.keys(state.serviceItems);
    if (services.length === 0) {
      div.textContent = "No service data loaded.";
      return div;
    }
    if (!state.browseService && !services.includes(state.browseService)) {
      state.browseService = "_all";
    }

    const totalCount = services.reduce((sum, svc) => sum + state.serviceItems[svc].length, 0);
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex;gap:0.25rem;margin-bottom:0.75rem;flex-wrap:wrap;";

    // "All" tab
    const allBtn = document.createElement("button");
    allBtn.textContent = `All (${totalCount})`;
    const allActive = state.browseService === "_all";
    allBtn.style.cssText = `padding:0.3rem 0.6rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);cursor:pointer;font-size:0.8rem;background:${allActive ? "var(--theme-foreground)" : "var(--theme-background)"};color:${allActive ? "var(--theme-background)" : "var(--theme-foreground)"};`;
    allBtn.onclick = () => { state.browseService = "_all"; state.browseSearch = ""; state.browseFilter = "all"; render(); };
    tabBar.appendChild(allBtn);

    for (const svc of services) {
      const btn = document.createElement("button");
      const cfg = getServiceConfig(svc);
      const count = state.serviceItems[svc].length;
      btn.textContent = `${cfg.display_name || svc} (${count})`;
      const active = state.browseService === svc;
      btn.style.cssText = `padding:0.3rem 0.6rem;border-radius:4px;border:1px solid ${SERVICE_COLORS[svc] || "#888"};cursor:pointer;font-size:0.8rem;background:${active ? (SERVICE_COLORS[svc] || "#888") : "var(--theme-background)"};color:${active ? "#fff" : "var(--theme-foreground)"};`;
      btn.onclick = () => { state.browseService = svc; state.browseSearch = ""; state.browseFilter = "all"; render(); };
      tabBar.appendChild(btn);
    }
    div.appendChild(tabBar);

    // Search + filter
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;align-items:center;";

    const search = document.createElement("input");
    search.type = "text";
    search.placeholder = "Search items...";
    search.value = state.browseSearch;
    search.style.cssText = "flex:1;min-width:200px;padding:0.4rem;border:1px solid var(--theme-foreground-muted);border-radius:4px;background:var(--theme-background);color:var(--theme-foreground);";
    controls.appendChild(search);

    for (const [val, label] of [["all", "All"], ["in-collection", "In Collection"], ["has-deps", "Has Deps"], ["has-dependents", "Has Dependents"]]) {
      const btn = document.createElement("button");
      btn.textContent = label;
      const active = state.browseFilter === val;
      btn.style.cssText = `padding:0.3rem 0.5rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);cursor:pointer;font-size:0.75rem;background:${active ? "var(--theme-foreground)" : "var(--theme-background)"};color:${active ? "var(--theme-background)" : "var(--theme-foreground)"};`;
      btn.onclick = () => { state.browseFilter = val; render(); };
      controls.appendChild(btn);
    }
    div.appendChild(controls);

    // Item results container (updated in-place to avoid losing focus)
    const count = document.createElement("div");
    count.style.cssText = "font-size:0.8rem;color:var(--theme-foreground-muted);margin-bottom:0.5rem;";
    div.appendChild(count);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-2";
    grid.style.cssText = "gap:0.5rem;";
    div.appendChild(grid);

    function updateItemGrid() {
      let items = state.browseService === "_all"
        ? Object.values(state.serviceItems).flat()
        : (state.serviceItems[state.browseService] || []);
      if (state.browseSearch) {
        const q = state.browseSearch.toLowerCase();
        items = items.filter((i) => displayName(i).toLowerCase().includes(q) || (i._item_id || "").toLowerCase().includes(q));
      }
      if (state.browseFilter !== "all") {
        items = items.filter((i) => {
          const key = itemKey(i._service, i._item_id);
          if (state.browseFilter === "in-collection") return getItemCollections(key).length > 0;
          if (state.browseFilter === "has-deps") return getItemDeps(i._service, i._item_id).length > 0;
          if (state.browseFilter === "has-dependents") return getItemDependents(i._service, i._item_id).length > 0;
          return true;
        });
      }
      count.textContent = `${items.length} item${items.length !== 1 ? "s" : ""}`;
      grid.innerHTML = "";
      for (const item of items.slice(0, 100)) {
        grid.appendChild(renderItemCard(item));
      }
      if (items.length > 100) {
        const more = document.createElement("div");
        more.style.cssText = "grid-column:1/-1;text-align:center;color:var(--theme-foreground-muted);font-size:0.85rem;padding:0.5rem;";
        more.textContent = `Showing 100 of ${items.length} items. Use search to narrow results.`;
        grid.appendChild(more);
      }
    }

    search.oninput = () => { state.browseSearch = search.value; updateItemGrid(); };
    updateItemGrid();
    return div;
  }

  function renderItemCard(item) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "padding:0.6rem;font-size:0.85rem;";

    // Header: name + service color dot
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;";
    const dot = document.createElement("span");
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${SERVICE_COLORS[item._service] || "#888"};flex-shrink:0;`;
    header.appendChild(dot);
    const name = document.createElement("strong");
    name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    name.textContent = displayName(item);
    name.title = displayName(item);
    header.appendChild(name);
    card.appendChild(header);

    // Display fields
    if (item._displayFields && item._displayFields.length > 0) {
      const fields = document.createElement("div");
      fields.style.cssText = "font-size:0.75rem;color:var(--theme-foreground-muted);margin-bottom:0.3rem;";
      fields.textContent = item._displayFields.map((f) => f.value).join(" · ");
      card.appendChild(fields);
    }

    // Collection tags
    const collections = getItemCollections(itemKey(item._service, item._item_id));
    if (collections.length > 0) {
      const tags = document.createElement("div");
      tags.style.cssText = "display:flex;flex-wrap:wrap;gap:0.2rem;margin-bottom:0.3rem;";
      for (const [, col] of collections) {
        const tag = document.createElement("span");
        tag.style.cssText = "font-size:0.65rem;padding:0.1rem 0.35rem;border-radius:3px;background:var(--theme-foreground);color:var(--theme-background);opacity:0.7;";
        tag.textContent = col.name;
        tags.appendChild(tag);
      }
      card.appendChild(tags);
    }

    // Dependency badges (clickable)
    const deps = getItemDeps(item._service, item._item_id);
    const dependents = getItemDependents(item._service, item._item_id);
    if (deps.length > 0 || dependents.length > 0) {
      const badges = document.createElement("div");
      badges.style.cssText = "font-size:0.7rem;color:var(--theme-foreground-muted);margin-bottom:0.3rem;display:flex;gap:0.4rem;flex-wrap:wrap;";
      if (deps.length > 0) {
        const depBadge = document.createElement("span");
        depBadge.textContent = `depends on ${deps.length}`;
        depBadge.style.cssText = "cursor:pointer;text-decoration:underline;text-decoration-style:dotted;";
        depBadge.onclick = (e) => { e.stopPropagation(); showDepsList(item, "deps", depBadge); };
        badges.appendChild(depBadge);
      }
      if (dependents.length > 0) {
        const depBadge = document.createElement("span");
        depBadge.textContent = `${dependents.length} dependents`;
        depBadge.style.cssText = "cursor:pointer;text-decoration:underline;text-decoration-style:dotted;";
        depBadge.onclick = (e) => { e.stopPropagation(); showDepsList(item, "dependents", depBadge); };
        badges.appendChild(depBadge);
      }
      card.appendChild(badges);
    }

    // Actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:0.3rem;margin-top:0.3rem;";

    // Add to collection
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Collection";
    addBtn.style.cssText = "font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:3px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;";
    addBtn.onclick = (e) => {
      e.stopPropagation();
      showCollectionPicker(item, addBtn);
    };
    actions.appendChild(addBtn);

    // Add dependency
    const depBtn = document.createElement("button");
    depBtn.textContent = "+ Dependency";
    depBtn.style.cssText = "font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:3px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;";
    depBtn.onclick = (e) => {
      e.stopPropagation();
      showDependencyPicker(item);
    };
    actions.appendChild(depBtn);

    card.appendChild(actions);
    return card;
  }

  function showDepsList(item, mode, anchor) {
    // Remove any existing popover
    document.querySelectorAll(".deps-list-dropdown").forEach((el) => el.remove());

    const list = mode === "deps"
      ? getItemDeps(item._service, item._item_id)
      : getItemDependents(item._service, item._item_id);

    const dropdown = document.createElement("div");
    dropdown.className = "deps-list-dropdown";
    dropdown.style.cssText = "position:fixed;z-index:1000;background:var(--theme-background);border:1px solid var(--theme-foreground-muted);border-radius:6px;padding:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-height:250px;overflow-y:auto;min-width:220px;";

    const rect = anchor.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;

    const title = document.createElement("div");
    title.style.cssText = "font-size:0.75rem;font-weight:600;margin-bottom:0.3rem;color:var(--theme-foreground);";
    title.textContent = mode === "deps" ? "Depends on:" : "Depended on by:";
    dropdown.appendChild(title);

    for (const dep of list) {
      const other = mode === "deps" ? dep.depends_on : dep.item;
      const resolved = resolveItem(other.service, other.item_id);
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:0.3rem;padding:0.25rem 0;";

      const dot = document.createElement("span");
      dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${SERVICE_COLORS[other.service] || "#888"};flex-shrink:0;`;
      row.appendChild(dot);

      const label = document.createElement("span");
      label.style.cssText = "flex:1;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      label.textContent = resolved ? displayName(resolved) : other.item_id;
      label.title = resolved ? displayName(resolved) : other.item_id;
      row.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "x";
      removeBtn.style.cssText = "padding:0 0.3rem;border-radius:3px;border:1px solid #ef5350;background:var(--theme-background);color:#ef5350;cursor:pointer;font-size:0.7rem;line-height:1.2;";
      removeBtn.onclick = () => {
        if (mode === "deps") {
          removeDependency(state.collections, item._service, item._item_id, other.service, other.item_id);
        } else {
          removeDependency(state.collections, other.service, other.item_id, item._service, item._item_id);
        }
        markDirty();
        dropdown.remove();
        render();
      };
      row.appendChild(removeBtn);
      dropdown.appendChild(row);
    }

    document.body.appendChild(dropdown);

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor) {
        dropdown.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  function showCollectionPicker(item, anchor) {
    // Remove any existing dropdown
    document.querySelectorAll(".collection-picker-dropdown").forEach((el) => el.remove());

    const dropdown = document.createElement("div");
    dropdown.className = "collection-picker-dropdown";
    dropdown.style.cssText = "position:fixed;z-index:1000;background:var(--theme-background);border:1px solid var(--theme-foreground-muted);border-radius:6px;padding:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-height:300px;overflow-y:auto;min-width:200px;";

    // Position near the button
    const rect = anchor.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;

    // Existing collections
    for (const [id, col] of Object.entries(state.collections.collections)) {
      const already = col.items.some((i) => i.service === item._service && i.item_id === item._item_id);
      const opt = document.createElement("div");
      opt.style.cssText = `padding:0.3rem 0.5rem;cursor:pointer;font-size:0.8rem;border-radius:3px;opacity:${already ? "0.4" : "1"};`;
      opt.textContent = already ? `${col.name} (already added)` : col.name;
      opt.onmouseenter = () => { if (!already) opt.style.background = "var(--theme-foreground-faintest)"; };
      opt.onmouseleave = () => { opt.style.background = ""; };
      if (!already) {
        opt.onclick = () => {
          addItemToCollection(state.collections, id, item._service, item._item_id);
          markDirty();
          dropdown.remove();
          render();
        };
      }
      dropdown.appendChild(opt);
    }

    // Divider
    const hr = document.createElement("hr");
    hr.style.cssText = "margin:0.3rem 0;border:none;border-top:1px solid var(--theme-foreground-muted);";
    dropdown.appendChild(hr);

    // New collection
    const newRow = document.createElement("div");
    newRow.style.cssText = "display:flex;gap:0.3rem;";
    const newInput = document.createElement("input");
    newInput.placeholder = "New collection...";
    newInput.style.cssText = "flex:1;padding:0.25rem;font-size:0.8rem;border:1px solid var(--theme-foreground-muted);border-radius:3px;background:var(--theme-background);color:var(--theme-foreground);";
    const newBtn = document.createElement("button");
    newBtn.textContent = "Create";
    newBtn.style.cssText = "font-size:0.75rem;padding:0.2rem 0.4rem;border-radius:3px;border:none;background:var(--theme-foreground-focus);color:var(--theme-background);cursor:pointer;";
    newBtn.onclick = () => {
      const name = newInput.value.trim();
      if (!name) return;
      const id = createCollection(state.collections, name);
      addItemToCollection(state.collections, id, item._service, item._item_id);
      markDirty();
      dropdown.remove();
      render();
    };
    newRow.appendChild(newInput);
    newRow.appendChild(newBtn);
    dropdown.appendChild(newRow);

    document.body.appendChild(dropdown);

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== anchor) {
        dropdown.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  function showDependencyPicker(item) {
    showModal("Add Dependency", (modal, close) => {
      const info = document.createElement("p");
      info.style.cssText = "font-size:0.8rem;color:var(--theme-foreground-muted);margin-bottom:0.5rem;";
      info.textContent = `"${displayName(item)}" depends on:`;
      modal.appendChild(info);

      const search = document.createElement("input");
      search.type = "text";
      search.placeholder = "Search for an item...";
      search.style.cssText = "width:100%;padding:0.4rem;border:1px solid var(--theme-foreground-muted);border-radius:4px;background:var(--theme-background);color:var(--theme-foreground);margin-bottom:0.5rem;";
      modal.appendChild(search);

      const results = document.createElement("div");
      results.style.cssText = "max-height:300px;overflow-y:auto;";
      modal.appendChild(results);

      search.oninput = () => {
        const q = search.value.toLowerCase().trim();
        results.innerHTML = "";
        if (!q) return;
        let matches = [];
        for (const [svc, items] of Object.entries(state.serviceItems)) {
          for (const i of items) {
            if (i._service === item._service && i._item_id === item._item_id) continue;
            if (displayName(i).toLowerCase().includes(q) || (i._item_id || "").toLowerCase().includes(q)) {
              matches.push(i);
            }
          }
        }
        for (const m of matches.slice(0, 20)) {
          const row = document.createElement("div");
          row.style.cssText = "padding:0.3rem;cursor:pointer;font-size:0.8rem;border-radius:3px;display:flex;align-items:center;gap:0.3rem;";
          row.onmouseenter = () => { row.style.background = "var(--theme-foreground-faintest)"; };
          row.onmouseleave = () => { row.style.background = ""; };
          const sdot = document.createElement("span");
          sdot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${SERVICE_COLORS[m._service] || "#888"};`;
          row.appendChild(sdot);
          row.appendChild(document.createTextNode(displayName(m)));
          row.onclick = () => {
            addDependency(state.collections, item._service, item._item_id, m._service, m._item_id, `${displayName(item)} + ${displayName(m)}`);
            markDirty();
            close();
            render();
          };
          results.appendChild(row);
        }
        if (matches.length === 0) {
          results.innerHTML = `<div style="font-size:0.8rem;color:var(--theme-foreground-muted);padding:0.3rem;">No results</div>`;
        }
      };

      setTimeout(() => search.focus(), 50);
    });
  }

  // ── Collections tab ────────────────────────────────────────────────────

  function renderCollectionsTab() {
    const div = document.createElement("div");

    if (state.collectionDetail) {
      return renderCollectionDetail(state.collectionDetail);
    }

    // Header with new collection button
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;";
    const title = document.createElement("h2");
    title.style.cssText = "margin:0;font-size:1.1rem;";
    title.textContent = "Collections";
    header.appendChild(title);

    const newBtn = document.createElement("button");
    newBtn.textContent = "+ New Collection";
    newBtn.style.cssText = "padding:0.4rem 0.8rem;border-radius:4px;border:none;background:var(--theme-foreground-focus);color:var(--theme-background);cursor:pointer;font-size:0.85rem;";
    newBtn.onclick = () => {
      const name = prompt("Collection name:");
      if (!name) return;
      createCollection(state.collections, name);
      markDirty();
      render();
    };
    header.appendChild(newBtn);
    div.appendChild(header);

    // Collection list
    const entries = Object.entries(state.collections.collections).sort((a, b) => a[1].name.localeCompare(b[1].name));
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "text-align:center;padding:2rem;color:var(--theme-foreground-muted);";
      empty.textContent = "No collections yet.";
      div.appendChild(empty);
      return div;
    }

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-3";
    grid.style.cssText = "gap:0.5rem;";
    for (const [id, col] of entries) {
      const card = document.createElement("div");
      card.className = "card";
      card.style.cssText = "padding:0.6rem;cursor:pointer;";
      card.onclick = () => { state.collectionDetail = id; render(); };
      card.onmouseenter = () => { card.style.borderColor = "var(--theme-foreground-focus)"; };
      card.onmouseleave = () => { card.style.borderColor = ""; };

      const name = document.createElement("strong");
      name.textContent = col.name;
      card.appendChild(name);

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:0.75rem;color:var(--theme-foreground-muted);margin-top:0.2rem;";
      meta.textContent = `${col.items.length} items · created ${col.created}`;
      card.appendChild(meta);

      // Service dots
      const svcs = [...new Set(col.items.map((i) => i.service))];
      if (svcs.length > 0) {
        const dots = document.createElement("div");
        dots.style.cssText = "display:flex;gap:0.2rem;margin-top:0.3rem;";
        for (const s of svcs) {
          const d = document.createElement("span");
          d.style.cssText = `width:8px;height:8px;border-radius:50%;background:${SERVICE_COLORS[s] || "#888"};`;
          d.title = s;
          dots.appendChild(d);
        }
        card.appendChild(dots);
      }

      grid.appendChild(card);
    }
    div.appendChild(grid);
    return div;
  }

  function renderCollectionDetail(id) {
    const col = state.collections.collections[id];
    if (!col) { state.collectionDetail = null; return renderCollectionsTab(); }

    const div = document.createElement("div");

    // Back + title + actions
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;";

    const back = document.createElement("button");
    back.textContent = "< Back";
    back.style.cssText = "padding:0.3rem 0.6rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.8rem;";
    back.onclick = () => { state.collectionDetail = null; render(); };
    header.appendChild(back);

    const title = document.createElement("h2");
    title.style.cssText = "margin:0;font-size:1.1rem;flex:1;";
    title.textContent = col.name;
    header.appendChild(title);

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename";
    renameBtn.style.cssText = "padding:0.3rem 0.6rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.8rem;";
    renameBtn.onclick = () => {
      const name = prompt("New name:", col.name);
      if (name && name !== col.name) {
        renameCollection(state.collections, id, name);
        markDirty();
        render();
      }
    };
    header.appendChild(renameBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.cssText = "padding:0.3rem 0.6rem;border-radius:4px;border:1px solid #ef5350;background:var(--theme-background);color:#ef5350;cursor:pointer;font-size:0.8rem;";
    deleteBtn.onclick = () => {
      if (confirm(`Delete collection "${col.name}"?`)) {
        deleteCollection(state.collections, id);
        markDirty();
        state.collectionDetail = null;
        render();
      }
    };
    header.appendChild(deleteBtn);
    div.appendChild(header);

    // Add item search
    const addRow = document.createElement("div");
    addRow.style.cssText = "position:relative;margin-bottom:0.75rem;";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "Search to add an item...";
    addInput.style.cssText = "width:100%;padding:0.4rem;border:1px solid var(--theme-foreground-muted);border-radius:4px;background:var(--theme-background);color:var(--theme-foreground);font-size:0.85rem;";
    addRow.appendChild(addInput);

    const addResults = document.createElement("div");
    addResults.style.cssText = "position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--theme-background);border:1px solid var(--theme-foreground-muted);border-top:none;border-radius:0 0 4px 4px;max-height:250px;overflow-y:auto;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
    addRow.appendChild(addResults);

    addInput.oninput = () => {
      const q = addInput.value.toLowerCase().trim();
      addResults.innerHTML = "";
      if (!q) { addResults.style.display = "none"; return; }
      const existing = new Set(col.items.map((i) => itemKey(i.service, i.item_id)));
      let matches = [];
      for (const items of Object.values(state.serviceItems)) {
        for (const i of items) {
          if (existing.has(itemKey(i._service, i._item_id))) continue;
          if (displayName(i).toLowerCase().includes(q) || (i._item_id || "").toLowerCase().includes(q)) {
            matches.push(i);
          }
        }
      }
      if (matches.length === 0) {
        addResults.style.display = "block";
        addResults.innerHTML = `<div style="padding:0.4rem;font-size:0.8rem;color:var(--theme-foreground-muted);">No results</div>`;
        return;
      }
      addResults.style.display = "block";
      for (const m of matches.slice(0, 20)) {
        const row = document.createElement("div");
        row.style.cssText = "padding:0.35rem 0.5rem;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;gap:0.3rem;";
        row.onmouseenter = () => { row.style.background = "var(--theme-foreground-faintest)"; };
        row.onmouseleave = () => { row.style.background = ""; };
        const dot = document.createElement("span");
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${SERVICE_COLORS[m._service] || "#888"};flex-shrink:0;`;
        row.appendChild(dot);
        const label = document.createElement("span");
        label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        label.textContent = displayName(m);
        row.appendChild(label);
        const svcLabel = document.createElement("span");
        svcLabel.style.cssText = "font-size:0.7rem;color:var(--theme-foreground-muted);margin-left:auto;flex-shrink:0;";
        svcLabel.textContent = m._service;
        row.appendChild(svcLabel);
        row.onclick = () => {
          addItemToCollection(state.collections, id, m._service, m._item_id);
          markDirty();
          addInput.value = "";
          addResults.style.display = "none";
          render();
        };
        addResults.appendChild(row);
      }
    };

    // Close results on outside click
    addInput.onblur = () => { setTimeout(() => { addResults.style.display = "none"; }, 200); };
    addInput.onfocus = () => { if (addInput.value.trim()) addInput.oninput(); };
    div.appendChild(addRow);

    // Items
    if (col.items.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "text-align:center;padding:2rem;color:var(--theme-foreground-muted);";
      empty.textContent = "No items in this collection.";
      div.appendChild(empty);
      return div;
    }

    for (let idx = 0; idx < col.items.length; idx++) {
      const ci = col.items[idx];
      const resolved = resolveItem(ci.service, ci.item_id);
      const row = document.createElement("div");
      row.className = "card";
      row.style.cssText = "padding:0.5rem;margin-bottom:0.4rem;display:flex;align-items:center;gap:0.5rem;";

      // Reorder buttons
      const reorder = document.createElement("div");
      reorder.style.cssText = "display:flex;flex-direction:column;gap:0.1rem;";
      const upBtn = document.createElement("button");
      upBtn.textContent = "^";
      upBtn.style.cssText = "padding:0 0.3rem;border:1px solid var(--theme-foreground-muted);border-radius:2px;background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.7rem;line-height:1;";
      upBtn.disabled = idx === 0;
      upBtn.onclick = () => { moveItemInCollection(state.collections, id, ci.service, ci.item_id, "up"); markDirty(); render(); };
      const downBtn = document.createElement("button");
      downBtn.textContent = "v";
      downBtn.style.cssText = upBtn.style.cssText;
      downBtn.disabled = idx === col.items.length - 1;
      downBtn.onclick = () => { moveItemInCollection(state.collections, id, ci.service, ci.item_id, "down"); markDirty(); render(); };
      reorder.appendChild(upBtn);
      reorder.appendChild(downBtn);
      row.appendChild(reorder);

      // Service dot
      const dot = document.createElement("span");
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${SERVICE_COLORS[ci.service] || "#888"};flex-shrink:0;`;
      row.appendChild(dot);

      // Name + info
      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      const nameEl = document.createElement("div");
      nameEl.style.cssText = "font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      nameEl.textContent = resolved ? displayName(resolved) : ci.item_id;
      info.appendChild(nameEl);

      // Dependencies
      const deps = getItemDeps(ci.service, ci.item_id);
      const dependents = getItemDependents(ci.service, ci.item_id);
      if (deps.length > 0 || dependents.length > 0) {
        const depInfo = document.createElement("div");
        depInfo.style.cssText = "font-size:0.7rem;color:var(--theme-foreground-muted);";
        const parts = [];
        if (deps.length > 0) parts.push(`depends on: ${deps.map((d) => { const r = resolveItem(d.depends_on.service, d.depends_on.item_id); return r ? displayName(r) : d.depends_on.item_id; }).join(", ")}`);
        if (dependents.length > 0) parts.push(`depended on by: ${dependents.map((d) => { const r = resolveItem(d.item.service, d.item.item_id); return r ? displayName(r) : d.item.item_id; }).join(", ")}`);
        depInfo.textContent = parts.join(" | ");
        info.appendChild(depInfo);
      }
      row.appendChild(info);

      // Action buttons
      const rowActions = document.createElement("div");
      rowActions.style.cssText = "display:flex;gap:0.3rem;align-items:center;";

      // Add dependency
      const depBtn = document.createElement("button");
      depBtn.textContent = "+ Dep";
      depBtn.style.cssText = "padding:0.15rem 0.4rem;border-radius:3px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.7rem;";
      depBtn.onclick = () => {
        const resolved = resolveItem(ci.service, ci.item_id);
        const fakeItem = resolved || { _service: ci.service, _item_id: ci.item_id, _displayName: ci.item_id };
        showDependencyPicker(fakeItem);
      };
      rowActions.appendChild(depBtn);

      // Remove button
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "x";
      removeBtn.style.cssText = "padding:0.15rem 0.4rem;border-radius:3px;border:1px solid #ef5350;background:var(--theme-background);color:#ef5350;cursor:pointer;font-size:0.75rem;";
      removeBtn.onclick = () => {
        removeItemFromCollection(state.collections, id, ci.service, ci.item_id);
        markDirty();
        render();
      };
      rowActions.appendChild(removeBtn);

      row.appendChild(rowActions);
      div.appendChild(row);
    }

    return div;
  }

  // ── Scrape tab ─────────────────────────────────────────────────────────

  function renderScrapeTab() {
    const div = document.createElement("div");

    const title = document.createElement("h2");
    title.style.cssText = "margin:0 0 0.75rem;font-size:1.1rem;";
    title.textContent = "On-Demand Scraping";
    div.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "grid grid-cols-3";
    grid.style.cssText = "gap:0.5rem;";

    for (const svc of SCRAPE_SERVICES) {
      const cfg = getServiceConfig(svc);
      const card = document.createElement("div");
      card.className = "card";
      card.style.cssText = "padding:0.6rem;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;";
      const dot = document.createElement("span");
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${SERVICE_COLORS[svc] || "#888"};`;
      header.appendChild(dot);
      const name = document.createElement("strong");
      name.textContent = cfg.display_name || svc;
      header.appendChild(name);
      card.appendChild(header);

      // Last data date
      const serviceData = state.serviceItems[svc];
      const meta = document.createElement("div");
      meta.style.cssText = "font-size:0.75rem;color:var(--theme-foreground-muted);margin-bottom:0.5rem;";
      if (serviceData && serviceData._latestFile) {
        meta.textContent = `Latest data: ${serviceData._latestFile}`;
      } else {
        meta.textContent = "No data files found";
      }
      card.appendChild(meta);

      const btn = document.createElement("button");
      btn.textContent = "Scrape";
      btn.style.cssText = `padding:0.3rem 0.7rem;border-radius:4px;border:none;background:${SERVICE_COLORS[svc] || "#888"};color:#fff;cursor:pointer;font-size:0.8rem;`;
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "Triggering...";
        try {
          await ghFetch("actions/workflows/on-demand-scrape.yml/dispatches", state.pat, {
            method: "POST",
            body: JSON.stringify({ ref: "main", inputs: { service: svc } }),
          });
          btn.textContent = "Triggered!";
          setTimeout(() => pollScrapeRuns(), 2000);
        } catch (e) {
          btn.textContent = "Failed";
          alert(`Scrape trigger failed: ${e.message}`);
        }
        setTimeout(() => { btn.disabled = false; btn.textContent = "Scrape"; }, 3000);
      };
      card.appendChild(btn);
      grid.appendChild(card);
    }
    div.appendChild(grid);

    // Recent runs
    if (state.scrapeRuns.length > 0) {
      const runsTitle = document.createElement("h3");
      runsTitle.style.cssText = "margin:1rem 0 0.5rem;font-size:0.95rem;";
      runsTitle.textContent = "Recent Workflow Runs";
      div.appendChild(runsTitle);

      for (const run of state.scrapeRuns) {
        const row = document.createElement("div");
        row.className = "card";
        row.style.cssText = "padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.8rem;display:flex;gap:0.5rem;align-items:center;";
        const statusColors = { completed: "#66bb6a", in_progress: "#ffa726", queued: "#42a5f5", failure: "#ef5350" };
        const statusDot = document.createElement("span");
        statusDot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${statusColors[run.status] || "#888"};`;
        row.appendChild(statusDot);
        row.appendChild(document.createTextNode(`${run.name || "workflow"} — ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""} — ${new Date(run.created_at).toLocaleString()}`));
        div.appendChild(row);
      }

      const refreshBtn = document.createElement("button");
      refreshBtn.textContent = "Refresh Runs";
      refreshBtn.style.cssText = "margin-top:0.5rem;padding:0.3rem 0.6rem;border-radius:4px;border:1px solid var(--theme-foreground-muted);background:var(--theme-background);color:var(--theme-foreground);cursor:pointer;font-size:0.8rem;";
      refreshBtn.onclick = () => pollScrapeRuns();
      div.appendChild(refreshBtn);
    }

    // Initial poll
    if (state.scrapeRuns.length === 0) pollScrapeRuns();

    return div;
  }

  async function pollScrapeRuns() {
    try {
      const [onDemand, daily] = await Promise.all([
        ghFetch("actions/runs?event=workflow_dispatch&per_page=5", state.pat),
        ghFetch("actions/workflows/daily-scrape.yml/runs?per_page=5", state.pat),
      ]);
      const all = [...(onDemand.workflow_runs || []), ...(daily.workflow_runs || [])];
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      state.scrapeRuns = all.slice(0, 10);
      render();
    } catch {
      // Silently ignore poll errors
    }
  }

  // ── Graph tab ──────────────────────────────────────────────────────────

  function renderGraphTab() {
    const div = document.createElement("div");
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:calc(100vh - 120px);min-height:500px;border:1px solid var(--theme-foreground-muted);border-radius:6px;background:var(--theme-background);";
    div.appendChild(container);

    // Build graph after DOM insertion
    setTimeout(() => {
      if (!container.isConnected) return;

      const elements = [];
      const collections = state.collections.collections;
      const deps = state.collections.dependencies || [];

      // Add collection compound nodes + item nodes
      for (const [colId, col] of Object.entries(collections)) {
        elements.push({
          data: { id: `col-${colId}`, label: col.name },
          classes: "collection",
        });
        for (const ci of col.items) {
          const nodeId = itemKey(ci.service, ci.item_id);
          // Only add node once (item might be in multiple collections)
          if (!elements.some((e) => e.data.id === nodeId)) {
            const resolved = resolveItem(ci.service, ci.item_id);
            elements.push({
              data: {
                id: nodeId,
                label: resolved ? displayName(resolved) : ci.item_id,
                parent: `col-${colId}`,
                service: ci.service,
              },
              classes: "item",
            });
          }
        }
      }

      // Add dependency edges
      for (const dep of deps) {
        const source = itemKey(dep.depends_on.service, dep.depends_on.item_id);
        const target = itemKey(dep.item.service, dep.item.item_id);
        if (elements.some((e) => e.data.id === source) && elements.some((e) => e.data.id === target)) {
          elements.push({
            data: { source, target },
          });
        }
      }

      if (elements.length === 0) {
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--theme-foreground-muted);">No collections or items to display.</div>`;
        return;
      }

      const cy = cytoscape({
        container,
        elements,
        style: [
          {
            selector: ".collection",
            style: {
              shape: "round-rectangle",
              "background-color": "rgba(128,128,128,0.1)",
              "border-width": 1,
              "border-color": "rgba(128,128,128,0.3)",
              label: "data(label)",
              "text-valign": "top",
              "text-halign": "center",
              "font-size": "11px",
              color: "rgba(128,128,128,0.8)",
              "padding": "20px",
            },
          },
          {
            selector: ".item",
            style: {
              shape: "ellipse",
              width: 30,
              height: 30,
              "background-color": (ele) => SERVICE_COLORS[ele.data("service")] || "#888",
              label: "data(label)",
              "font-size": "9px",
              "text-wrap": "ellipsis",
              "text-max-width": "80px",
              color: "rgba(200,200,200,0.9)",
              "text-margin-y": -5,
              "text-valign": "top",
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.5,
              "line-color": "rgba(255,255,255,0.7)",
              "target-arrow-color": "rgba(255,255,255,0.7)",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              "arrow-scale": 0.8,
            },
          },
          {
            selector: ":selected",
            style: {
              "border-width": 2,
              "border-color": "#ffa726",
            },
          },
          {
            selector: ".dimmed",
            style: {
              opacity: 0.15,
            },
          },
          {
            selector: ".highlighted",
            style: {
              opacity: 1,
            },
          },
        ],
        layout: {
          name: "fcose",
          quality: "proof",
          animate: false,
          nodeDimensionsIncludeLabels: true,
          packComponents: true,
          nodeRepulsion: 8000,
          idealEdgeLength: 80,
        },
      });

      // Click to highlight neighborhood
      cy.on("tap", ".item", (evt) => {
        cy.elements().removeClass("highlighted dimmed");
        const node = evt.target;
        const neighborhood = node.neighborhood().add(node);
        const parent = node.parent();
        if (parent.length) neighborhood.merge(parent);
        neighborhood.addClass("highlighted");
        cy.elements().not(neighborhood).addClass("dimmed");
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass("highlighted dimmed");
        }
      });
    }, 100);

    return div;
  }

  // ── Lookup helpers ─────────────────────────────────────────────────────

  function getServiceConfig(serviceName) {
    if (!state.config || !state.config.services) return {};
    return state.config.services[serviceName] || {};
  }

  function getItemCollections(key) {
    const results = [];
    for (const [id, col] of Object.entries(state.collections.collections)) {
      if (col.items.some((i) => itemKey(i.service, i.item_id) === key)) {
        results.push([id, col]);
      }
    }
    return results;
  }

  function getItemDeps(service, itemId) {
    return (state.collections.dependencies || []).filter((d) => d.item.service === service && d.item.item_id === itemId);
  }

  function getItemDependents(service, itemId) {
    return (state.collections.dependencies || []).filter((d) => d.depends_on.service === service && d.depends_on.item_id === itemId);
  }

  function resolveItem(service, itemId) {
    const items = state.serviceItems[service];
    if (!items) return null;
    return items.find((i) => i._item_id === itemId) || null;
  }

  // ── Modal helper ───────────────────────────────────────────────────────

  function showModal(title, buildContent) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    modal.style.cssText = "background:var(--theme-background);border:1px solid var(--theme-foreground-muted);border-radius:8px;padding:1rem;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;";
    const h3 = document.createElement("h3");
    h3.style.cssText = "margin:0;font-size:1rem;";
    h3.textContent = title;
    header.appendChild(h3);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "x";
    closeBtn.style.cssText = "border:none;background:none;color:var(--theme-foreground);cursor:pointer;font-size:1.1rem;";
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const content = document.createElement("div");
    buildContent(content, () => overlay.remove());
    modal.appendChild(content);

    overlay.appendChild(modal);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  // ── Init ───────────────────────────────────────────────────────────────

  async function initLoad() {
    state.loading = true;
    state.error = null;
    render();

    try {
      // Load config and collections in parallel
      const [configB64, colResult] = await Promise.all([
        loadConfig(state.pat),
        loadCollections(state.pat),
      ]);

      state.config = yaml.load(b64Decode(configB64));
      state.collectionsSha = colResult.sha;

      // Restore draft from localStorage if present, otherwise use fetched data
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          state.collections = JSON.parse(draft);
          state.dirty = true;
        } catch {
          state.collections = colResult.data;
        }
      } else {
        state.collections = colResult.data;
      }

      // Ensure structure
      if (!state.collections.collections) state.collections.collections = {};
      if (!state.collections.dependencies) state.collections.dependencies = [];

      // Snapshot (always from remote) for diffing on save
      const remote = colResult.data;
      if (!remote.collections) remote.collections = {};
      if (!remote.dependencies) remote.dependencies = [];
      state.collectionsSnapshot = JSON.parse(JSON.stringify(remote));

      // Load service data in parallel
      const enabledServices = Object.entries(state.config.services || {})
        .filter(([, cfg]) => cfg.enabled !== false)
        .map(([name]) => name);

      const serviceResults = await Promise.all(
        enabledServices.map(async (name) => {
          const cfg = state.config.services[name] || {};
          const result = await loadServiceData(name, cfg, state.pat);
          return { name, result };
        })
      );

      for (const { name, result } of serviceResults) {
        if (result && result.items) {
          const cfg = state.config.services[name] || {};
          const normalized = normalizeItems(result.items, name, cfg);
          normalized._latestFile = result.latestFile;
          state.serviceItems[name] = normalized;
        }
      }

      state.loading = false;
      render();
    } catch (e) {
      state.loading = false;
      state.error = e.message;
      render();
    }
  }

  // Start
  if (state.pat) {
    initLoad();
  } else {
    render();
  }

  return root;
}
