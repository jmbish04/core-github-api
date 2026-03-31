const JSON5 = require('json5');
try {
  JSON5.parse('{ "a": [1, 2 v] }');
} catch (e) {
  console.log(e.toString());
}
