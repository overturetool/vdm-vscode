/* SPDX-License-Identifier: GPL-3.0-or-later */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { getExtensionPath } from "../util/ExtensionUtil";
import * as Util from "../util/Util";

function findVdmjJar(): string | undefined {
    const jarDir = path.resolve(getExtensionPath(), "resources", "jars", "vdmj");
    if (!fs.existsSync(jarDir)) {
        return undefined;
    }
    const jar = fs.readdirSync(jarDir).find((f) => f.startsWith("vdmj") && f.endsWith(".jar"));
    return jar ? path.join(jarDir, jar) : undefined;
}

function buildPty(proc: cp.ChildProcess, cwd: string | undefined): vscode.Pseudoterminal {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number>();

    let inputBuffer = "";
    let cursorPos = 0;
    const history: string[] = [];
    let historyIndex = -1;
    const prompt = "> ";
    let killedByUser = false;

    proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString().replace(/\r?\n/g, "\r\n");
        writeEmitter.fire(text);
    });

    proc.stderr?.on("data", (data: Buffer) => {
        writeEmitter.fire(data.toString().replace(/\r?\n/g, "\r\n"));
    });

    proc.on("close", (code) => {
        if (killedByUser) {
            closeEmitter.fire(0);
        } else {
            closeEmitter.fire(code ?? 0);
        }
    });

    return {
        onDidWrite: writeEmitter.event,
        onDidClose: closeEmitter.event,

        open(): void {
            writeEmitter.fire("--- VDM-SL Quick Interpreter ---\r\n");
            writeEmitter.fire(`Working directory: ${cwd ?? "unknown"}\r\n`);
            writeEmitter.fire("Type 'help' for available commands.\r\n\r\n");
        },

        close(): void {
            try {
                proc.stdin?.write("quit\n");
            } catch (_) {}
            proc.kill();
        },

        handleInput(data: string): void {
            if (data === "\x1b[A") {
                // Up arrow
                if (history.length === 0) {
                    return;
                }
                historyIndex = Math.min(historyIndex + 1, history.length - 1);
                const recalled = history[history.length - 1 - historyIndex];
                writeEmitter.fire(`\r\x1b[K${prompt}${recalled}`);
                inputBuffer = recalled;
                cursorPos = inputBuffer.length;
                return;
            }

            if (data === "\x1b[B") {
                // Down arrow
                historyIndex = Math.max(historyIndex - 1, -1);
                const recalled = historyIndex >= 0 ? history[history.length - 1 - historyIndex] : "";
                writeEmitter.fire(`\r\x1b[K${prompt}${recalled}`);
                inputBuffer = recalled;
                cursorPos = inputBuffer.length;
                return;
            }

            if (data === "\x1b[C") {
                // Right arrow
                if (cursorPos < inputBuffer.length) {
                    cursorPos++;
                    writeEmitter.fire("\x1b[C");
                }
                return;
            }

            if (data === "\x1b[D") {
                // Left arrow
                if (cursorPos > 0) {
                    cursorPos--;
                    writeEmitter.fire("\x1b[D");
                }
                return;
            }

            // Ignore other escape sequences
            if (data.startsWith("\x1b")) {
                return;
            }

            if (data === "\r") {
                // Enter
                writeEmitter.fire("\r\n");
                const line = inputBuffer.trim();
                if (line.length > 0) {
                    history.push(line);
                }
                historyIndex = -1;
                proc.stdin?.write(inputBuffer + "\n");
                inputBuffer = "";
                cursorPos = 0;
            } else if (data === "\x7f") {
                // Backspace
                if (cursorPos > 0) {
                    inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
                    cursorPos--;
                    const tail = inputBuffer.slice(cursorPos);
                    writeEmitter.fire(`\b${tail} \x1b[${tail.length + 1}D`);
                }
            } else if (data === "\x03") {
                // Ctrl+C
                writeEmitter.fire("^C\r\n");
                inputBuffer = "";
                cursorPos = 0;
                historyIndex = -1;
                killedByUser = true;
                if (process.platform === "win32") {
                    proc.kill();
                } else {
                    proc.kill("SIGINT");
                }
            } else if (data === "\t") {
                // Ignore tab
                return;
            } else {
                // Regular printable character
                inputBuffer = inputBuffer.slice(0, cursorPos) + data + inputBuffer.slice(cursorPos);
                cursorPos++;
                const tail = inputBuffer.slice(cursorPos);
                if (tail.length > 0) {
                    writeEmitter.fire(`${data}${tail}\x1b[${tail.length}D`);
                } else {
                    writeEmitter.fire(data);
                }
            }
        },
    };
}

export class QuickInterpreterHandler implements vscode.Disposable {
    private _terminal: vscode.Terminal | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor() {
        this._disposables.push(
            vscode.window.onDidCloseTerminal((t) => {
                if (t === this._terminal) {
                    this._terminal = undefined;
                }
            }),
        );

        this._disposables.push(vscode.commands.registerCommand("vdm-vscode.quickInterpreter", () => this._launch()));
    }

    private _launch(): void {
        // If a Quick Interpreter terminal is already open, just focus it
        if (this._terminal) {
            this._terminal.show();
            return;
        }

        const jarPath = findVdmjJar();
        if (!jarPath) {
            vscode.window.showErrorMessage("Quick Interpreter: Could not find the VDMJ jar.");
            return;
        }

        const javaPath = Util.findJavaExecutable("java");
        if (!javaPath) {
            vscode.window.showErrorMessage("Quick Interpreter: Java runtime not found.");
            return;
        }

        // Build Java args, honouring the JVM arguments setting
        const jvmArgs = vscode.workspace.getConfiguration("vdm-vscode.server").get<string>("JVMArguments", "").trim();
        const jvmArgsList = jvmArgs ? jvmArgs.split(/\s+/) : [];

        const args: string[] = [...jvmArgsList, "-cp", jarPath, "VDMJ", "-i"];

        const activeUri = vscode.window.activeTextEditor?.document?.uri;
        const wsFolder = activeUri
            ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
            : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const proc = cp.spawn(javaPath, args, { cwd: wsFolder });
        const pty = buildPty(proc, wsFolder);
        this._terminal = vscode.window.createTerminal({
            name: "VDM Quick Interpreter",
            pty,
        });
        this._terminal.show();
    }

    dispose(): void {
        this._terminal?.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
