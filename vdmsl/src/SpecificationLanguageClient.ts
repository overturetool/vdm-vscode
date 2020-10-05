import { Range, Uri } from "vscode";
import { LanguageClient } from "vscode-languageclient";
import { ProofObligationHeader, GeneratePOParams, GeneratePORequest, ProofObligation, RetrievePOParams, RetrievePORequest } from "./MessageExtensions";

export class SpecificationLanguageClient extends LanguageClient
{
	async generatePO(uri: Uri, range?: Range): Promise<ProofObligationHeader[]> {
		let params: GeneratePOParams = {
			submethod: 'POG/generate',  
			uri: uri.toString(),
			range: range
		};
		const values = await this.sendRequest(GeneratePORequest.type, params);
		return values;
	}

	async retrievePO(ids:number[]): Promise<ProofObligation[]> {
		let params: RetrievePOParams = {
			submethod: 'POG/retrieve',  
			ids: ids
		};
		const values = await this.sendRequest(RetrievePORequest.type, params);
		return values;
	}
}