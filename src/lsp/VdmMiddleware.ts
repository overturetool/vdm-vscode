// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace, Uri, Diagnostic, window, commands } from "vscode";
import { HandleDiagnosticsSignature, Middleware, ProvideCodeLensesSignature, ProvideDocumentSymbolsSignature } from "vscode-languageclient";

export default class VdmMiddleware implements Middleware {
    private _pendingSaveUris: Set<string> = new Set();
    private _pendingUndoUris: Set<string> = new Set();

    notifyOutlineRefreshOnSave(uri: string) {
        this._pendingSaveUris.add(uri);
    }

    handleDiagnostics(uri: Uri, diagnostics: Diagnostic[], next: HandleDiagnosticsSignature): void {
        next(uri, diagnostics);
        const key = uri.toString();
        if (!this._pendingSaveUris.has(key)) {
            return;
        }
        this._pendingSaveUris.delete(key);

        const editor = window.visibleTextEditors.find((e) => e.document.uri.toString() === key);
        if (!editor) {
            return;
        }

        const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
        editor
            .edit((edit) => edit.insert(end, " "), { undoStopBefore: false, undoStopAfter: false })
            .then(() => {
                this._pendingUndoUris.add(key);
            });
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
