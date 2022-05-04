/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
    commands,
    ConfigurationChangeEvent,
    ExtensionContext,
    TextDocument,
    Uri,
    ViewColumn,
    Webview,
    WebviewPanel,
    window,
    workspace,
} from "vscode";
import AutoDisposable from "./helper/AutoDisposable";
import * as Fs from "fs-extra";

enum LogEvent {
    CpuDecl = "CPUdecl",
    BusDecl = "BUSdecl",
    ThreadCreate = "ThreadCreate",
    ThreadSwapIn = "ThreadSwapIn",
    DelayedThreadSwapIn = "DelayedThreadSwapIn",
    ThreadSwapOut = "ThreadSwapOut",
    ThreadKill = "ThreadKill",
    MessageRequest = "MessageRequest",
    MessageActivate = "MessageActivate",
    MessageCompleted = "MessageCompleted",
    OpActivate = "OpActivate",
    OpRequest = "OpRequest",
    OpCompleted = "OpCompleted",
    ReplyRequest = "ReplyRequest",
    DeployObj = "DeployObj",
}

export class RTLogView extends AutoDisposable {
    private _panel: WebviewPanel;
    constructor(private readonly _context: ExtensionContext) {
        super();
        // Add settings watch
        workspace.onDidChangeConfiguration(
            (e) => {
                if (this._panel) {
                    this.changesAffectsViewCheck(e);
                }
            },
            this,
            _context.subscriptions
        );
        this._disposables.push(
            workspace.onDidOpenTextDocument((doc: TextDocument) => {
                if (doc.uri.fsPath.endsWith(".rtlog")) {
                    if (this._panel) {
                        this._panel.dispose();
                    }
                    commands
                        .executeCommand("workbench.action.closeActiveEditor")
                        .then(() =>
                            this.parseLogData(doc.uri.fsPath).then((data) =>
                                this.createWebView(data.busDecls, data.cpuDecls, data.executionEvents, data.cpusWithEvents)
                            )
                        );
                }
            })
        );
    }

    dispose() {
        // Figure out how to close the editor that showed the log view
        this._panel.dispose();
        while (this._disposables.length) this._disposables.pop().dispose();
    }

    private changesAffectsViewCheck(event: ConfigurationChangeEvent) {
        // The webview needs to redraw its content if the font user changes the theme or font
        if (
            event.affectsConfiguration("editor.fontFamily") ||
            event.affectsConfiguration("editor.fontSize") ||
            event.affectsConfiguration("workbench.colorTheme")
        ) {
            this._panel.webview.postMessage({
                cmd: "editorSettingsChanged",
            });
        }
    }

    private async parseLogData(logPath: string): Promise<any> {
        if (!logPath) {
            return;
        }
        let includedVBus: boolean = false;
        let includedVCpu: boolean = false;
        const logContent: string = await Fs.readFile(logPath, "utf-8");
        if (!logContent) {
            return;
        }
        const logLines: string[] = logContent.split(/[\r\n\t]+/g);
        if (logLines.length <= 0) {
            return;
        }
        const executionEvents: any[] = [];
        const cpuDecls: any[] = [];
        const busDecls: any[] = [];
        const cpusWithDeployEvents: any[] = [];
        const cpusWithEvents: any[] = [];
        const stringPlaceholderSign = "-";
        const activeMsgInitEvents: any[] = [];
        logLines?.forEach((line) => {
            const lineSplit: string[] = line.split(" -> ");
            if (lineSplit.length > 1) {
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

                const logEventObj: any = { eventKind: lineSplit[0] };

                if (logEventObj.eventKind == LogEvent.BusDecl) {
                    // If log event is of type busdecl then it needs to be parsed differently
                    for (let i = 0; i < contentSplit.length - 1; i++) {
                        const property = contentSplit[i].slice(0, contentSplit[i].length - 1);
                        if (property == "topo") {
                            const values = contentSplit[++i];
                            let to: any = this.stringValueToTypedValue(values.slice(values.indexOf(",") + 1).replace("}", ""));
                            if (Number(to)) {
                                to = [to];
                            }
                            logEventObj[property] = {
                                from: this.stringValueToTypedValue(values.slice(0, values.indexOf(",")).replace("{", "")),
                                to: to,
                            };
                        } else {
                            logEventObj[property] = this.stringValueToTypedValue(contentSplit[++i]);
                        }
                    }
                    busDecls.push(logEventObj);
                } else {
                    // Parse the event
                    for (let i = 0; i < contentSplit.length - 1; i++) {
                        logEventObj[contentSplit[i].slice(0, contentSplit[i].length - 1)] = this.stringValueToTypedValue(contentSplit[++i]);
                    }

                    if (logEventObj.eventKind != LogEvent.DeployObj) {
                        if (logEventObj.eventKind != LogEvent.MessageActivate) {
                            let cpuWithEvents: any;
                            if (logEventObj.eventKind != LogEvent.MessageCompleted) {
                                const cpunm =
                                    "cpunm" in logEventObj
                                        ? logEventObj.cpunm
                                        : "fromcpu" in logEventObj
                                        ? logEventObj.fromcpu
                                        : "tocpu" in logEventObj
                                        ? logEventObj.tocpu
                                        : logEventObj.id;
                                cpuWithEvents = cpusWithEvents.find((cpu) => cpu.id == cpunm);
                                if (!cpuWithEvents) {
                                    cpuWithEvents = {
                                        id: cpunm,
                                        executionEvents: [],
                                        deployEvents: [],
                                        name: cpunm == 0 ? "vCPU" : "",
                                    };
                                    cpusWithEvents.push(cpuWithEvents);
                                }
                            } else {
                                const msgInitEvent: any = activeMsgInitEvents.splice(
                                    activeMsgInitEvents.indexOf(activeMsgInitEvents.find((msg) => msg.msgid == logEventObj.msgid)),
                                    1
                                )[0];
                                cpuWithEvents = cpusWithEvents.find((cpu) => cpu.id == msgInitEvent.tocpu);
                                logEventObj.busid = msgInitEvent.busid;
                                logEventObj.tocpu = msgInitEvent.tocpu;
                                if (!("objref" in msgInitEvent)) {
                                    logEventObj.origmsgid = msgInitEvent.origmsgid;
                                } else {
                                    logEventObj.objref = msgInitEvent.objref;
                                    logEventObj.clnm = msgInitEvent.clnm;
                                    logEventObj.opname = msgInitEvent.opname;
                                }
                            }

                            if (logEventObj.eventKind == LogEvent.MessageRequest || logEventObj.eventKind == LogEvent.ReplyRequest) {
                                activeMsgInitEvents.push(logEventObj);
                            }

                            if (logEventObj.eventKind == LogEvent.CpuDecl) {
                                cpuWithEvents.name = logEventObj.name;
                            } else {
                                cpuWithEvents.executionEvents.push(logEventObj);
                            }
                        }

                        if (logEventObj.eventKind == LogEvent.CpuDecl) {
                            cpuDecls.push(logEventObj);
                        } else {
                            executionEvents.push(logEventObj);
                        }
                    } else {
                        let cpuWithDeploy = cpusWithDeployEvents.find((cpu) => cpu.id == logEventObj.cpunm);
                        if (!cpuWithDeploy) {
                            cpuWithDeploy = { id: logEventObj.cpunm, deployEvents: [] };
                            cpusWithDeployEvents.push(cpuWithDeploy);
                        }
                        cpuWithDeploy.deployEvents.push(logEventObj);
                    }
                }

                if (!includedVBus && "busid" in logEventObj && logEventObj.busid == 0) {
                    includedVBus = true;
                    busDecls.unshift({
                        eventKind: LogEvent.BusDecl,
                        id: 0,
                        topo: { from: 0, to: cpuDecls.map((cpudecl) => cpudecl.id).filter((id) => id != 0) },
                        name: "vBUS",
                        time: 0,
                    });
                }

                if (!includedVCpu && "cpunm" in logEventObj && logEventObj.cpunm == 0) {
                    includedVCpu = true;
                    cpuDecls.unshift({ eventKind: LogEvent.CpuDecl, id: 0, expl: false, sys: "", name: "vCPU", time: 0 });
                }
            }
        });

        cpusWithEvents.forEach(
            (cpuWithEvent) => (cpuWithEvent.deployEvents = cpusWithDeployEvents.find((cwde) => cwde.id == cpuWithEvent.id).deployEvents)
        );

        return { executionEvents: executionEvents, cpuDecls: cpuDecls, busDecls: busDecls, cpusWithEvents: cpusWithEvents };
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

    private createWebView(busDecls: any[], cpuDecls: any[], executionEvents: any[], cpusWithEvents: any[]) {
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
                const returnObj: any = { cmd: cmd };
                if (cmd == "init") {
                    returnObj.busDecls = busDecls;
                    returnObj.cpuDecls = cpuDecls;
                    returnObj.executionEvents = executionEvents;
                    returnObj.cpusWithEvents = cpusWithEvents;
                }

                this._panel.webview.postMessage(returnObj);
            },
            null,
            this._disposables
        );

        // Generate the html for the webview
        this._panel.webview.html = this.buildHtmlForWebview(this._panel.webview, cpusWithEvents);
    }

    private buildHtmlForWebview(webview: Webview, cpusWithEvents: any[]) {
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
            <button class="button" id="arch">Architecture overview</button>
            <button class="button" id="exec">Execution overview</button>
            ${cpusWithEvents
                .map((cpu) => `<button class="button" id="CPU_${cpu.id}">${cpu.name}</button>\n`)
                .reduce((prev, cur) => prev + cur, "")}
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
