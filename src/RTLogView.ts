/* SPDX-License-Identifier: GPL-3.0-or-later */

import { commands, ExtensionContext, TextDocument, Uri, ViewColumn, Webview, WebviewPanel, window, workspace } from "vscode";
import AutoDisposable from "./helper/AutoDisposable";
import * as Fs from "fs-extra";

// interface BUSdecl {
//     eventKind: string;
//     id: number;
//     topo: {
//         from: number;
//         to: number[];
//     };
//     name: string;
//     time: number;
// }

// interface CPUdecl {
//     eventKind: string;
//     id: number;
//     expl: boolean;
//     sys: string;
//     name: string;
//     time: number;
// }

// interface ThreadCreate {
//     eventKind: string;
//     id: number;
//     period: boolean;
//     objref: number;
//     clnm: string;
//     cpunm: number;
//     time: number;
// }

// interface ThreadSwapIn {
//     eventKind: string;
//     id: number;
//     objref: number;
//     clnm: string;
//     cpunm: number;
//     overhead: number;
//     time: number;
// }

// interface DelayedThreadSwapIn {
//     eventKind: string;
//     id: number;
//     objref: number;
//     clnm: string;
//     delay: number;
//     cpunm: number;
//     overhead: number;
//     time: number;
// }

// interface ThreadSwapOut {
//     eventKind: string;
//     id: number;
//     objref: number;
//     clnm: string;
//     cpunm: number;
//     overhead: number;
//     time: number;
// }

// interface ThreadKill {
//     eventKind: string;
//     id: number;
//     cpunm: number;
//     time: number;
// }

// interface MessageRequest {
//     eventKind: string;
//     busid: number;
//     fromcpu: number;
//     tocpu: number;
//     msgid: number;
//     callthr: number;
//     opname: string;
//     objref: number;
//     size: number;
//     time: number;
// }

// interface MessageActivate {
//     eventKind: string;
//     msgid: number;
//     time: number;
// }

// interface MessageCompleted {
//     eventKind: string;
//     msgid: number;
//     time: number;
// }

// interface Operation {
//     eventKind: string;
//     id: number;
//     opname: string;
//     objref: number;
//     clnm: string;
//     cpunm: number;
//     async: boolean;
//     time: number;
// }

// interface ReplyRequest {
//     eventKind: string;
//     busid: number;
//     fromcpu: number;
//     tocpu: number;
//     msgid: number;
//     origmsgid: number;
//     callthr: number;
//     calleethr: number;
//     size: number;
//     time: number;
// }

export class RTLogView extends AutoDisposable {
    private _panel: WebviewPanel;

    constructor(private readonly _context: ExtensionContext) {
        super();
        this._disposables.push(
            workspace.onDidOpenTextDocument((doc: TextDocument) => {
                if (doc.uri.fsPath.endsWith(".rtlog")) {
                    commands.executeCommand("workbench.action.closeActiveEditor");
                    this.parseLogData(doc.uri.fsPath).then((logData) => this.createWebView(logData));
                }
            })
        );
    }

    dispose() {
        // Figure out how to close the editor that showed the log view
        this._panel.dispose();
        while (this._disposables.length) this._disposables.pop().dispose();
    }

    private async parseLogData(logPath: string): Promise<any[]> {
        if (!logPath) {
            return;
        }
        let includeVBus: boolean = false;
        let includeVCpu: boolean = false;

        const logLines: string[] = (await Fs.readFile(logPath, "utf-8")).split(/[\r\n\t]+/g);
        const dataObjects: any[] = [];
        const cpudecls: any[] = [];
        const stringPlaceholderSign = "-";
        logLines?.forEach((line) => {
            const lineSplit: string[] = line.split(" -> ");
            const eventKind: string = lineSplit[0];
            let content = lineSplit[1];

            let firstStringSignIndex = content.indexOf('"');
            const embeddedStrings = [];
            while (firstStringSignIndex > -1) {
                const secondStringSignIndex = content.indexOf('"', firstStringSignIndex + 1);
                if (secondStringSignIndex > 0) {
                    const embeddedString = content.slice(firstStringSignIndex, secondStringSignIndex + 1);
                    embeddedStrings.push(embeddedString);
                    content = content.replace(embeddedString, stringPlaceholderSign);
                }
                firstStringSignIndex = content.indexOf('"');
            }
            let contentSplit: string[] = content.split(/[^\S]+/g);
            if (embeddedStrings.length > 0) {
                let contentSplitIterator = 0;
                embeddedStrings.forEach((embeddedString) => {
                    for (let i = contentSplitIterator; i < contentSplit.length; i++) {
                        if (contentSplit[i] == stringPlaceholderSign) {
                            contentSplit[i] = embeddedString;
                            contentSplitIterator += ++i;
                            break;
                        }
                    }
                });
            }

            const newData: any = {};
            if (eventKind == "BUSdecl") {
                for (let i = 0; i < contentSplit.length - 1; i++) {
                    const property = contentSplit[i].slice(0, contentSplit[i].length - 1);
                    if (property == "topo") {
                        const values = contentSplit[++i];
                        let to: any = this.stringValueToTypedValue(values.slice(values.indexOf(",") + 1).replace("}", ""));
                        if (Number(to)) {
                            to = [to];
                        }
                        newData[property] = {
                            from: this.stringValueToTypedValue(values.slice(0, values.indexOf(",")).replace("{", "")),
                            to: to,
                        };
                    } else {
                        newData[property] = this.stringValueToTypedValue(contentSplit[++i]);
                    }
                }
            } else {
                for (let i = 0; i < contentSplit.length - 1; i++) {
                    newData[contentSplit[i].slice(0, contentSplit[i].length - 1)] = this.stringValueToTypedValue(contentSplit[++i]);
                }

                if (eventKind == "CPUdecl") {
                    cpudecls.push(newData);
                }
            }
            newData.eventKind = eventKind;
            if (!includeVBus && "busid" in newData && newData.busid == 0) {
                includeVBus = true;
            }
            if (!includeVCpu && "cpunm" in newData && newData.cpunm == 0) {
                includeVCpu = true;
            }

            dataObjects.push(newData);
        });

        if (includeVBus) {
            dataObjects.push({
                eventKind: "BUSdecl",
                id: 0,
                topo: { from: 0, to: cpudecls.map((cpudecl) => cpudecl.id) },
                name: "vBUS",
                time: 0,
            });
        }

        if (includeVCpu) {
            dataObjects.push({ eventKind: "CPUdecl", id: 0, expl: false, sys: "", name: "vCPU", time: 0 });
        }

        return dataObjects;
    }

    private stringValueToTypedValue(value: string): any {
        const number = Number(value);
        if (number || number == 0) {
            return number;
        }

        if (value.toLowerCase() == "false") {
            return false;
        }

        if (value.toLowerCase() == "true") {
            return true;
        }

        if (value == '""') {
            return "";
        }
        if (value.includes("[") && value.includes("]")) {
            const values = value
                .replace(" ", "")
                .slice(1, value.length - 1)
                .split(",");
            return values.map((val) => Number(val));
        }

        return value.replace('"', "").replace('"', "");
    }

    private createWebView(logData: any[]) {
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
        this._panel.webview.onDidReceiveMessage(
            async (cmd: string) => {
                console.log("Received command from view: " + cmd);
                this._panel.webview.postMessage({
                    cmd: cmd,
                    data: logData,
                });
            },
            null,
            this._disposables
        );

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
            <button class="button" id="btn1">Architecture overview</button>
            <button class="button" id="btn2">Execution overview</button>
            <button class="button" id="btn3">View 3</button>
            <br>
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
