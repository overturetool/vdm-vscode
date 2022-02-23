"use strict";
exports.__esModule = true;
var fs = require("fs");
var process = require("process");
var withWebpack;
if (process.argv.includes("false"))
    withWebpack = false;
else
    withWebpack = true;
// adjust .vscodeignore
var fileVscodeignore = "./.vscodeignore";
var vscodeignore = fs.readFileSync(fileVscodeignore, "utf-8");
if (withWebpack) {
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withWebpack\s*)/gm, function (s) {
        return s.replace(/# /gm, "");
    });
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withoutWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withoutWebpack\s*)/gm, function (s) {
        var a = s.split(/\s/);
        var b = a.filter(function (s) { return s.match(/[\s*|\r|\n|#]/) == undefined && s != ""; });
        var c = b.map(function (s) { return (s.startsWith("#") ? s : "# " + s); });
        var d = c.join("\n") + "\n";
        // console.info(a);
        // console.info(b);
        // console.info(c);
        // console.info(d);
        return d;
    });
}
else {
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withoutWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withoutWebpack\s*)/gm, function (s) {
        return s.replace(/# /gm, "");
    });
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withWebpack\s*)/gm, function (s) {
        var a = s.split(/\s/);
        var b = a.filter(function (s) { return s.match(/[\s*|\r|\n|#]/) == undefined && s != ""; });
        var c = b.map(function (s) { return (s.startsWith("#") ? s : "# " + s); });
        var d = c.join("\n") + "\n";
        // console.info(a);
        // console.info(b);
        // console.info(c);
        // console.info(d);
        return d;
    });
}
fs.writeFileSync(fileVscodeignore, vscodeignore);
// adjust package.json
var filePkgJson = "./package.json";
var pkgJson = JSON.parse(fs.readFileSync(filePkgJson, "utf-8"));
if (withWebpack && "withWebpack" in pkgJson) {
    for (var k in pkgJson.withWebpack) {
        pkgJson[k] = pkgJson.withWebpack[k];
    }
}
if (!withWebpack && "withoutWebpack" in pkgJson) {
    for (var k in pkgJson.withoutWebpack) {
        pkgJson[k] = pkgJson.withoutWebpack[k];
    }
}
fs.writeFileSync(filePkgJson, JSON.stringify(pkgJson, undefined, 4));
