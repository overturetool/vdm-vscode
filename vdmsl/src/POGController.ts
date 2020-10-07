import { Uri } from "vscode"
import * as vscode from 'vscode'
import { SpecificationLanguageClient } from "./SpecificationLanguageClient"
import path = require("path")
import { ProofObligationHeader } from "./MessageExtensions"

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
            
            vscode.window.setStatusBarMessage('Running Proof Obligation Generation on Selection', 2000);
            let selection = vscode.window.activeTextEditor.selection;

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
            ProofObligationPanel.currentPanel.displayPOGS(poHeaderFormatter(await client.generatePO(inputUri, selection)));
        }
    
        async runPOG(inputUri:Uri)
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            let client = await this._client;
    
            vscode.window.setStatusBarMessage('Running Proof Obligation Generation', 2000);

            let uri = inputUri || vscode.window.activeTextEditor?.document.uri;

            ProofObligationPanel.createOrShowPanel(this._extensionUri);
            ProofObligationPanel.currentPanel.displayPOGS(poHeaderFormatter(await client.generatePO(uri)));
        }
    
        async retrievePOs()
        {
            // The code you place here will be executed every time your command is executed
            // Display a message box to the user
            let client = await this._client;
            vscode.window.setStatusBarMessage('Retrieving Proof Obligation Information', 2000);
    
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
            let t = vscode.window.visibleTextEditors;
            const column = vscode.window.visibleTextEditors
                ? vscode.window.visibleTextEditors.sort((t1,t2) => { return t1.viewColumn < t2.viewColumn ? 1 : -1})[0].viewColumn + 1
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
                    localResourceRoots: [Uri.parse(extensionUri + '/' + 'resources')],

                    // Retain state - this is an ineffective way of doing it!
                    retainContextWhenHidden: true
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
           
           // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'rowclick':
                            let json = message.text;
                            vscode.window.showErrorMessage("TEXT");
                            return;
                    }
                },
                null,
                this._disposables
            );
       }
   
       public displayPOGS(POH : ProofObligationHeader[]) {
           this._update("List of POGs")
           let json = JSON.stringify(POH);       
           this._panel.webview.postMessage({ command: POH });
       }

       public displayTESTPOGS() {
        this._update("List of POGs")
        let json = [{'column1':'1','column2':'2','column3':'3','column4':'4'},
                    {'column1':'11','column2':'22','column3':'33','column4':'44'},
                    {'column1':'111','column2':'222','column3':'333','column4':'444'}]     
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
                <table id="table"></table>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
            }
   }

   function poHeaderFormatter(poHeaders: ProofObligationHeader[])
   {
       let t = poHeaders;
       return t;
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

