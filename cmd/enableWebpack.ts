import * as fs from "fs";
import * as process from "process";

let withWebpack: boolean;
if (process.argv.includes("false")) withWebpack = false;
else withWebpack = true;

// adjust .vscodeignore
const fileVscodeignore = "./.vscodeignore";

let vscodeignore = fs.readFileSync(fileVscodeignore, "utf-8");

if (withWebpack) {
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withWebpack\s*)/gm, (s) => {
        return s.replace(/# /gm, "");
    });
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withoutWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withoutWebpack\s*)/gm, (s) => {
        let a = s.split(/\s/);
        let b = a.filter((s) => s.match(/[\s*|\r|\n|#]/) == undefined && s != "");
        let c = b.map((s) => (s.startsWith("#") ? s : "# " + s));
        let d = c.join("\n") + "\n";

        // console.info(a);
        // console.info(b);
        // console.info(c);
        // console.info(d);
        return d;
    });
} else {
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withoutWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withoutWebpack\s*)/gm, (s) => {
        return s.replace(/# /gm, "");
    });
    vscodeignore = vscodeignore.replace(/(?<=^#\s*withWebpack:[\s*|\r|\n])([\S\s]*?)(?=^\s*#\s*\/withWebpack\s*)/gm, (s) => {
        let a = s.split(/\s/);
        let b = a.filter((s) => s.match(/[\s*|\r|\n|#]/) == undefined && s != "");
        let c = b.map((s) => (s.startsWith("#") ? s : "# " + s));
        let d = c.join("\n") + "\n";

        // console.info(a);
        // console.info(b);
        // console.info(c);
        // console.info(d);
        return d;
    });
}
fs.writeFileSync(fileVscodeignore, vscodeignore);

// adjust package.json
const filePkgJson = "./package.json";
interface PkgJson {
    withWebpack?: {
        [k: string]: any;
    };
    [k: string]: any;
}

const pkgJson = JSON.parse(fs.readFileSync(filePkgJson, "utf-8")) as PkgJson;
if (withWebpack && "withWebpack" in pkgJson) {
    for (const k in pkgJson.withWebpack) {
        pkgJson[k] = pkgJson.withWebpack[k];
    }
}
if (!withWebpack && "withoutWebpack" in pkgJson) {
    for (const k in pkgJson.withoutWebpack) {
        pkgJson[k] = pkgJson.withoutWebpack[k];
    }
}
fs.writeFileSync(filePkgJson, JSON.stringify(pkgJson, undefined, 4));
