import { ExtensionContext } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";

export class SpecificationLanguageClient extends LanguageClient {
    private _context: ExtensionContext;

    constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context: ExtensionContext, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);

        this._context = context

        //this.registerFeature(new ProofObligationGenerationFeature(this, this._context));
        this.registerFeatures([new ProofObligationGenerationFeature(this,this._context), new CombinantorialTestingFeature(this, this._context)]);
    }
}