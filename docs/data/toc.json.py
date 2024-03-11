
import os, sys, json
import frontmatter

root = "./docs/"
toc = []

for subdir, dirs, files in os.walk(root):
    for file in files:
        file_path = os.path.join(subdir, file)
        if os.path.isfile(file_path) and (file_path[-3:] == ".md" or file_path[-9:] == ".markdown"):
            with open(file_path) as file:
                file_frontmatter = frontmatter.loads(file.read())
                toc.append({
                    **{"file": file_path},
                    **{k: file_frontmatter[k] for k in file_frontmatter.keys()}
                })

json.dump(toc, sys.stdout)