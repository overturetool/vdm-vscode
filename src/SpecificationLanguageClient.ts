import { ExtensionContext, Uri, workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";
import { VdmjCTFilterHandler } from "./VdmjCTFilterHandler";
import { VdmjCTInterpreterHandler } from "./VdmjCTInterpreterHandler";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;
    public readonly latexLanguageId = "latex"; // See the LSP specification for alternative language ids
    public readonly wordLanguageId = "word"; // See the LSP specification for alternative language ids
    public readonly projectSavedDataPath = Uri.joinPath(workspace.workspaceFolders[0].uri, ".generated"); //TODO Fix this when workspace gets implemented
    public readonly projectRoot = workspace.workspaceFolders[0].uri; //TODO Fix this when workspace gets implemented

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this._context = context
        
        this.registerFeatures([ //TODO Fix for multi-server
            new ProofObligationGenerationFeature(this, this._context), 
            // new CombinantorialTestingFeature(this, this._context, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler()),
            // new TranslateFeature(this, this._context, this.latexLanguageId, "extension.translateLatex"),
            // new TranslateFeature(this, this._context, this.wordLanguageId, "extension.translateWord")

        ]);
    }
}