import { Uri } from "vscode"
import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import path = require("path")

export namespace POGController 
{
    export class POGCommandsHandler 
    {
        private _client: Promise<SpecificationLanguageClient>
        private readonly _extensionUri: vscode.Uri;

        constructor(client: Promise<SpecificationLanguageClient>, extensionUri: vscode.Uri)
        {
            this._client = client;
            this._extensionUri = extensionUri;         
        }
    
        async runPOGSelection(inputUri:Uri)
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            let client = await this._client;
            
            vscode.window.showInformationMessage('Running Proof Obligation Generation on Selection');
            let selection = vscode.window.activeTextEditor.selection;
            let po = client.generatePO(inputUri, selection);

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
            ProofObligationPanel.currentPanel.displayPOGSingleFile();
        }
    
        async runPOG(inputUri:Uri)
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
    
            let client = await this._client;
    
            vscode.window.showInformationMessage('Running Proof Obligation Generation');
    
            let uri = inputUri || vscode.window.activeTextEditor?.document.uri;
            let po = client.generatePO(uri);

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
			ProofObligationPanel.currentPanel.displayPOGSingleAllFiles();
        }
    
        async retrievePOs()
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            let client = await this._client;
            vscode.window.showInformationMessage('Running Proof Obligation Generation');
    
            client.retrievePO([1,2]);
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

       private readonly _extensionUri: vscode.Uri;
   
       public static createOrShowPanel(extensionUri: vscode.Uri) {
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
                    enableScripts: true,

                    // Restrict the webview to only loading content from our extension's `resources` directory.
                    localResourceRoots: [Uri.parse(extensionUri + '/' + 'resources')]
                }
           );
   
           ProofObligationPanel.currentPanel = new ProofObligationPanel(extensionUri, panel);
       }
   
       private constructor(extensionUri: vscode.Uri, panel: vscode.WebviewPanel) {
           this._panel = panel;
           this._extensionUri = extensionUri;
           // Listen for when the panel is disposed
           // This happens when the user closes the panel or when the panel is closed programatically
           this._panel.onDidDispose(() => this.dispose(), null, this._disposables);		
       }
   
       public displayPOGSingleAllFiles() {
           this._update("List of POG for ALL files")
           let json = {'a': 'First', 'b': 'Second', 'c': 'Third'};
           this._panel.webview.postMessage({ command: json });
       }
   
       public displayPOGSingleFile() {
           this._update("List of POG for SINGLE file")
           let json = {'a': 'Fourht', 'b': 'Fifth'};
           this._panel.webview.postMessage({ command: json });
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
   
       private _update(displayText: string = "INIT") {
           const webview = this._panel.webview;
           this._panel.webview.html = this._getHtmlForWebview(webview, displayText);
       }
       
       private _getHtmlForWebview(webview: vscode.Webview, displayText: string) {		

            const scriptUri = webview.asWebviewUri(Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.js'));

            const styleUri = webview.asWebviewUri(Uri.parse(this._extensionUri + path.sep + 'resources' + path.sep + 'main.css'));

            // Use a nonce to only allow specific scripts to be run
            const nonce = getNonce();

            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <link href="${styleUri}" rel="stylesheet">

            </head>
            <body>
                <h1 id="lines-of-code-counter">0</h1>

                <p>Start of lists</p>

                <div id="container">

                    <div id="leftList"></div>
                
                    <div id="middleList"></div>
                
                    <div id="rightList"></div>
            
                </div>

                <p>End of lists</p>
                <script nonce="${nonce}" src="${scriptUri}"></script>

            </body>
            </html>`;
            }
   }
   
   function getNonce() 
   {
       let text = '';
       const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
       for (let i = 0; i < 32; i++) {
           text += possible.charAt(Math.floor(Math.random() * possible.length));
       }
       return text;
   }
}

