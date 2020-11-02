var fs = require("fs-extra");
var path = require('path');

var scriptPath = process.cwd();

var folderName = process.argv[2];

fs.copy(path.join(scriptPath, 'resources'), path.join(scriptPath,'..',folderName,'resources'), function (err) {
  if (err) return console.error(err)
    console.log('successfully copied resources!')
});

fs.copy(path.join(scriptPath, 'media'), path.join(scriptPath,'..',folderName,'media'), function (err) {
  if (err) return console.error(err)
    console.log('successfully copied media!')
});