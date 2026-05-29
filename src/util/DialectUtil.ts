// SPDX-License-Identifier: GPL-3.0-or-later

import { WorkspaceFolder, RelativePattern, workspace, window, QuickPickItem, commands } from "vscode";
import { SpecificationLanguageClient } from "../slsp/SpecificationLanguageClient";
import { ClientManager } from "../ClientManager";
import * as vscode from "vscode";
import { VdmArgument, VdmTypeParameter } from "../handlers/AddRunConfigurationHandler";

interface QuickPickDialectItem extends QuickPickItem {
    prettyDialect: string;
    dialect: VdmDialect;
}

interface VdmEditorContext {
    dialect: VdmDialect;
    moduleName: string;
    symbolName?: string;
    symbolDetail?: string;
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

// Returns the module/class name from the active editor if it's a VDM file
// belonging to the given workspace folder, along with its dialect
export async function getActiveEditorVdmContext(wsFolder: WorkspaceFolder): Promise<VdmEditorContext | undefined> {
    const activeEditor = window.activeTextEditor;
    if (!activeEditor) {
        return undefined;
    }

    const activeDoc = activeEditor.document;
    if (workspace.getWorkspaceFolder(activeDoc.uri)?.uri.toString() !== wsFolder.uri.toString()) {
        return undefined;
    }

    const ext = activeDoc.uri.fsPath.split(".").pop()!.toLowerCase();
    for (const [dialect, extensions] of dialectToFileExtensions) {
        if (!extensions.includes(ext)) {
            continue;
        }

        const symbols = await commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", activeDoc.uri);
        if (!symbols?.length) {
            break;
        }

        const cursorPos = activeEditor.selection.active;

        const moduleSymbol = symbols.find((s) => s.range.contains(cursorPos)) ?? symbols[0];
        const childSymbol = moduleSymbol.children.find((s) => s.range.contains(cursorPos));
        console.log(childSymbol?.detail);

        return {
            dialect,
            moduleName: moduleSymbol.name,
            symbolName: childSymbol?.name,
            symbolDetail: childSymbol?.detail,
        };
    }

    return undefined;
}

// Find index of the top-level -> or +> (not inside parens/brackets)
function findTopLevelArrow(s: string): number {
    let depth = 0;
    for (let i = 0; i < s.length - 1; i++) {
        const c = s[i];
        if (c === "(" || c === "[" || c === "{") {
            depth++;
        } else if (c === ")" || c === "]" || c === "}") {
            depth--;
        } else if (depth === 0) {
            if ((s[i] === "-" || s[i] === "+") && s[i + 1] === ">") {
                return i;
            }
            if (s[i] === "=" && s[i + 1] === "=" && i + 2 < s.length && s[i + 2] === ">") {
                return i;
            }
        }
    }
    return -1;
}

// Split string on a separator only at depth 0
function splitTopLevel(s: string, sep: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "(" || c === "[" || c === "{") {
            depth++;
        } else if (c === ")" || c === "]" || c === "}") {
            depth--;
        } else if (depth === 0 && s.startsWith(sep, i)) {
            parts.push(s.substring(start, i));
            start = i + sep.length;
            i += sep.length - 1;
        }
    }
    parts.push(s.substring(start));
    return parts;
}

export function parseSymbolDetailToArgs(detail: string): { args: VdmArgument[]; typeParams: VdmTypeParameter[] } | undefined {
    // Strip outer parens
    const inner = detail.match(/^\((.*)\)$/)?.[1]?.trim();
    if (inner === undefined) {
        return undefined;
    }

    // Find the top-level arrow (-> or +>) by tracking nesting depth
    const topLevelArrowIndex = findTopLevelArrow(inner);
    if (topLevelArrowIndex === -1) {
        return undefined;
    }

    const paramsPart = inner.substring(0, topLevelArrowIndex).trim();
    if (!paramsPart) {
        return { args: [], typeParams: [] };
    }

    // Split params on top-level * only
    const paramTypes = splitTopLevel(paramsPart, " * ");

    // Collect type parameters (@T etc.)
    const typeParams: VdmTypeParameter[] = [];
    const args: VdmArgument[] = paramTypes.map((t, i) => {
        const trimmed = t.trim();
        // Collect any @T type params found in this arg's type
        const matches = trimmed.match(/@\w+/g) ?? [];
        matches.forEach((tp) => {
            if (!typeParams.includes(tp)) {
                typeParams.push(tp);
            }
        });
        return { name: `arg${i + 1}`, type: trimmed };
    });

    return { args, typeParams };
}
