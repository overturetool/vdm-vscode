// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder, RelativePattern, workspace, Uri } from "vscode";

export const dialectExtensions: Map<string, string[]> = new Map([
    ["vdmsl", ["vdmsl", "vsl"]],
    ["vdmpp", ["vdmpp", "vpp"]],
    ["vdmrt", ["vdmrt", "vrt"]],
]);
export const dialects: Map<string, string[]> = new Map([
    ["vdmsl", [...dialectExtensions.get("vdmsl"), "vdm-sl", "sl"]],
    ["vdmpp", [...dialectExtensions.get("vdmpp"), "vdm-pp", "pp", "vdm++", "++"]],
    ["vdmrt", [...dialectExtensions.get("vdmrt"), "vdm-rt", "rt"]],
]);

export async function guessDialect(wsFolder: WorkspaceFolder): Promise<string> {
    return new Promise((resolve, reject) => {
        dialectExtensions.forEach((v, k) => {
            const isThis = v.some(async (extension) => {
                const pattern = new RelativePattern(wsFolder.uri.path, `*.${extension}`);
                const res = await workspace.findFiles(pattern, null, 1);
                return res.length > 0;
            });

            if (isThis) return resolve(k);
        });

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
