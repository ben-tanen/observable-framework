---
title: Home
toc: false
description: hello
---

<style>

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--sans-serif);
  margin: 4rem 0 8rem;
  text-wrap: balance;
  text-align: center;
}

.hero h1 {
  margin: 2rem 0;
  max-width: none;
  font-size: 14vw;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(30deg, var(--theme-foreground-focus), currentColor);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero h2 {
  margin: 0;
  max-width: 34em;
  font-size: 20px;
  font-style: initial;
  font-weight: 500;
  line-height: 1.5;
  color: var(--theme-foreground-muted);
}

ul#page-index-list {
    margin-top: -10px;
    padding-left: 0;
}

ul#page-index-list li {
    text-align: left;
}

@media (min-width: 640px) {
  .hero h1 {
    font-size: 90px;
  }
}

</style>

<div class="hero">
    <h1>Ben tries Observable Framework!</h1>
    <h2>Welcome to my collection of random experiments, dashboards, and other pages built using <a href="https://observablehq.com/framework/">Observable Framework</a>.</h2>
    <br />
    <p>In an ongoing effort to always be trying new tools (and never quite actually building anything with them!), I decided to spin up this site (app? page? thing?) as a way for me to learn more about Observable's new Framework dashboarding tool.</p>
    <p>Feel free to poke around and see what all sorts of wacky things I've tried making here, including:
        <ul id="page-index-list">
            <li><strong>Home</strong>: this page you're currently reading!</li>
        </ul>
    </p>
    <h5>P.S. if you're interested in how I auto-generated this list of pages, check out <a href="/experiments/file-index/">the "Page Index Test" page</a>!</h5>
</div>

```js
const toc = FileAttachment("data/toc.json").json();
```

```js
for (let i = 0; i < toc.length; i++) {
    if (!toc[i].root) {
        const name = toc[i].section ? `${toc[i].section} ~ ${toc[i].title}` : toc[i].title,
              path = toc[i].file.replace(".md", "").replace(".markdown", "").substring(1);
        let ul = document.getElementById("page-index-list"),
            li = document.createElement("li"),
            a = document.createElement("a");
        a.href = path;
        a.textContent = name;
        a.style.fontWeight = "bold";
        li.appendChild(a);
        if (toc[i].description) {
            li.appendChild(document.createTextNode(`: ${toc[i].description}`));
        }
        ul.appendChild(li);
    }
}
```

