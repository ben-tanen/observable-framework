---
title: Custom page
theme: [glacier, slate]
toc: true
---

# This is a custom page!!

This is a page I'm making as a test.

Excepteur excepteur velit fugiat nulla esse officia aliquip elit consequat adipisicing exercitation sint cupidatat. Laborum officia adipisicing esse labore incididunt cillum mollit eiusmod minim laborum. Minim sint aliqua exercitation ea aliquip voluptate nisi enim exercitation deserunt enim sunt aliqua. Ipsum consectetur est exercitation ad officia duis nulla aute ea dolor anim cupidatat. Eu consequat adipisicing ipsum enim pariatur.

Velit voluptate ea mollit mollit id anim fugiat aute veniam ex minim. Exercitation dolor magna incididunt mollit. Ullamco elit commodo id cupidatat mollit labore magna. Qui incididunt laboris enim occaecat mollit quis ipsum excepteur voluptate commodo dolor proident non sunt velit. Mollit duis incididunt anim in et dolore irure tempor ullamco dolor eu. Elit ex anim culpa cillum.

```js
const toc = FileAttachment("/data/toc.json").json();
console.log(toc);
```

## Part 1

Excepteur excepteur velit fugiat nulla esse officia aliquip elit consequat adipisicing exercitation sint cupidatat. Laborum officia adipisicing esse labore incididunt cillum mollit eiusmod minim laborum. Minim sint aliqua exercitation ea aliquip voluptate nisi enim exercitation deserunt enim sunt aliqua. Ipsum consectetur est exercitation ad officia duis nulla aute ea dolor anim cupidatat. Eu consequat adipisicing ipsum enim pariatur.

Velit voluptate ea mollit mollit id anim fugiat aute veniam ex minim. Exercitation dolor magna incididunt mollit. Ullamco elit commodo id cupidatat mollit labore magna. Qui incididunt laboris enim occaecat mollit quis ipsum excepteur voluptate commodo dolor proident non sunt velit. Mollit duis incididunt anim in et dolore irure tempor ullamco dolor eu. Elit ex anim culpa cillum.

```js
const launches = FileAttachment("/data/launches.csv").csv({typed: true});
const test = FileAttachment("/data/test.csv").csv({typed: true});
```

## Part 2

United States had **${launches.filter((d) => d.stateId === "US").length.toLocaleString("en-US")}** launches.

```python
def python_code_block(hello):
    print(hello)
```

Testing ${test[0].Name}

Testing again... **${test[m-1].Name}** is *${test[m-1].Age}*

```js echo
const m = view(Inputs.range([1, 3], {label: "Person picker", step: 1}));
```

```md
## test

hello
```

Amet officia excepteur deserunt pariatur pariatur consequat irure. In ullamco ut adipisicing enim ex irure do est non laborum velit. Minim officia proident et reprehenderit velit in laborum ea commodo ipsum ullamco aliqua id ea irure. Ut dolor labore occaecat dolore irure Lorem sunt irure ea aliquip tempor duis aute aute eu. Occaecat dolor officia amet consequat non cillum esse consectetur anim aliqua ut fugiat occaecat. Id ad officia irure. Commodo proident amet aliqua sit dolore elit occaecat sint enim.

Voluptate nulla sunt sunt sit magna aliqua veniam aliqua ex ad id nostrud quis laborum dolor. Commodo quis exercitation voluptate ipsum nisi Lorem esse do esse ex irure. Proident sit aliquip et commodo Lorem laboris aliqua fugiat id duis incididunt fugiat. Minim officia dolor culpa aliquip consequat dolor cillum. Dolore eiusmod esse quis cillum deserunt laborum exercitation velit velit non. Non ipsum eiusmod est. Officia officia occaecat ut ut elit commodo consequat sint sit ex proident labore ex reprehenderit consequat.

Nostrud enim anim aliquip non Lorem ea minim deserunt. Mollit culpa ipsum et fugiat qui minim eu ut anim in eiusmod nulla dolor anim. Quis esse sit elit dolor sit magna ullamco. Irure fugiat eiusmod in commodo culpa do aute nostrud cupidatat aliquip aute proident sit. Velit id sint est adipisicing excepteur qui cillum non laboris consectetur. Voluptate exercitation non labore exercitation. Eu adipisicing cupidatat ea ullamco ea sint dolore sint irure. Commodo eu fugiat cupidatat fugiat excepteur voluptate occaecat nisi culpa.

Tempor elit dolore enim dolore ad aliquip anim nisi Lorem nostrud qui excepteur amet nulla aliquip. Consequat sint eu anim sunt anim deserunt ut amet fugiat deserunt et consequat amet. Consequat cupidatat officia cillum elit labore ad. Exercitation fugiat sint exercitation tempor fugiat elit cupidatat veniam ad.

