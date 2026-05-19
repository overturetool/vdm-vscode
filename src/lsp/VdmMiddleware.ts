// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace, commands } from "vscode";
import { Middleware, ProvideCodeLensesSignature, ProvideDocumentSymbolsSignature, HandleDiagnosticsSignature } from "vscode-languageclient";
import * as vscode from "vscode";

export default class VdmMiddleware implements Middleware {
    private _pendingUndoUris: Set<string> = new Set();
    private _qcDiagnostics: Map<string, vscode.Diagnostic[]> = new Map();

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

    clearQcDiagnostics() {
        this._qcDiagnostics.clear();
    }

    handleDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[], next: HandleDiagnosticsSignature) {
        const qcDiagnostics = diagnostics.filter((d) => d.source?.endsWith("/PO"));
        if (qcDiagnostics.length > 0) {
            const existing = this._qcDiagnostics.get(uri.toString()) ?? [];
            const updated = [
                ...existing.filter(
                    (cached) =>
                        !qcDiagnostics.some(
                            (incoming) =>
                                incoming.range.start.line === cached.range.start.line &&
                                incoming.range.start.character === cached.range.start.character,
                        ),
                ),
                ...qcDiagnostics,
            ];
            this._qcDiagnostics.set(uri.toString(), updated);
        }
        const cached = this._qcDiagnostics.get(uri.toString());
        if (cached?.length) {
            const missing = cached.filter(
                (d) =>
                    !diagnostics.some(
                        (server) =>
                            server.range.start.line === d.range.start.line && server.range.start.character === d.range.start.character,
                    ),
            );
            next(uri, [...diagnostics, ...missing]);
        } else {
            next(uri, diagnostics);
        }
    }
}
