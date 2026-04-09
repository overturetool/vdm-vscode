/* SPDX-License-Identifier: GPL-3.0-or-later */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { getExtensionPath } from "../util/ExtensionUtil";
import * as Util from "../util/Util";

const QUICK_HELP =
    "  env                                        - list the global symbols in the default environment\r\n" +
    "  help [<command>]                           - list all commands available\r\n" +
    "  init                                       - re-initialize the interpreter\r\n" +
    "  plugins                                    - list the loaded plugins\r\n" +
    "  print <expression>                         - evaluate an expression\r\n" +
    "  quit                                       - close the session\r\n" +
    "  set [<flag> <on|off>]                      - show or set runtime checks\r\n" +
    "\r\n";

function findVdmjJar(): string | undefined {
    const jarDir = path.resolve(getExtensionPath(), "resources", "jars", "vdmj");
    if (!fs.existsSync(jarDir)) {
        return undefined;
    }
    const jar = fs.readdirSync(jarDir).find((f) => f.startsWith("vdmj") && f.endsWith(".jar"));
    return jar ? path.join(jarDir, jar) : undefined;
}

function buildPty(proc: cp.ChildProcess): vscode.Pseudoterminal {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number>();

    let inputBuffer = "";
    const history: string[] = [];
    let historyIndex = -1;
    let prompt = "";

    proc.stdout.on("data", (data: Buffer) => {
        let text = data.toString().replace(/\r?\n/g, "\r\n");

        const trailingPrompt = text.match(/([>] )$/);
        if (trailingPrompt) {
            prompt = trailingPrompt[1];
        }

        // Replace VDMJ's own help listing with our curated one
        if (/^assert\s+<file>/m.test(text)) {
            text = QUICK_HELP + prompt;
        }

        writeEmitter.fire(text);
    });

    proc.stderr.on("data", (data: Buffer) => {
        writeEmitter.fire(data.toString().replace(/\r?\n/g, "\r\n"));
    });

    proc.on("close", (code) => closeEmitter.fire(code ?? 0));

    return {
        onDidWrite: writeEmitter.event,
        onDidClose: closeEmitter.event,

        open(): void {
            writeEmitter.fire("VDM-SL Quick Interpreter\r\n");
            writeEmitter.fire("Type 'help' for available commands.\r\n");
        },

        close(): void {
            try {
                proc.stdin.write("quit\n");
            } catch (_) {}
            proc.kill();
        },

        handleInput(data: string): void {
            // Arrow keys come in as escape sequences
            if (data === "\x1b[A") {
                // Up arrow - go back in history
                if (history.length === 0) {
                    return;
                }
                historyIndex = Math.min(historyIndex + 1, history.length - 1);
                const recalled = history[history.length - 1 - historyIndex];
                // Clear the current line and rewrite with recalled command
                writeEmitter.fire(`\r\x1b[K${prompt}${recalled}`);
                inputBuffer = recalled;
                return;
            }

            if (data === "\x1b[B") {
                // Down arrow - go forward in history
                historyIndex = Math.max(historyIndex - 1, -1);
                const recalled = historyIndex >= 0 ? history[history.length - 1 - historyIndex] : "";
                writeEmitter.fire(`\r\x1b[K${prompt}${recalled}`);
                inputBuffer = recalled;
                return;
            }

            // Ignore other escape sequences
            if (data.startsWith("\x1b")) {
                return;
            }

            if (data === "\r") {
                // Enter - submit the line
                writeEmitter.fire("\r\n");
                const line = inputBuffer.trim();
                if (line.length > 0) {
                    history.push(line);
                }
                historyIndex = -1;
                proc.stdin.write(inputBuffer + "\n");
                inputBuffer = "";
            } else if (data === "\x7f") {
                // Backspace
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                    writeEmitter.fire("\b \b");
                }
            } else if (data === "\x03") {
                // Ctrl+C - send interrupt and reset line
                writeEmitter.fire("^C\r\n");
                inputBuffer = "";
                historyIndex = -1;
                proc.stdin.write("\x03");
            } else {
                // Regular printable character
                inputBuffer += data;
                writeEmitter.fire(data);
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

        const args: string[] = [...(jvmArgs ? jvmArgs.split(/\s+/) : []), "-Xmx2g", "-cp", jarPath, "VDMJ", "-i"];

        const proc = cp.spawn(javaPath, args);
        const pty = buildPty(proc);
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
