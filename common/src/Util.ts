import * as path from 'path'
import * as fs from 'fs'

export function ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

export function recursivePathSearch(resourcesPath: string, searcher: { [Symbol.search](string: string): number; }): string {
    if (!fs.existsSync(resourcesPath) || !fs.lstatSync(resourcesPath).isDirectory())
        return null;

    let elementsInFolder = fs.readdirSync(resourcesPath, {withFileTypes: true});
    for(let i = 0; i < elementsInFolder.length; i++)
    {
        let element: fs.Dirent = elementsInFolder[i];
        let fullElementPath =  path.resolve(resourcesPath, element.name);
        if(fs.lstatSync(fullElementPath).isDirectory())
            fullElementPath = recursivePathSearch(fullElementPath, searcher);
        else if(fullElementPath.split(path.sep)[fullElementPath.split(path.sep).length -1].search(searcher) != -1) //TODO shouldn't this be /lsp*.jar/ ?
            return fullElementPath;
    }
    return null;
}

export function writeToLog(path: string, msg: string) {
    let logStream = fs.createWriteStream(path, { flags: 'w' });
    logStream.write(msg);
    logStream.close();
}

// MIT Licensed code from: https://github.com/georgewfraser/vscode-javac
export function findJavaExecutable(binname: string) {
    if (process.platform === 'win32')
        binname = binname + '.exe';

    // First search each JAVA_HOME bin folder
    if (process.env['JAVA_HOME']) {
        let workspaces = process.env['JAVA_HOME'].split(path.delimiter);
        for (let i = 0; i < workspaces.length; i++) {
            let binpath = path.join(workspaces[i], 'bin', binname);
            if (fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Then search PATH parts
    if (process.env['PATH']) {
        let pathparts = process.env['PATH'].split(path.delimiter);
        for (let i = 0; i < pathparts.length; i++) {
            let binpath = path.join(pathparts[i], binname);
            if (fs.existsSync(binpath)) {
                return binpath;
            }
        }
    }

    // Else return the binary name directly (this will likely always fail downstream) 
    return null;
}
