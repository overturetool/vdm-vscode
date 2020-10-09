import { version } from "os";
import { Uri, window } from "vscode";
import { DynamicFeature, LanguageClient, LanguageClientOptions, Range, ServerCapabilities, ServerOptions, StaticFeature } from "vscode-languageclient";
import { ProofObligationHeader, GeneratePOParams, GeneratePORequest, ProofObligation, RetrievePOParams, RetrievePORequest } from "./MessageExtensions";


export interface ExperimentalCapabilities {
	proofObligationProvider ?: boolean
}

export class WorkaroundFeature implements StaticFeature {
    fillClientCapabilities(capabilities): void {
        capabilities.experimental = { proofObligationGeneration: true };
    }
    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
		// if (capabilities.experimental.proofObligationProvider){
			

		// }
		
    }
}

export class SpecificationLanguageClient extends LanguageClient
{
	constructor(id: string, name: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, forceDebug?: boolean){
		super(id, name, serverOptions, clientOptions, forceDebug);
		this.registerFeature(new WorkaroundFeature());
	}
	
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