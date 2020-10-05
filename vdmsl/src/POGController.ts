import { Uri } from "vscode"
import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"

export class POGController 
{
    private _client: Promise<SpecificationLanguageClient>

    constructor(client: Promise<SpecificationLanguageClient>)
    {
        this._client = client
    }

    async runPOGSelection(inputUri:Uri)
    {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        let client = await this._client
        
		vscode.window.showInformationMessage('Running Proof Obligation Generation on Selection')
		let selection = vscode.window.activeTextEditor.selection
		client.generatePO(inputUri, selection)
    }

    async runPOG(inputUri:Uri)
    {
        // The code you place here will be executed every time your command is executed
		// Display a message box to the user

		let client = await this._client

		vscode.window.showInformationMessage('Running Proof Obligation Generation')

		let uri = inputUri || vscode.window.activeTextEditor?.document.uri
		client.generatePO(uri)
    }

    async retrievePOs()
    {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        let client = await this._client
		vscode.window.showInformationMessage('Running Proof Obligation Generation');

		client.retrievePO([1,2])
    }
}