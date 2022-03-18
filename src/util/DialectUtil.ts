// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder, RelativePattern, workspace, Uri, window } from "vscode";

export enum vdmDialects {
    VDMSL = "vdmsl",
    VDMPP = "vdmpp",
    VDMRT = "vdmrt",
}

export const dialectsPretty: Map<vdmDialects, string> = new Map([
    [vdmDialects.VDMSL, "VDM-SL"],
    [vdmDialects.VDMPP, "VDM++"],
    [vdmDialects.VDMRT, "VDM-RT"],
]);

export const dialectExtensions: Map<vdmDialects, string[]> = new Map([
    [vdmDialects.VDMSL, ["vdmsl", "vsl"]],
    [vdmDialects.VDMPP, ["vdmpp", "vpp"]],
    [vdmDialects.VDMRT, ["vdmrt", "vrt"]],
]);

export const dialectAlias: Map<vdmDialects, string[]> = new Map([
    [vdmDialects.VDMSL, [...dialectExtensions.get(vdmDialects.VDMSL), "vdm-sl", "sl"]],
    [vdmDialects.VDMPP, [...dialectExtensions.get(vdmDialects.VDMPP), "vdm-pp", "pp", "vdm++"]],
    [vdmDialects.VDMRT, [...dialectExtensions.get(vdmDialects.VDMRT), "vdm-rt", "rt"]],
]);

export function vdmWorkspaceFilePattern(wsFolder: WorkspaceFolder): RelativePattern {
    return new RelativePattern(
        wsFolder.uri.fsPath,
        `*.{${Array.from(dialectExtensions.values())
            .map((dialects) => dialects.reduce((prev, cur) => `${prev},${cur}`))
            .reduce((prev, cur) => `${prev},${cur}`)}}`
    );
}

export async function guessDialect(wsFolder: WorkspaceFolder): Promise<vdmDialects> {
    return new Promise(async (resolve, reject) => {
        for await (const [dialect, extensions] of dialectExtensions) {
            const pattern: RelativePattern = new RelativePattern(
                wsFolder.uri.path,
                `*.{${extensions.reduce((prev, cur) => `${prev},${cur}`)}}`
            );
            if ((await workspace.findFiles(pattern, null, 1)).length > 0) {
                return resolve(dialect);
            }
        }

        return reject(`Could not guess dialect for workspace folder: ${wsFolder.name}`);
    });
}

export async function guessDialectFromUri(uri: Uri): Promise<vdmDialects> {
    return new Promise((resolve, reject) => {
        const wsFolder = workspace.getWorkspaceFolder(uri);
        if (!wsFolder) return reject(`Could not find workspace folder for path: ${uri.path}`);

        guessDialect(wsFolder).then(
            (result) => resolve(result),
            (error) => reject(error)
        );
    });
}

export function getDialectFromAlias(alias: string): vdmDialects {
    let returnDialect: vdmDialects;
    dialectAlias.forEach((aliases, dialect) => {
        for (const knownAlias of aliases) {
            if (alias.toLowerCase() == knownAlias) {
                returnDialect = dialect;
                return;
            }
        }
    });
    if (!returnDialect) {
        throw new Error("Input alias does not match any known alias");
    } else {
        return returnDialect;
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

export async function pickDialect(): Promise<vdmDialects> {
    return new Promise(async (resolve, reject) => {
        // Let user choose
        const chosenDialect: string = await window.showQuickPick(Array.from(dialectsPretty.values()), {
            placeHolder: "Choose dialect",
            canPickMany: false,
        });
        if (!chosenDialect) return reject("No dialect picked");
        else {
            dialectsPretty.forEach((val, key) => {
                if (val == chosenDialect) return resolve(key);
            });
        }
    });
}
