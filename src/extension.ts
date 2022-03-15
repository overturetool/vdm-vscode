// SPDX-License-Identifier: GPL-3.0-or-later

import * as languageId from "./slsp/protocol/LanguageId";
import * as ExtensionInfo from "./ExtensionInfo";
import { ExtensionContext, window, workspace, commands, TextDocument } from "vscode";
import * as vscode from "vscode";
import { VdmDapSupport as dapSupport } from "./VdmDapSupport";
import { VdmjCTFilterHandler } from "./vdmj/VdmjCTFilterHandler";
import { VdmjCTInterpreterHandler } from "./vdmj/VdmjCTInterpreterHandler";
import { AddLibraryHandler } from "./AddLibraryHandler";
import { AddRunConfigurationHandler } from "./AddRunConfiguration";
import { AddExampleHandler } from "./ImportExample";
import { JavaCodeGenHandler } from "./JavaCodeGenHandler";
import { AddToClassPathHandler } from "./AddToClassPath";
import { ProofObligationPanel } from "./slsp/views/ProofObligationPanel";
import { TranslateButton } from "./slsp/views/translate/TranslateButton";
import { GenerateCoverageButton } from "./slsp/views/translate/GenerateCoverageButton";
import { CoverageOverlay } from "./slsp/views/translate/CoverageOverlay";
import { CombinatorialTestingView } from "./slsp/views/combinatorialTesting/CombinatorialTestingView";
import { ClientManager } from "./ClientManager";
import { ServerFactory } from "./server/ServerFactory";
import { dialects, workspaceFilePattern } from "./util/DialectUtil";
import { resetSortedWorkspaceFolders } from "./util/WorkspaceFoldersUtil";
import { ServerLog } from "./server/ServerLog";

export function activate(context: ExtensionContext) {
    const tokenTypes = ["class", "interface", "enum", "function", "variable"];
    const tokenModifiers = ["declaration", "documentation"];
    const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

    const provider: vscode.DocumentSemanticTokensProvider = {
        provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
            const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
            const beginText = "\\begin{vdm_al}";
            const endText = "\\end{vdm_al}";
            let currentBeginLine: number = -1;
            let currentEndLine: number = 0;

            const startEndLatex: any[] = [];
            let curStartLine: vscode.TextLine;
            let curEndLine: vscode.TextLine;
            for (let line = 0; line < document.lineCount; line++) {
                const curLine = document.lineAt(line);
                if (curLine.text.includes(beginText)) {
                    curStartLine = curLine;
                } else if (curLine.text.includes(endText)) {
                    curEndLine = curLine;
                    startEndLatex.push({ start: curStartLine, end: curEndLine });
                }
            }

            startEndLatex.forEach((startEnd) => {
                const startLine = startEnd.start;
                const endLine = startEnd.end;
            });

            // analyze the document
            for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
                const line = document.lineAt(lineNumber);
                if (line.text.includes(beginText)) {
                    if (currentBeginLine == -1 && line.lineNumber != 0) {
                        tokensBuilder.push(
                            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(line.lineNumber, line.text.length + 1)),
                            "class"
                        );
                    } else {
                        const range = new vscode.Range(
                            new vscode.Position(currentEndLine, 0),
                            new vscode.Position(line.lineNumber, line.text.length + 1)
                        );
                        tokensBuilder.push(range, "class");
                    }
                    currentBeginLine = line.lineNumber;
                } else if (line.text.includes(endText)) {
                    currentEndLine = line.lineNumber;
                } else if (currentBeginLine > -1 && currentEndLine < line.lineNumber) {
                    tokensBuilder.push(
                        new vscode.Range(
                            new vscode.Position(line.lineNumber, 0),
                            new vscode.Position(line.lineNumber, line.text.length + 1)
                        ),
                        "class"
                    );
                }
            }

            // build semantic tokens
            return tokensBuilder.build();
        },
    };

    vscode.languages.registerDocumentSemanticTokensProvider({ language: "vdmpp", scheme: "file" }, provider, legend);

    // Setup server factory
    let serverFactory: ServerFactory;
    try {
        serverFactory = new ServerFactory(new ServerLog(context.logUri));
    } catch (e) {
        window.showErrorMessage(e);
        return; // Can't create servers -> no reason to continue
    }

    // Setup client manager
    const clientManager: ClientManager = new ClientManager(serverFactory, dialects, workspaceFilePattern);
    context.subscriptions.push(clientManager);

    // Show VDM VS Code buttons
    commands.executeCommand("setContext", "vdm-submenus-show", true);

    // Initialise SLSP UI items // TODO Find better place for this (perhaps create a UI class that takes care of stuff like this)
    context.subscriptions.push(new ProofObligationPanel(context));
    context.subscriptions.push(
        new CombinatorialTestingView(clientManager, workspaceFilePattern, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler())
    );
    context.subscriptions.push(new TranslateButton(languageId.latex, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.word, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.graphviz, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.isabelle, ExtensionInfo.name, clientManager));
    const generateCoverageButton: GenerateCoverageButton = new GenerateCoverageButton(ExtensionInfo.name, clientManager);
    context.subscriptions.push(generateCoverageButton);
    context.subscriptions.push(new CoverageOverlay(generateCoverageButton.eventEmitter, dialects));

    // Initialise handlers
    context.subscriptions.push(new AddLibraryHandler(clientManager));
    context.subscriptions.push(new AddRunConfigurationHandler());
    context.subscriptions.push(new AddExampleHandler());
    context.subscriptions.push(new JavaCodeGenHandler(clientManager));
    context.subscriptions.push(new AddToClassPathHandler());

    // Initialise debug handler
    dapSupport.initDebugConfig(context, clientManager);

    // Register commands and event handlers
    context.subscriptions.push(workspace.onDidOpenTextDocument((document: TextDocument) => clientManager.launchClient(document)));
    workspace.textDocuments.forEach((document: TextDocument) => clientManager.launchClient(document));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders((e) => clientManager.stopClients(e.removed), this));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => resetSortedWorkspaceFolders()));
}

export function deactivate(): Thenable<void> | undefined {
    let promises: Thenable<void>[] = [];

    // Hide VDM VS Code buttons
    promises.push(commands.executeCommand("setContext", "vdm-submenus-show", false));

    return Promise.all(promises).then(() => undefined);
}
