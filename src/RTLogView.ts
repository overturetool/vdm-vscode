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
    WorkspaceFolder,
} from "vscode";
import AutoDisposable from "./helper/AutoDisposable";
import * as Fs from "fs-extra";
import * as Path from "path";

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
    private _wsFolder: WorkspaceFolder = undefined;
    private _logName: string = "";
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
                    this._logName = Path.basename(doc.uri.fsPath).split(".")[0];
                    this.parseAndPrepareLogData(doc.uri.fsPath).then((data) => {
                        this._wsFolder = data ? workspace.getWorkspaceFolder(doc.uri) : undefined;
                        if (data) {
                            window
                                .showInformationMessage(`Open '${this._logName}' in log viewer?`, { modal: true }, ...["Open"])
                                .then((response) => {
                                    if (response == "Open") {
                                        if (this._panel) {
                                            this._panel.dispose();
                                        }
                                        commands.executeCommand("workbench.action.closeActiveEditor");
                                        this.createWebView(
                                            data.busDecls,
                                            data.cpuDecls,
                                            data.executionEvents,
                                            data.cpusWithEvents,
                                            data.timeStamps
                                        );
                                    }
                                });
                        }
                    });
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
            this._wsFolder &&
            (event.affectsConfiguration("editor.fontFamily") ||
                event.affectsConfiguration("editor.fontSize") ||
                event.affectsConfiguration("workbench.colorTheme") ||
                event.affectsConfiguration("vdm-vscode.real-timeLogViewer.scaleWithFont") ||
                event.affectsConfiguration("vdm-vscode.real-timeLogViewer.matchTheme"))
        ) {
            const config = workspace.getConfiguration("vdm-vscode.real-timeLogViewer", this._wsFolder);
            this._panel.webview.postMessage({
                cmd: "editorSettingsChanged",
                scaleWithFont: config.get("scaleWithFont"),
                matchTheme: config.get("matchTheme"),
            });
        }
    }

    private async parseAndPrepareLogData(logPath: string): Promise<any> {
        if (!logPath) {
            return;
        }

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
        const busTopos: any[] = [];
        const decls: any[] = [];
        const timeStamps: number[] = [];
        let currrentTime: number = -1;
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

                // Parse the event
                for (let i = 0; i < contentSplit.length - 1; i++) {
                    logEventObj[contentSplit[i].slice(0, contentSplit[i].length - 1)] = this.stringValueToTypedValue(contentSplit[++i]);
                }

                if (logEventObj.time > currrentTime) {
                    currrentTime = logEventObj.time;
                    timeStamps.push(currrentTime);
                }

                if (logEventObj.eventKind == LogEvent.CpuDecl || logEventObj.eventKind == LogEvent.BusDecl) {
                    decls.push({ eventKind: logEventObj.eventKind, name: logEventObj.name, id: logEventObj.id });
                } else if (logEventObj.eventKind != LogEvent.DeployObj) {
                    if (logEventObj.eventKind != LogEvent.MessageActivate) {
                        if (logEventObj.eventKind == LogEvent.MessageCompleted) {
                            const msgInitEvent: any = activeMsgInitEvents.splice(
                                activeMsgInitEvents.indexOf(activeMsgInitEvents.find((msg) => msg.msgid == logEventObj.msgid)),
                                1
                            )[0];

                            logEventObj.busid = msgInitEvent.busid;
                            logEventObj.callthr = msgInitEvent.callthr;
                            logEventObj.tocpu = msgInitEvent.tocpu;
                            if (msgInitEvent.eventKind == LogEvent.MessageRequest) {
                                logEventObj.opname = msgInitEvent.opname;
                                logEventObj.objref = msgInitEvent.objref;
                                logEventObj.clnm = msgInitEvent.clnm;
                            }
                        }

                        const cpunm =
                            "cpunm" in logEventObj
                                ? logEventObj.cpunm
                                : "fromcpu" in logEventObj
                                ? logEventObj.fromcpu
                                : "tocpu" in logEventObj
                                ? logEventObj.tocpu
                                : logEventObj.id;
                        let cpuWithEvents = cpusWithEvents.find((cwe) => cwe.id == cpunm);
                        if (!cpuWithEvents) {
                            cpuWithEvents = {
                                id: cpunm,
                                executionEvents: [],
                                deployEvents: [],
                                name: cpunm == 0 ? "vCPU" : "",
                            };
                            cpusWithEvents.push(cpuWithEvents);
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

                    executionEvents.push(logEventObj);
                } else {
                    let cpuWithDeploy = cpusWithDeployEvents.find((cpu) => cpu.id == logEventObj.cpunm);
                    if (!cpuWithDeploy) {
                        cpuWithDeploy = { id: logEventObj.cpunm, deployEvents: [] };
                        cpusWithDeployEvents.push(cpuWithDeploy);
                    }
                    cpuWithDeploy.deployEvents.push(logEventObj);
                }

                if (logEventObj.eventKind == LogEvent.MessageRequest || logEventObj.eventKind == LogEvent.ReplyRequest) {
                    const existingBusTopo = busTopos.find((topo: any) => topo.id == logEventObj.busid);
                    if (!existingBusTopo) {
                        busTopos.push({ id: logEventObj.busid, topo: { from: logEventObj.fromcpu, to: [logEventObj.tocpu] } });
                    } else if (
                        existingBusTopo.topo.from != logEventObj.tocpu &&
                        existingBusTopo.topo.to.find((toId: any) => toId == logEventObj.tocpu) == undefined
                    ) {
                        existingBusTopo.topo.to.push(logEventObj.tocpu);
                    }
                }
            }
        });

        cpusWithEvents.forEach((cpuWithEvent) => {
            const cpuWithDeployEvents = cpusWithDeployEvents.find((cwde) => cwde.id == cpuWithEvent.id);
            cpuWithEvent.deployEvents = cpuWithDeployEvents ? cpuWithDeployEvents.deployEvents : [];

            const name: string =
                decls.find((decl) => decl.eventKind == LogEvent.CpuDecl && decl.id == cpuWithEvent.id)?.name ??
                (cpuWithEvent.id == 0 ? "vCPU" : `CPU ${cpuWithEvent.id}`);
            cpuDecls.push({ eventKind: LogEvent.CpuDecl, id: cpuWithEvent.id, expl: false, sys: "", name: name, time: 0 });
            cpuWithEvent.name = name;
        });

        busTopos.forEach((bt) => {
            busDecls.push({
                eventKind: LogEvent.BusDecl,
                id: bt.id,
                topo: bt.topo,
                name:
                    decls.find((decl) => decl.eventKind == LogEvent.BusDecl && decl.id == bt.id)?.name ??
                    (bt.id == 0 ? "vBUS" : `BUS ${bt.id}`),
                time: 0,
            });
        });

        return {
            executionEvents: executionEvents,
            cpuDecls: cpuDecls.sort((a, b) => a.id - b.id),
            busDecls: busDecls.sort((a, b) => a.id - b.id),
            cpusWithEvents: cpusWithEvents.sort((a, b) => a.id - b.id),
            timeStamps: timeStamps,
        };
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

    private createWebView(busDecls: any[], cpuDecls: any[], executionEvents: any[], cpusWithEvents: any[], timeStamps: number[]) {
        if (!this._wsFolder) {
            return;
        }

        // Create panel
        this._panel =
            this._panel ||
            window.createWebviewPanel(
                `${this._context.extension.id}.rtLogView`,
                `Log Viewer: ${this._logName}`,
                {
                    viewColumn: ViewColumn.Active,
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
                    const config = workspace.getConfiguration("vdm-vscode.real-timeLogViewer", this._wsFolder);
                    returnObj.busDecls = busDecls;
                    returnObj.cpuDecls = cpuDecls;
                    returnObj.executionEvents = executionEvents;
                    returnObj.cpusWithEvents = cpusWithEvents;
                    returnObj.timeStamps = timeStamps;
                    returnObj.scaleWithFont = config.get("scaleWithFont");
                    returnObj.matchTheme = config.get("matchTheme");
                }

                this._panel.webview.postMessage(returnObj);
            },
            null,
            this._disposables
        );

        // Generate the html for the webview
        this._panel.webview.html = this.buildHtmlForWebview(this._panel.webview, cpusWithEvents, timeStamps);
    }

    private buildHtmlForWebview(webview: Webview, cpusWithEvents: any[], timeStamps: number[]) {
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
            <b> Start time: <b>
            <select id = "timeStamp" >
            ${timeStamps.map((t) => `<option> ${t}</option>`)}
            </select>
           
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
