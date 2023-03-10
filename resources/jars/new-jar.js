let data = require('./jars.json');
const execSync = require('child_process').execSync;

var args = process.argv.slice(2);

if (args.length < 1) throw new Error("repository argument required");

let repo = args.find((a) => a.includes("repo=")).slice("repo=".length)
let groupId = args.find((a) => a.includes("groupId=")).slice("groupId=".length)
let artifactId = args.find((a) => a.includes("artifactId=")).slice("artifactId=".length)
let version = args.find((a) => a.includes("version=")).slice("version=".length)

let JarInfo = data.jars.find((j) => j.repository === repo)

if (!JarInfo) throw new Error("Repository is not allowed");

const output = execSync(`mvn dependency:copy \
    -Dartifact=${groupId}:${artifactId}:${version} \
    -DoutputDirectory=${JarInfo.dest_dir} \
    -Dmdep.useBaseVersion=true \
    -Dmdep.overIfNewer=true \
    -Dmdep.overWriteSnapshots=true \
    -Dmdep.overWriteReleases=true`, { encoding: 'utf-8' })
console.log(output);