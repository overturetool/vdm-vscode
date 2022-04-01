import { ExtensionContext, Uri, ViewColumn, Webview, WebviewPanel, window } from "vscode";
import AutoDisposable from "./helper/AutoDisposable";

interface IRtViewMessage {
    command: string;
    data?: any;
}

export class RTLogView extends AutoDisposable {
    private _panel: WebviewPanel;

    constructor(private readonly _context: ExtensionContext) {
        super();
    }

    private createWebView(logPath: string) {
        // Define which column the po view should be in
        const column = window.activeTextEditor ? ViewColumn.Beside : ViewColumn.Two;

        // Create panel
        this._panel =
            this._panel ||
            window.createWebviewPanel(
                `${this._context.extension.id}.rtLogView`,
                "Real-time log view",
                {
                    viewColumn: column,
                    preserveFocus: true,
                },
                {
                    enableScripts: true, // Enable javascript in the webview
                    localResourceRoots: [this.getResourcesUri()], // Restrict the webview to only load content from the extension's `resources` directory.
                    retainContextWhenHidden: true, // Retain state when view goes into the background
                }
            );

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => (this._panel = undefined), this, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(async (message: IRtViewMessage) => {}, null, this._disposables);

        // Generate the html for the webview
        this._panel.webview.html = this.buildHtmlForWebview(this._panel.webview);
    }

    private buildHtmlForWebview(webview: Webview) {
        // Use a nonce to only allow specific scripts to be run
        const scriptNonce: string = this.generateNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
                webview.cspSource
            }; script-src 'nonce-${scriptNonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            
            <link href="${webview.asWebviewUri(
                Uri.joinPath(this.getResourcesUri(), "webviews", "rtLogView", "rtLogView.css")
            )}" rel="stylesheet">
        </head>
        <body>
            <button class="button" id="expandPOsBtn">Button 1</button>
            <button class="button" id="filterPOsBtn">Button 2</button>

            <br>

            <div id="viewContainer"></div>
            <script nonce="${scriptNonce}" src="${webview.asWebviewUri(
            Uri.joinPath(this.getResourcesUri(), "webviews", "rtLogView", "rtLogView.js")
        )}"></script>
        </body>
        </html>`;
    }

    private getResourcesUri(): Uri {
        return Uri.joinPath(this._context.extensionUri, "resources");
    }

    private generateNonce() {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
