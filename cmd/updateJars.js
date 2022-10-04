"use strict";
exports.__esModule = true;
var fs = require("fs");
var download = require("mvn-artifact-download");
var parser = require("mvn-artifact-name-parser");
const { abort } = require("process");

// Check VDMJ version 
var filePkgJson = "./package.json";
var pkgJson = JSON.parse(fs.readFileSync(filePkgJson, "utf-8"));
if ("engines" in pkgJson && "vdmj" in pkgJson["engines"]) {
    console.log("Using VDMJ version: " + pkgJson["engines"]["vdmj"]);
}else
{
    console.error("Cannot find VDMJ version");
    abort;
}

// Prepare version varibales vs=9.9.9 and ss=-SNAPSHOT or ""
var strs = pkgJson["engines"]["vdmj"].split("-");
var vs = strs[0];
var ss = (strs.length > 1) ? "-" + strs[1] : "";

// SNAPSHOTS are fetched from overture artifactory
var alternativeRepo = null;
if(parser.default("x:y:"+vs+ss).isSnapShot){
    alternativeRepo = "https://overture.au.dk/artifactory/vdmj/";
}

// Get jars for standard VDMJ
var vdmjArtifactIds = ["annotations", "lsp", "vdmj"];

vdmjArtifactIds.forEach(async function (aid) {
    await download.default(
        parser.default("dk.au.ece.vdmj:"+aid+":"+vs+ss),
        "/tmp/resources/jars/vdmj",
        alternativeRepo
    );
});

vdmjArtifactIds.forEach(async function (aid) {
    await download.default(
        parser.default("dk.au.ece.vdmj:"+aid+":"+vs+"-P"+ss),
        "/tmp/resources/jars/vdmj_hp",
        alternativeRepo
    );
});

// Get jars for stdlib
download.default(
    parser.default("dk.au.ece.vdmj:stdlib:"+vs+ss),
    "/tmp/resources/jars/vdmj/libs",
    alternativeRepo
);

download.default(
    parser.default("dk.au.ece.vdmj:stdlib:"+vs+"-P"+ss),
    "/tmp/resources/jars/vdmj_hp/libs",
    alternativeRepo
);

// Get jars for plugins 
// TODO

