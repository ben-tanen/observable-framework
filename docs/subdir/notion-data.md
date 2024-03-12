---
title: Notion Test
theme: [deep-space, wide]
toc: true
description: this page is a test of using Notion data
---

# This is a custom page V3!!

This page will render data on the ${vinyl.length} records I currently have.

```js
const vinyl = FileAttachment("../data/notion-vinyl.json").json({typed: true});
console.log(vinyl)
```


