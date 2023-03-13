let data = require('./jars.json');
const execSync = require('child_process').execSync;
const txml = require('txml');
const fs = require("fs");

var args = process.argv.slice(2);

if (args.length < 1) {
    throw new Error("repository argument required");
}

let repo = args.find((a) => a.includes("repo=")).slice("repo=".length);
let groupId = args.find((a) => a.includes("groupId=")).slice("groupId=".length);
let artifactId = args.find((a) => a.includes("artifactId=")).slice("artifactId=".length);
let version = args.find((a) => a.includes("version=")).slice("version=".length);

let jarInfo = data.jars.find((j) => j.repository === repo);

if (!jarInfo) {
    throw new Error("Repository is not allowed");
}

if (jarInfo.classifier && jarInfo.classifier.includes('-')) {
    // Workaround for GitHub Packages bug: Maven classifiers with dashes gets split in classifer & extension. https://github.com/orgs/community/discussions/49682

    const groupIdUrl = groupId.replaceAll('.', '/');
    const artifactIdUrl = artifactId.replaceAll('.', '/');

    // Fetch metadata for this version of the package.
    let url = `https://maven.pkg.github.com/${jarInfo.repository}/${groupIdUrl}/${artifactIdUrl}/${version}/maven-metadata.xml`;
    fetch(url, {headers: {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`}})
        .then(response => response.text())
        .then(str => txml.parse(str))
        .then((data) => {
            // Parse XML to find timestamp & buildNumber.
            let timestamp = txml.filter(data, (node) => node.tagName.toLowerCase() === 'timestamp')[0].children[0];
            let buildNumber = txml.filter(data, (node) => node.tagName.toLowerCase() === 'buildnumber')[0].children[0];

            let versionNoSnap = version.replace('-SNAPSHOT', '');

            // https://maven.pkg.github.com/glennlaursen/vdm-plantuml-plugin/dk/au/ece/vdmj/uml/0.1.1-SNAPSHOT/uml-0.1.1-20230308.153238-1-jar-with-dependencies.jar
            let urlToPackage = `https://maven.pkg.github.com/${jarInfo.repository}/${groupIdUrl}/${artifactIdUrl}/${version}/${artifactIdUrl}-${versionNoSnap}-${timestamp}-${buildNumber}-${jarInfo.classifier}.jar`;

            fetch(urlToPackage, {headers: {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`}})
                .then((response) => response.blob())
                .then((blob) => {
                    blob.arrayBuffer()
                        .then((ab) => fs.writeFileSync(`${jarInfo.dest_dir}/${artifactId}-${version}-${jarInfo.classifier}.jar`, Buffer.from(ab)));
                });
        });
} else {
    const output = execSync(`mvn dependency:get \
    -Dartifact=${groupId}:${artifactId}:${version} \
    -DremoteRepositories=github::default::https://maven.pkg.github.com/${jarInfo.repository} \
    -Ddest=${jarInfo.dest_dir}/${artifactId}-${version}.jar`, {encoding: 'utf-8'});
    console.log(output);
}