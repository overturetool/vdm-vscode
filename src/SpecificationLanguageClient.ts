import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";
import { VdmjCTFilterHandler } from "./VdmjCTFilterHandler";
import { VdmjCTInterpreterHandler } from "./VdmjCTInterpreterHandler";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;
    public static readonly latexLanguageId = "latex"; // See the LSP specification for alternative language ids
    public static readonly wordLanguageId = "word"; // See the LSP specification for alternative language ids
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri; //TODO Fix this when workspace gets implemented
    public readonly projectSavedDataPath = Uri.joinPath(this.projectRoot, ".generated"); //TODO Fix this when workspace gets implemented

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this._context = context
        
        this.registerFeatures([ //TODO Fix for multi-server
            new ProofObligationGenerationFeature(this, this._context), 
            // new CombinantorialTestingFeature(this, this._context, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler()),
            new TranslateFeature(SpecificationLanguageClient.latexLanguageId),
            new TranslateFeature(SpecificationLanguageClient.wordLanguageId)
        ]);
    }
}