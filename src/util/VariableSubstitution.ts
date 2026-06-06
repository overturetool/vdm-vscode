// SPDX-License-Identifier: GPL-3.0-or-later

import * as os from "os";
import { WorkspaceFolder } from "vscode";

/**
 * Resolves VSCode-style variable substitutions in a string.
 * Supports: ${userHome}, ${workspaceFolder}, ${/}, ${env:NAME}
 */
export function resolveVariables(value: string, wsFolder?: WorkspaceFolder): string {
    if (!value) {
        return value;
    }
    return value
        .replace(/\$\{userHome\}/g, os.homedir())
        .replace(/\$\{workspaceFolder\}/g, wsFolder?.uri.fsPath ?? "")
        .replace(/\$\{env:([^}]+)\}/g, (_, name) => process.env[name] ?? "");
}

/**
 * Applies resolveVariables to every string in an array.
 */
export function resolveVariablesInArray(values: string[], wsFolder?: WorkspaceFolder): string[] {
    return values.map((v) => resolveVariables(v, wsFolder));
}
