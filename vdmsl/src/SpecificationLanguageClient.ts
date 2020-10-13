import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, Range, ServerOptions } from "vscode-languageclient";
import { ProofObligationGenerationFeature } from "./proofObligationGeneration";
import * as lspx from "./protocol.lspx";

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
	
	async generatePO(uri: Uri, range?: Range): Promise<lspx.ProofObligation[]> {
		if (range)
			var lspRange = Range.create(range.start,range.end)
		
		let params: lspx.GeneratePOParams = {
			uri: uri.toString(),
			range: lspRange
		};
		const values = await this.sendRequest(lspx.GeneratePORequest.type, params);
		return values;
	}
}
