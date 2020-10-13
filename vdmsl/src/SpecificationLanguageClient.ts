import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, Range, ServerOptions } from "vscode-languageclient";
import { ProofObligationGenerationFeature } from "./proofObligationGeneration";
import { ProofObligationHeader, GeneratePOParams, GeneratePORequest, ProofObligation, RetrievePOParams, RetrievePORequest } from "./protocol.lspx";

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
	
	async generatePO(uri: Uri, range?: Range): Promise<ProofObligationHeader[]> {
		if (range)
			var lspRange = Range.create(range.start,range.end)
		
		let params: GeneratePOParams = {
			uri: uri.toString(),
			range: lspRange
		};
		const values = await this.sendRequest(GeneratePORequest.type, params);
		return values;
	}

	async retrievePO(ids:number[]): Promise<ProofObligation[]> {
		let params: RetrievePOParams = {
			ids: ids
		};
		const values = await this.sendRequest(RetrievePORequest.type, params);
		return values;
	}
}