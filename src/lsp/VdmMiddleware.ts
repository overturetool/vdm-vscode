// SPDX-License-Identifier: GPL-3.0-or-later

import { ProviderResult, TextDocument, CancellationToken, CodeLens, workspace, commands } from "vscode";
import { Middleware, ProvideCodeLensesSignature, ProvideDocumentSymbolsSignature, HandleDiagnosticsSignature } from "vscode-languageclient";
import * as vscode from "vscode";
import { QCUpdatedObligation } from "../slsp/protocol/ProofObligationGeneration";

export default class VdmMiddleware implements Middleware {
    private _pendingUndoUris: Set<string> = new Set();
    private _qcDiagnostics: Map<string, vscode.Diagnostic[]> = new Map();
    private _lastIncomingDiagnostics: Map<string, vscode.Diagnostic[]> = new Map();

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
        this._lastIncomingDiagnostics.clear();
    }

    handleQCUpdated(obligations: QCUpdatedObligation[]) {
        for (const [uri, cached] of this._qcDiagnostics) {
            const obligationsForUri = obligations.filter((o) => o.location.uri === uri);
            if (obligationsForUri.length === 0) {
                continue;
            }

            const lastIncoming = this._lastIncomingDiagnostics.get(uri) ?? [];

            const updated = cached
                .map((d) => {
                    const match = obligationsForUri.find(
                        (o) =>
                            o.location.range.start.line === d.range.start.line &&
                            o.location.range.start.character === d.range.start.character,
                    );

                    if (!match) {
                        return d;
                    }

                    const stillFailing = lastIncoming.some(
                        (server) =>
                            server.range.start.line === d.range.start.line && server.range.start.character === d.range.start.character,
                    );

                    if (!stillFailing) {
                        return null;
                    }

                    const updatedMessage = d.message.replace(/PO #\d+/, `PO #${match.id}`);
                    const updated = new vscode.Diagnostic(d.range, updatedMessage, d.severity);
                    updated.source = d.source;
                    updated.code = d.code;
                    return updated;
                })
                .filter((d) => d !== null);

            this._qcDiagnostics.set(uri, updated);
        }
    }

    handleDiagnostics(uri: vscode.Uri, diagnostics: vscode.Diagnostic[], next: HandleDiagnosticsSignature) {
        this._lastIncomingDiagnostics.set(uri.toString(), diagnostics);
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
            const missing = cached
                .filter(
                    (d) =>
                        !diagnostics.some(
                            (server) =>
                                server.range.start.line === d.range.start.line && server.range.start.character === d.range.start.character,
                        ),
                )
                .map((d) => {
                    const stale = new vscode.Diagnostic(d.range, `[STALE] ${d.message}`, vscode.DiagnosticSeverity.Information);
                    stale.source = d.source;
                    stale.code = d.code;
                    return stale;
                });
            next(uri, [...diagnostics, ...missing]);
        } else {
            next(uri, diagnostics);
        }
    }

    updateStalePONumbers(pos: { id: number; range: vscode.Range }[]) {
        for (const [uri, cached] of this._qcDiagnostics) {
            const updated = cached
                .map((d) => {
                    const match = pos.find(
                        (po) => po.range.start.line === d.range.start.line && po.range.start.character === d.range.start.character,
                    );
                    if (!match) {
                        return null;
                    }
                    const updatedMessage = d.message.replace(/(\[STALE\] )?PO #\d+/, `PO #${match.id}`);
                    const updated = new vscode.Diagnostic(d.range, updatedMessage, d.severity);
                    updated.source = d.source;
                    updated.code = d.code;
                    return updated;
                })
                .filter((d) => d !== null);
            this._qcDiagnostics.set(uri, updated);
        }
    }
}
