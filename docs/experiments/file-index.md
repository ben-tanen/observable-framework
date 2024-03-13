---
title: File Index Test
theme: [deep-space]
toc: true
description: this page is a test of creating and using a dynamically generating file index
---

```js
const toc = FileAttachment("/data/toc.json").json();
```

#### List of pages:

```js
display(html`<li><a href="/">Home</a>`)
for (let i = 0; i < toc.length; i++) {
    if (!toc[i].root) {
        const name = toc[i].section ? `${toc[i].section} ~ ${toc[i].title}` : toc[i].title,
              path = toc[i].file.replace(".md", "").replace(".markdown", "")
        display(html`<li><a href="${path}">${name}</a>: ${toc[i].description}</li`);
    }
}
```