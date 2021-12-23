// SPDX-License-Identifier: GPL-3.0-or-later

import * as vscode from 'vscode';
import { ClientCapabilities, DocumentSelector, LanguageClient, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { ExperimentalCapabilities } from "./protocol.slsp";

export class LensRefreshFeature implements StaticFeature {
    static codeLensProvider: RefreshCodeLensProvider;

    constructor(
        private client: LanguageClient
    ) {
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports code lenses
        if (!capabilities.experimental)
            capabilities.experimental = { codeLens: { refreshSupport: true } };
        else
            Object.assign(capabilities.experimental, { codeLens: { refreshSupport: true } });
    }
    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>, _documentSelector: DocumentSelector): void {
        if (!LensRefreshFeature.codeLensProvider)
            LensRefreshFeature.codeLensProvider = new RefreshCodeLensProvider();

        // If server supports code lenses
        if (capabilities?.codeLensProvider) {
            this.client.onRequest("workspace/codeLens/refresh", () => {
                LensRefreshFeature.codeLensProvider.fireEvent()
                return;
            })
        }
    }
}

class RefreshCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

    constructor() {
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this);
    }
    
    onDidChangeCodeLenses: vscode.Event<void>;
    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]>;
    provideCodeLenses<T=vscode.CodeLens>(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<T[]>;
    provideCodeLenses<T=vscode.CodeLens>(document: any, token: any): vscode.ProviderResult<vscode.CodeLens[]> | vscode.ProviderResult<T[]> {
        return [];
    }

    public fireEvent() {
        this._onDidChangeCodeLenses.fire()
    }
}