import { Uri } from "vscode"
import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import path = require("path")

export namespace POGController 
{
    export class POGCommandsHandler 
    {
        private _client: Promise<SpecificationLanguageClient>
    
        constructor(client: Promise<SpecificationLanguageClient>)
        {
            this._client = client

            if (vscode.window.registerWebviewPanelSerializer) {
                // Make sure we register a serializer in activation event
                vscode.window.registerWebviewPanelSerializer(ProofObligationPanel.viewType, {
                    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                        ProofObligationPanel.revive(webviewPanel);
                    }
                });
            }
        }
    
        async runPOGSelection(inputUri:Uri)
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            let client = await this._client
            
            vscode.window.showInformationMessage('Running Proof Obligation Generation on Selection')
            let selection = vscode.window.activeTextEditor.selection
            let po = client.generatePO(inputUri, selection)

            ProofObligationPanel.createOrShowPanel()
            ProofObligationPanel.currentPanel.displayPOGSingleFile()
        }
    
        async runPOG(inputUri:Uri)
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
    
            let client = await this._client
    
            vscode.window.showInformationMessage('Running Proof Obligation Generation')
    
            let uri = inputUri || vscode.window.activeTextEditor?.document.uri
            let po = client.generatePO(uri)

            ProofObligationPanel.createOrShowPanel()
			ProofObligationPanel.currentPanel.displayPOGSingleAllFiles();
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


    class ProofObligationPanel {
       /**
        * Track the currently panel. Only allow a single panel to exist at a time.
        */
       public static currentPanel: ProofObligationPanel | undefined;
   
       public static readonly viewType = 'proofObligationPanel';
   
       private readonly _panel: vscode.WebviewPanel;
       private _disposables: vscode.Disposable[] = [];
   
       public static createOrShowPanel() {
           const column = vscode.window.activeTextEditor
               ? vscode.window.activeTextEditor.viewColumn
               : undefined;

            // If we already have a panel, show it.
            if (ProofObligationPanel.currentPanel) {
                ProofObligationPanel.currentPanel._panel.reveal(column);
                return;
            }
   
           // Create a new panel.
           const panel = vscode.window.createWebviewPanel(
               ProofObligationPanel.viewType,
               'Proof Obligations',
               column || vscode.ViewColumn.One,
                {
                    // Enable javascript in the webview
                    //enableScripts: true,

                    // And restrict the webview to NOT load any content from any directory.
                    localResourceRoots: []
                }
           );
   
           ProofObligationPanel.currentPanel = new ProofObligationPanel(panel);
       }
   
       public static revive(panel: vscode.WebviewPanel) {
           ProofObligationPanel.currentPanel = new ProofObligationPanel(panel);
       }
   
       private constructor(panel: vscode.WebviewPanel) {
           this._panel = panel;
   
           // Listen for when the panel is disposed
           // This happens when the user closes the panel or when the panel is closed programatically
           this._panel.onDidDispose(() => this.dispose(), null, this._disposables);		
       }
   
       public displayPOGSingleAllFiles() {
           this._update("Proof Obligations for ALL files", "List of proof obligations for ALL file here...")
       }
   
       public displayPOGSingleFile() {
           this._update("Proof Obligations for SINGLE file", "List of proof obligations for SINGLE file here...")
       }
   
       public dispose() {
           ProofObligationPanel.currentPanel = undefined;
   
           // Clean up our resources
           this._panel.dispose();
   
           while (this._disposables.length) {
               const x = this._disposables.pop();
               if (x) {
                   x.dispose();
               }
           }
       }
   
       private _update(titleText: string = "INIT", displayText: string = "INIT") {
           const webview = this._panel.webview;
           this._panel.title = titleText;
           this._panel.webview.html = this._getHtmlForWebview(webview, displayText);
       }
       
       private _getHtmlForWebview(webview: vscode.Webview, displayText: string) {		
           return `<!DOCTYPE html>
               <html lang="en">
               <head>
                   <meta charset="UTF-8">				
                   <title>Proof Obligations</title>
               </head>
               <body>
               <h1>` + displayText + `</h1>
               </body>
               </html>`;
       }
   }
   
}

