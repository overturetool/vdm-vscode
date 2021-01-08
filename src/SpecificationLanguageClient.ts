import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;
    public static readonly latexLanguageId = "latex"; // See the LSP specification for alternative language ids
    public static readonly wordLanguageId = "word"; // See the LSP specification for alternative language ids
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri; 
    public readonly projectSavedDataPath = Uri.joinPath(this.projectRoot, ".generated");

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, public readonly dataStoragePath:Uri, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this._context = context
        this.registerFeatures([ 
            new ProofObligationGenerationFeature(this, this._context), 
            new CombinantorialTestingFeature(),
            new TranslateFeature(SpecificationLanguageClient.latexLanguageId),
            new TranslateFeature(SpecificationLanguageClient.wordLanguageId)
        ]);
    }
}
