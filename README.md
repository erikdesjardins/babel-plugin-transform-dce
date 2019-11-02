# babel-plugin-transform-dead-code-elimination


Babel 6 fork of babel-plugin-dead-code-elimination.

Incorporates fixes from [achicu/babel-plugin-dead-code-elimination](https://github.com/achicu/babel-plugin-dead-code-elimination).

## Installation

`npm install --save-dev babel-plugin-transform-dead-code-elimination`

## Usage

**.babelrc:**

```json
{
  "plugins": [
    "transform-dead-code-elimination"
  ]
}
```

Or, with options (note: `experimentalInlining` will almost definitely break your code):

```json
{
  "plugins": [
    ["transform-dead-code-elimination", {
      "experimentalInlining": true
    }]
  ]
}
```
