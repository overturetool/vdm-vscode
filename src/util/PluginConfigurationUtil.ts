import path = require("path");
import { readFile } from "fs-extra";
import { Uri } from "vscode";

export async function readOptionalConfiguration(wsFolder: Uri, filename: string, callback: (config: any) => void) {
    const configPath = path.resolve(wsFolder.fsPath, ".vscode", filename);
    let callbackValue: string | null = null;
    try {
        callbackValue = JSON.parse(await readFile(configPath, { encoding: "utf8" }));
    } catch (err) {}

    callback(callbackValue);
}
