
import os, sys, json
import esprima
import frontmatter

# parse observable config file for page structure
config_file = "observablehq.config.ts"
assert os.path.isfile(config_file)
config = esprima.parseModule(open(config_file).read())

def parseArrayExpression(ae):
    return([{p0.key.name: (p0.value.value if p0.value.type == "Literal" else parseArrayExpression(p0.value)) for p0 in p.properties} for p in ae.elements])
pages_config = parseArrayExpression([c for c in config.body[0].declaration.properties if c.key.name == "pages"][0].value)

# get create flat pages list with depth + frontmatter
root = "./docs/"
pages = []

def parsePage(p, depth = 0):
    file = p["path"] + (".md" if os.path.isfile(root + p["path"] + ".md") else ".markdown")
    assert os.path.isfile(root + file)
    file_frontmatter = frontmatter.loads(open(root + file).read())
    return { **p, **{ "depth": depth, "file": file }, **{k: file_frontmatter[k] for k in file_frontmatter.keys()}}

for p0 in pages_config:
    if p0.get('pages'):
        for p1 in p0.get('pages', []):
            pages.append(parsePage({**p1, **{"section": p0.get('name', "")}}, depth = 1))
    else:
        pages.append(parsePage(p0))

# export
json.dump(pages, sys.stdout)