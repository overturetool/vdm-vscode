// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace, commands } from "vscode";
import { Middleware, ProvideCodeLensesSignature, ProvideDocumentSymbolsSignature } from "vscode-languageclient";

export default class VdmMiddleware implements Middleware {
    private _pendingUndoUris: Set<string> = new Set();

    schedulePendingUndo(uri: string) {
        this._pendingUndoUris.add(uri);
    }

    provideDocumentSymbols(document: TextDocument, token: CancellationToken, next: ProvideDocumentSymbolsSignature): ProviderResult<any> {
        const key = document.uri.toString();
        const result = next(document, token);
        if (this._pendingUndoUris.has(key)) {
            this._pendingUndoUris.delete(key);
            Promise.resolve(result).then(() => {
                commands.executeCommand("undo");
            });
        }
        return result;
    }

    provideCodeLenses(
        this: void,
        document: TextDocument,
        token: CancellationToken,
        next: ProvideCodeLensesSignature,
    ): ProviderResult<CodeLens[]> {
        // Check if code lenses have been disabled
        const wsFolder = workspace.getWorkspaceFolder(document.uri);
        const config = workspace.getConfiguration("vdm-vscode.codeLenses", wsFolder);
        const enabled = config.get("enabled", true);

        // Do the request
        if (enabled) return next(document, token);
        // Kill the request
        else return [];
    }
}
