var fs = require("fs-extra");
var path = require('path');

var scriptPath = process.cwd();

var folderName = process.argv[2];

var targetResourcePath = path.join(scriptPath,'..',folderName,'resources');

var localResourcePath = path.join(scriptPath, 'resources');

var targetMediaPath = path.join(scriptPath,'..',folderName,'resources');

var localMediaPath = path.join(scriptPath, 'resources');

var patternMatchForItemsToDelete = [/vdmj.*jar/i, /lsp.*jar/i, /annotations.*jar/i];

recursivePathDeletion(targetResourcePath, patternMatchForItemsToDelete);

recursivePathDeletion(targetResourcePath, patternMatchForItemsToDelete);

fs.copy(localResourcePath, targetResourcePath, function (err) {
  if (err) return console.error(err)
    console.log('successfully copied resources!');
});

fs.copy(localMediaPath, targetMediaPath, function (err) {
  if (err) return console.error(err)
    console.log('successfully copied media!');
});

function recursivePathDeletion(directoryPath, searchers) {
  if (!fs.existsSync(directoryPath) || !fs.lstatSync(directoryPath).isDirectory())
      return;

  let elementsInFolder = fs.readdirSync(directoryPath, {withFileTypes: true});
  for(let i = 0; i < elementsInFolder.length; i++)
  {
      let element = elementsInFolder[i];
      let fullElementPath =  path.resolve(directoryPath, element.name);
      if(fs.lstatSync(fullElementPath).isDirectory())
        recursivePathDeletion(fullElementPath, searchers);
      else if(searchers.some(searcher => fullElementPath.split(path.sep)[fullElementPath.split(path.sep).length -1].search(searcher) != -1))
      {
        fs.unlinkSync(fullElementPath);
        console.log('REMOVED: ' + element.name + " from " + directoryPath);
      }

  }
  return;
}



