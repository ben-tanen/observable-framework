---
title: Media Collections
theme: dashboard
toc: false
---

<script>
  // start with the sidebar closed on this page unless the user has explicitly toggled it this session
  if (sessionStorage.getItem("observablehq-sidebar") == null) {
    const toggle = document.querySelector("#observablehq-sidebar-toggle");
    if (toggle) toggle.indeterminate = false, toggle.checked = false;
  }
</script>

<style>
.collections-app {
  min-height: 400px;
}
.collections-app .card {
  transition: border-color 0.15s;
}
.collections-app input:focus,
.collections-app button:focus {
  outline: 2px solid var(--theme-foreground-focus);
  outline-offset: 1px;
}
</style>

```js
import {collectionsApp} from "./components/collections-app.js";
import yaml from "npm:js-yaml";
import cytoscape from "npm:cytoscape";
import cytoscapeFcose from "npm:cytoscape-fcose";
```

```js
display(collectionsApp(yaml, cytoscape, cytoscapeFcose));
```
