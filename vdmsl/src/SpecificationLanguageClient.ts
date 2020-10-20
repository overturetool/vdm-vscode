import { ExtensionContext } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { ProofObligationGenerationFeature } from "./proofObligationGeneration";

export class SpecificationLanguageClient extends LanguageClient
{
	private _context : ExtensionContext;
	
	constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, context : ExtensionContext, forceDebug?: boolean){
		super(id, name, serverOptions, clientOptions, forceDebug);

		this._context = context
		this.registerFeature(new ProofObligationGenerationFeature(this, this._context));
	}

	public promise = new Promise<SpecificationLanguageClient>((resolve, reject) => {
		this.onReady().then(() => {
			resolve(this);
		}, (error) => {
			reject(error);
		});
	});
}
