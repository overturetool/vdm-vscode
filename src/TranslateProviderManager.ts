import { commands, Disposable, DocumentSelector, Uri } from "vscode";

export class TranslateProviderManager {
    // Keep track of translate providers for each workspace/client
    private static _providers: Map<string, { selector: DocumentSelector; provider: TranslateProvider }[]> = new Map();

    // Register a new translate provider for a workspace/client
    public static registerTranslateProvider(documentSelector: DocumentSelector, provider: TranslateProvider, language: string): Disposable {
        const providers = this._providers.get(language) || [];
        providers.push({ selector: documentSelector, provider: provider });
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

    public static getProviders(language: string): { selector: DocumentSelector; provider: TranslateProvider }[] {
        return TranslateProviderManager._providers.get(language);
    }
}

export interface TranslateProvider {
    doTranslation(saveUri: Uri, rootUri?: Uri, options?: any): Thenable<Uri>;
}
