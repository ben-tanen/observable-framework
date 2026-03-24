---
title: Media Collections
theme: dashboard
toc: false
---

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
