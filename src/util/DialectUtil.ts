// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder, RelativePattern, workspace, window, QuickPickItem } from "vscode";
import { SpecificationLanguageClient } from "../slsp/SpecificationLanguageClient";
import { ClientManager } from "../ClientManager";

interface QuickPickDialectItem extends QuickPickItem {
    prettyDialect: string;
    dialect: VdmDialect;
}

export enum VdmDialect {
    VDMSL = "vdmsl",
    VDMPP = "vdmpp",
    VDMRT = "vdmrt",
}

export const dialectToPrettyFormat: Map<VdmDialect, string> = new Map([
    [VdmDialect.VDMSL, "VDM-SL"],
    [VdmDialect.VDMPP, "VDM++"],
    [VdmDialect.VDMRT, "VDM-RT"],
]);

export const dialectToFileExtensions: Map<VdmDialect, string[]> = new Map([
    [VdmDialect.VDMSL, ["vdmsl", "vsl"]],
    [VdmDialect.VDMPP, ["vdmpp", "vpp"]],
    [VdmDialect.VDMRT, ["vdmrt", "vrt"]],
]);

export const vdmFileExtensions: Set<string> = new Set(Array.from(dialectToFileExtensions.values()).reduce((prev, cur) => prev.concat(cur)));

export const dialectToAlias: Map<VdmDialect, string[]> = new Map([
    [VdmDialect.VDMSL, [...dialectToFileExtensions.get(VdmDialect.VDMSL), "vdm-sl", "sl"]],
    [VdmDialect.VDMPP, [...dialectToFileExtensions.get(VdmDialect.VDMPP), "vdm-pp", "pp", "vdm++"]],
    [VdmDialect.VDMRT, [...dialectToFileExtensions.get(VdmDialect.VDMRT), "vdm-rt", "rt"]],
]);

export function vdmFilePattern(fsPath: string): RelativePattern {
    const allExtensionsCommaSeparated = Array.from(dialectToFileExtensions.values())
        .flatMap((extensions) => extensions)
        .join(",");

    return new RelativePattern(fsPath, `**/*.{${allExtensionsCommaSeparated}}`);
}

export async function guessDialect(wsFolder: WorkspaceFolder): Promise<VdmDialect> {
    for (const [dialect, extensions] of dialectToFileExtensions) {
        const commaSeparatedExtensions = extensions.join(",");
        const pattern: RelativePattern = new RelativePattern(wsFolder.uri.path, `**/*.{${commaSeparatedExtensions}}`);

        const matchingFiles = await workspace.findFiles(pattern, null, 1);

        if (matchingFiles.length === 1) {
            return dialect;
        }
    }

    throw new Error(`Could not guess dialect for workspace folder: ${wsFolder.name}`);
}

export function getDialectFromAlias(alias: string): VdmDialect {
    let returnDialect: VdmDialect;
    for (const [dialect, aliases] of dialectToAlias) {
        const matchingAlias = aliases.find((knownAlias) => knownAlias === alias.toLowerCase());

        if (matchingAlias) {
            returnDialect = dialect;
        }
    }

    if (!returnDialect) {
        console.log(`Input alias '${alias}' does not match any known alias`);
    }

    return returnDialect;
}

export async function pickDialect(): Promise<VdmDialect> {
    const quickPickDialectItems: QuickPickDialectItem[] = [];

    for (const [dialect, prettyDialect] of dialectToPrettyFormat) {
        quickPickDialectItems.push({
            label: prettyDialect,
            dialect,
            prettyDialect,
        });
    }

    const chosenDialect = await window.showQuickPick<QuickPickDialectItem>(quickPickDialectItems, {
        placeHolder: "Choose dialect",
        canPickMany: false,
    });

    if (!chosenDialect) {
        throw Error("No dialect picked.");
    }

    return chosenDialect.dialect;
}

export async function getDialect(wsFolder: WorkspaceFolder, clientManager: ClientManager): Promise<VdmDialect> {
    const client: SpecificationLanguageClient = clientManager.get(wsFolder);

    if (client) {
        console.log("From getDialect", client.languageId);
        return getDialectFromAlias(client.languageId);
    }

    let dialect: VdmDialect;
    try {
        // Try to guess the dialect
        dialect = await guessDialect(wsFolder);
    } catch {
        // If that fails ask the user for it
        dialect = await pickDialect();
    }

    // If the dialect could not be guessed or the user failed to pick one, there's nothing we can do.
    if (!dialect) {
        throw Error("Unable to determine VDM dialect for workspace");
    }

    return dialect;
}
