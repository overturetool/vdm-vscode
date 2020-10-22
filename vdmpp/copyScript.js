var fs = require("fs-extra");
var path = require('path');

var scriptPath = process.cwd();

fs.copy(path.join(scriptPath,'..','common','resources'), path.join(scriptPath, 'resources'), function (err) {
  if (err) return console.error(err)
    console.log('success!')
});