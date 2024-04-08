---
title: Github Pages Tutorial
description: this page is a walkthrough of how I hosted this all using Github Pages
---

# How to: Hosting an Observable Framework app using Github Pages

When Observable announced Framework, I was intrigued because they were highlighting it as something that could be [hosted *anywhere*](https://observablehq.com/framework/getting-started#self-hosting)! I like Observable's tools and offerings, but once they started locking down their tools for paid subscribers, I largely moved away from it. But as of April 2024, Observable Framework can indeed be used entirely for free, though they certainly encourage you to host your app [via Observable directly](https://observablehq.com/framework/getting-started#3.-publish). 

In an effort to help out all the other people too poor to shell out [the $300/mo for Observable Pro](https://observablehq.com/pricing), here's a quick walkthrough of how I created and hosted [this very application on Github Pages](https://github.com/ben-tanen/observable-framework), entirely for free!

---

### Step 1: Create your Observable Framework app

This is fairly self-explanatory. Follow Observable's start up directions and then build whatever you want!

### Step 2: Create the Github Action workflow for publishing your app

Since a Observable Framework app can be built and then hosted anywhere, we'll just need to create a Github Action workflow that will install the necessary node/npm dependencies, build the project, and then upload it to GH Pages.

I found [this post from Bill Mill](https://notes.billmill.org/programming/observable_framework/github_workflow_for_publishing_an_observable_framework.html) (thanks Bill!) outlining a good starting `publish.yml` workflow, which includes the following:

```yaml
name: Publish
on:
  workflow_dispatch:
  push:
    branches: ["master"]
permissions:
  contents: write
jobs:
  build:
    concurrency: ci-${{ github.ref }} # Recommended if you intend to make multiple deployments in quick succession.
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

You'll want to create this `publish.yml` file within [the `.github/workflows` directory](https://github.com/ben-tanen/observable-framework/tree/master/.github/workflows) of your app. If done correctly, Github will automatically recognize the workflow and you should see it show up under [your project's "Actions" menu](https://github.com/ben-tanen/observable-framework/actions).

### Step 3: Modify the Github Action workflow as needed

Bill's initial "Publish" workflow did about 90% of the lift for my app, but I wanted and needed a few more things, including:

1. **Installing Python (plus all necessary dependencies) for my Python-based data loaders**: I accomplished this by adding these additional steps to my Publish workflow, between installing the npm dependencies and the "Build" step. Note that I created [a python requirements file `python-reqs.txt`](https://github.com/ben-tanen/observable-framework/blob/master/env/python-reqs.txt) in a new `env/` directory.

```yaml
- name: Setup Python
  uses: actions/setup-python@v5
  with:
    python-version: 3.9

- name: Install Python requirements
  run: |
    python -m pip install --upgrade pip
    pip install -r env/python-reqs.txt
```
2. **Creating the necessary service key files for authenticating with my APIs**: I wanted to pull data from Google Sheets, Notion, and other sources via their APIs, so I first added these API keys as [secrets accessible by Github Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) and then added the following steps (before the "Build" step) to actually create the necessary auth files. I'm no security expert so please let me know if this is not in fact kosher!

```yaml
- name: Retrieve Google SA file
  env:
    GSHEET_SA_BASE64: ${{ secrets.GSHEET_SA_BASE64 }}
  run: |
    echo $GSHEET_SA_BASE64 | base64 --decode > gsheet-sa.json

- name: Retrieve other secret keys
  env:
    SECRET_KEYS: ${{ secrets.SECRET_KEYS }}
  run: |
    echo $SECRET_KEYS > env/secrets.json
```

3. **Enabled the Publish workflow to auto-run every 12 hours**: Bill's example `publish.yml` sets up the workflow to run on (1) the workflow's manual dispatch [when you click "Run workflow" from within Github] and (2) pushing to the main/master branch. Since I was planning on using live, updating data from Google Sheets and Notion, I figured it would be beneficial to have the app auto-refresh and build periodically to reflect updated data. To do this, I simply added a cron-based schedule to specify when the workflow should run.

```yaml
schedule:
  - cron: "0 */12 * * *"
```

---

And that's how I hosted my Observable Framework app on Github! You can check out the latest version of the Publish workflow [here](https://github.com/ben-tanen/observable-framework/blob/master/.github/workflows/publish.yml) and the rest of the app's code in [the main repo](https://github.com/ben-tanen/observable-framework/).

Overall, Observable does make it fairly easy, so this page is likely not going to be necessary for most people, but I figured if I could pass along the good favor like Bill did in his post, why not!

If y'all have created your own Observable Framework apps and have any additional tips + tricks to share on hosting and/or publishing workflows, let me know!