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

function isObject(value: unknown): value is Object {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeDeep(target: Object, ...sources: Object[]): Object {
    if (!sources.length) {
        return target;
    }
    const source = sources.shift();

    for (const key in source) {
        if (isObject(source[key])) {
            if (!target[key]) {
                Object.assign(target, { [key]: {} });
            }

            mergeDeep(target[key], source[key]);
        } else {
            Object.assign(target, { [key]: source[key] });
        }
    }

    return mergeDeep(target, ...sources);
}
