import path = require("path");
import { readFile } from "fs-extra";
import { Uri } from "vscode";
import { z } from "zod";
import { quickcheckConfigSchema } from "./Schemas";

export type QuickCheckConfig = z.infer<typeof quickcheckConfigSchema>;

export interface QuickCheckRequestConfig extends QuickCheckConfig {
    obligations?: number[];
    workDoneToken?: string;
}

export async function readOptionalConfiguration<T>(wsFolder: Uri, filename: string, schema: z.ZodType<T>, callback: (config: T) => void) {
    const configPath = path.resolve(wsFolder.fsPath, ".vscode", filename);
    let callbackValue: T | null = null;
    try {
        const validJson = JSON.parse(await readFile(configPath, { encoding: "utf8" }));
        callbackValue = schema.parse(validJson);
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
