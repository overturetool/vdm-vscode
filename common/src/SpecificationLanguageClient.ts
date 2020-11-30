import { ExtensionContext, Uri, workspace } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { LanguageKind } from "./protocol.slsp";
import { TranslateFeature } from "./TranslateFeature";
import { VdmjCTFilterHandler } from "./VdmjCTFilterHandler";
import { VdmjCTInterpreterHandler } from "./VdmjCTInterpreterHandler";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;
    public readonly projectSavedDataPath = Uri.joinPath(workspace.workspaceFolders[0].uri, ".generated"); //TODO Fix this when workspace gets implemented
    public readonly projectRoot = workspace.workspaceFolders[0].uri; //TODO Fix this when workspace gets implemented

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this._context = context
        
        this.registerFeatures([
            new ProofObligationGenerationFeature(this,this._context), 
            new CombinantorialTestingFeature(this, this._context, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler()),
            new TranslateFeature(this, this._context, LanguageKind.Latex, "extension.translateLatex")
        ]);
    }
}