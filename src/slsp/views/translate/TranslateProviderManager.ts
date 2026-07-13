// SPDX-License-Identifier: GPL-3.0-or-later

import { commands, Disposable, DocumentSelector, Uri } from "vscode";

interface RegisteredTranslateProvider {
    selector: DocumentSelector;
    provider: TranslateProvider;
    description?: string;
}

export class TranslateProviderManager {
    // Keep track of translate providers for each workspace/client
    private static _providers: Map<string, RegisteredTranslateProvider[]> = new Map();

    // Register a new translate provider for a workspace/client
    public static registerTranslateProvider(
        documentSelector: DocumentSelector,
        provider: TranslateProvider,
        language: string,
        description?: string,
    ): Disposable {
        const providers = this._providers.get(language) || [];
        providers.push({ selector: documentSelector, provider, description });
        this._providers.set(language, providers);

        commands.executeCommand("setContext", `vdm-vscode.translate.${language}`, true);

        return {
            dispose: () => {
                const langProviders = this._providers.get(language).filter((p) => p.selector != documentSelector || p.provider != provider);
                this._providers.set(language, langProviders);
                if (langProviders.length == 0) commands.executeCommand("setContext", `vdm-vscode.translate.${language}`, false);
            },
        };
    }

    public static getProviders(language: string): RegisteredTranslateProvider[] {
        return TranslateProviderManager._providers.get(language) ?? [];
    }

    public static getRegisteredLanguages(): string[] {
        return Array.from(this._providers.keys()).filter((lang) => (this._providers.get(lang) ?? []).length > 0);
    }
}

export interface TranslateProvider {
    doTranslation(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri>;
}
