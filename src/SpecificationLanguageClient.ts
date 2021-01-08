import { ExtensionContext, Uri, workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;
    public readonly latexLanguageId = "latex"; // See the LSP specification for alternative language ids
    public readonly wordLanguageId = "word"; // See the LSP specification for alternative language ids

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, public clients: Map<string, SpecificationLanguageClient>, public readonly dataStoragePath:Uri, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this._context = context
        this.registerFeatures([ //TODO Fix for multi-server
            //new ProofObligationGenerationFeature(this,this._context), 
            new CombinantorialTestingFeature()
            //new TranslateFeature(this, this._context, this.latexLanguageId, "extension.translateLatex"),
            //new TranslateFeature(this, this._context, this.wordLanguageId, "extension.translateWord")
        ]);
    }
}