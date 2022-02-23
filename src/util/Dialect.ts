// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder, RelativePattern, workspace, Uri, window } from "vscode";

export const dialects: string[] = ["vdmsl", "vdmpp", "vdmrt"];
export const dialectsPretty: string[] = ["VDM-SL", "VDM++", "VDM-RT"];

export const dialectExtensions: Map<string, string[]> = new Map([
    ["vdmsl", ["vdmsl", "vsl"]],
    ["vdmpp", ["vdmpp", "vpp"]],
    ["vdmrt", ["vdmrt", "vrt"]],
]);
export const dialectAlias: Map<string, string[]> = new Map([
    ["vdmsl", [...dialectExtensions.get("vdmsl"), "vdm-sl", "sl"]],
    ["vdmpp", [...dialectExtensions.get("vdmpp"), "vdm-pp", "pp", "vdm++"]],
    ["vdmrt", [...dialectExtensions.get("vdmrt"), "vdm-rt", "rt"]],
]);

export async function guessDialect(wsFolder: WorkspaceFolder): Promise<string> {
    return new Promise(async (resolve, reject) => {
        for await (const [dialect, extensions] of dialectExtensions) {
            let isThis = false;
            for await (const extension of extensions) {
                const pattern = new RelativePattern(wsFolder.uri.path, `*.${extension}`);
                const res = await workspace.findFiles(pattern, null, 1);
                if (res.length > 0) {
                    isThis = true;
                    break;
                }
            }

            if (isThis) return resolve(dialect);
        }

        return reject(`Could not guess dialect for workspace folder: ${wsFolder.name}`);
    });
}

export async function guessDialectFromUri(uri: Uri): Promise<string> {
    return new Promise((resolve, reject) => {
        const wsFolder = workspace.getWorkspaceFolder(uri);
        if (!wsFolder) return reject(`Could not find workspace folder for path: ${uri.path}`);

        guessDialect(wsFolder).then(
            (result) => resolve(result),
            (error) => reject(error)
        );
    });
}

export function getDialectFromAlias(input: string) {
    const inputSmall = input.toLowerCase();
    let result: string;
    dialectAlias.forEach((aliases, dialect) => {
        for (const alias of aliases) {
            if (inputSmall == alias) {
                result = dialect;
                return;
            }
        }
    });

    if (!result) throw new Error("Input alias does not match any known alias");
    else return result;
}

export function getDialectFromPretty(input: string): string {
    for (let i = 0; i < dialectsPretty.length; ++i) {
        if (input == dialectsPretty[i]) return dialects[i];
    }
}

export function isVDMFile(filePath: string) {
    let result: string;
    dialectExtensions.forEach((extensions, dialect) => {
        for (const extension of extensions) {
            if (filePath.endsWith(`.${extension}`)) {
                result = dialect;
                return;
            }
        }
    });

    return result != undefined;
}

export async function pickDialect(): Promise<string> {
    return new Promise(async (resolve, reject) => {
        // Let user chose
        const chosenDialect: string = await window.showQuickPick(dialectsPretty, {
            placeHolder: "Choose dialect",
            canPickMany: false,
        });
        if (!chosenDialect) return reject("No dialect picked");
        else {
            const result: string = getDialectFromPretty(chosenDialect);
            if (result) return resolve(result);
            else {
                console.error(`[Dialect] Could not convert chosen dialect: ${chosenDialect}`);
                reject();
            }
        }
    });
}
