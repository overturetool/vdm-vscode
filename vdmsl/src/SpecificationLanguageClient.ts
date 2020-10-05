import { Uri } from "vscode";
import { LanguageClient, Range } from "vscode-languageclient";
import { ProofObligationHeader, GeneratePOParams, GeneratePORequest, ProofObligation, RetrievePOParams, RetrievePORequest } from "./MessageExtensions";

export class SpecificationLanguageClient extends LanguageClient
{
	async generatePO(uri: Uri, range?: Range): Promise<ProofObligationHeader[]> {
		let lspRange = Range.create(range.start,range.end)
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