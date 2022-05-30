/* eslint-disable eqeqeq */
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
    cpuDecl = "CPUdecl",
    busDecl = "BUSdecl",
    threadCreate = "ThreadCreate",
    threadSwapIn = "ThreadSwapIn",
    delayedThreadSwapIn = "DelayedThreadSwapIn",
    threadSwapOut = "ThreadSwapOut",
    threadKill = "ThreadKill",
    messageRequest = "MessageRequest",
    messageActivate = "MessageActivate",
    messageCompleted = "MessageCompleted",
    opActivate = "OpActivate",
    opRequest = "OpRequest",
    opCompleted = "OpCompleted",
    replyRequest = "ReplyRequest",
    deployObj = "DeployObj",
}

interface ConjectureTarget {
    kind: string;
    opname: string;
    time: number;
    thread: number;
}

interface ValidationConjecture {
    status: boolean;
    name: string;
    expression: string;
    source: ConjectureTarget;
    destination: ConjectureTarget;
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
                    window
                        .showInformationMessage(`Open '${this._logName}' in log viewer?`, { modal: true }, ...["Open"])
                        .then((response) => {
                            if (response == "Open") {
                                if (this._panel) {
                                    this._panel.dispose();
                                }

                                this.parseAndPrepareLogData(doc.uri.fsPath).then((data) => {
                                    this._wsFolder = data ? workspace.getWorkspaceFolder(doc.uri) : undefined;
                                    const conjFilePath = Path.join(Path.dirname(doc.uri.fsPath), `${this._logName}.conj`);
                                    const conjObjs: ValidationConjecture[] = Fs.existsSync(conjFilePath)
                                        ? JSON.parse(Fs.readFileSync(conjFilePath, "utf-8"))
                                        : [];

                                    if (data) {
                                        commands.executeCommand("workbench.action.closeActiveEditor");
                                        this.createWebView(
                                            data.busDecls,
                                            data.cpuDecls,
                                            data.executionEvents,
                                            data.cpusWithEvents,
                                            data.timeStamps,
                                            conjObjs
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
        while (this._disposables.length) {
            this._disposables.pop().dispose();
        }
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
        const timeStamps: number[] = [];
        let currrentTime: number = -1;
        const vBusDecl = { eventKind: LogEvent.busDecl, id: 0, topo: [], name: "vBUS", time: 0 };
        const vCpuDecl = { eventKind: LogEvent.cpuDecl, id: undefined, expl: false, sys: "", name: "vCPU", time: 0 };
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
                    const property = contentSplit[i].slice(0, contentSplit[i].length - 1);
                    // If log event is of type busdecl then the topology needs to be parsed
                    logEventObj[property] =
                        property == "topo"
                            ? contentSplit[++i].replace(/[{}]/g, "").split(",")
                            : this.stringValueToTypedValue(contentSplit[++i]);
                }

                if (logEventObj.time > currrentTime) {
                    currrentTime = logEventObj.time;
                    timeStamps.push(currrentTime);
                }

                if (logEventObj.eventKind == LogEvent.busDecl) {
                    busDecls.push(logEventObj);
                } else if (logEventObj.eventKind == LogEvent.cpuDecl) {
                    cpuDecls.push(logEventObj);
                } else if (logEventObj.eventKind != LogEvent.deployObj) {
                    if (logEventObj.eventKind != LogEvent.messageActivate) {
                        if (logEventObj.eventKind == LogEvent.messageCompleted) {
                            const msgInitEvent: any = activeMsgInitEvents.splice(
                                activeMsgInitEvents.indexOf(activeMsgInitEvents.find((msg) => msg.msgid == logEventObj.msgid)),
                                1
                            )[0];

                            logEventObj.busid = msgInitEvent.busid;
                            logEventObj.callthr = msgInitEvent.callthr;
                            logEventObj.tocpu = msgInitEvent.tocpu;
                            if (msgInitEvent.eventKind == LogEvent.messageRequest) {
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
                            };
                            cpusWithEvents.push(cpuWithEvents);
                        }

                        if (logEventObj.eventKind == LogEvent.messageRequest || logEventObj.eventKind == LogEvent.replyRequest) {
                            activeMsgInitEvents.push(logEventObj);
                        }

                        cpuWithEvents.executionEvents.push(logEventObj);
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

                if (
                    (logEventObj.eventKind == LogEvent.messageRequest || logEventObj.eventKind == LogEvent.replyRequest) &&
                    logEventObj.busid == 0
                ) {
                    [logEventObj.fromcpu, logEventObj.tocpu].forEach((tpid) => {
                        if (vBusDecl.topo.find((id: number) => id == tpid) == undefined) {
                            vBusDecl.topo.push(tpid);
                        }
                    });
                }

                if (logEventObj?.cpunm == 0 && vCpuDecl.id == undefined) {
                    vCpuDecl.id = logEventObj.cpunm;
                    cpuDecls.push(vCpuDecl);
                }
            }
        });

        if (vBusDecl.topo.length > 0) {
            busDecls.push(vBusDecl);
        }

        cpusWithEvents.forEach((cpuWithEvent) => {
            cpuWithEvent.deployEvents = cpusWithDeployEvents.find((cwde) => cwde.id == cpuWithEvent.id)?.deployEvents ?? [];
            cpuWithEvent.name = cpuDecls.find((decl) => decl.id == cpuWithEvent.id).name;
        });

        // Parse conjectures if found
        const conjecturesFilePath: string = `${logPath}.violations`;
        if (Fs.existsSync(conjecturesFilePath)) {
            const logContent: string = await Fs.readFile(conjecturesFilePath, "utf-8");
            if (logContent) {
                //TODO: parse validation conjectures
                const conjectures: string[] = logContent.split(/[\r\n\t]+/g);
            }
        }

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

    private createWebView(
        busDecls: any[],
        cpuDecls: any[],
        executionEvents: any[],
        cpusWithEvents: any[],
        timeStamps: number[],
        conjObjs: ValidationConjecture[]
    ) {
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
                    preserveFocus: false,
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
                    returnObj.conjObjs = conjObjs;
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
