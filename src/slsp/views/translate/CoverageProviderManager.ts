// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Disposable, DocumentSelector, Uri } from "vscode";

interface RegisteredCoverageProvider {
    selector: DocumentSelector;
    provider: CoverageProvider;
}

export class CoverageProviderManager {
    private static _providers: RegisteredCoverageProvider[] = [];

    public static registerCoverageProvider(documentSelector: DocumentSelector, provider: CoverageProvider): Disposable {
        const entry: RegisteredCoverageProvider = { selector: documentSelector, provider };
        this._providers.push(entry);

        commands.executeCommand("setContext", "vdm-vscode.translate.coverage", true);

        return {
            dispose: () => {
                this._providers = this._providers.filter((p) => p !== entry);
                if (this._providers.length === 0) {
                    commands.executeCommand("setContext", "vdm-vscode.translate.coverage", false);
                }
            },
        };
    }

    public static getProviders(): RegisteredCoverageProvider[] {
        return this._providers;
    }
}

export interface CoverageProvider {
    doCoverage(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri>;
}
