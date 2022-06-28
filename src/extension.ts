// SPDX-License-Identifier: GPL-3.0-or-later

import * as languageId from "./slsp/protocol/TranslationLanguageId";
import * as ExtensionInfo from "./ExtensionInfo";
import {
    ExtensionContext,
    window,
    workspace,
    commands,
    TextDocument,
    WorkspaceFolder,
    WorkspaceFoldersChangeEvent,
    StatusBarAlignment,
    StatusBarItem,
} from "vscode";
import { VdmDapSupport as dapSupport } from "./dap/VdmDapSupport";
import { VdmjCTFilterHandler } from "./vdmj/VdmjCTFilterHandler";
import { VdmjCTInterpreterHandler } from "./vdmj/VdmjCTInterpreterHandler";
import { AddLibraryHandler } from "./handlers/AddLibraryHandler";
import { AddRunConfigurationHandler } from "./handlers/AddRunConfigurationHandler";
import { AddExampleHandler } from "./handlers/ImportExampleHandler";
import { JavaCodeGenHandler } from "./handlers/JavaCodeGenHandler";
import { AddToClassPathHandler } from "./handlers/AddToClassPathHandler";
import { ProofObligationPanel } from "./slsp/views/ProofObligationPanel";
import { TranslateButton } from "./slsp/views/translate/TranslateButton";
import { GenerateCoverageButton } from "./slsp/views/translate/GenerateCoverageButton";
import { CoverageOverlay } from "./slsp/views/translate/CoverageOverlay";
import { CombinatorialTestingView } from "./slsp/views/combinatorialTesting/CombinatorialTestingView";
import { ClientManager } from "./ClientManager";
import { ServerFactory } from "./server/ServerFactory";
import { vdmFileExtensions, guessDialect, vdmDialects, vdmFilePattern } from "./util/DialectUtil";
import { resetSortedWorkspaceFolders } from "./util/WorkspaceFoldersUtil";
import { ServerLog } from "./server/ServerLog";
import { OpenVDMToolsHandler } from "./handlers/OpenVDMToolsHandler";
import { ChangeVdmjPropertiesHandler } from "./handlers/ChangeVdmjPropertiesHandler";
import * as Util from "./util/Util";
import { RTLogViewHandler } from "./handlers/RTLogViewHandler";
import { FMUHandler } from "./handlers/FMUHandler";

let clientManager: ClientManager;

export async function activate(context: ExtensionContext) {
    // Setup server factory
    let serverFactory: ServerFactory;
    try {
        serverFactory = new ServerFactory(new ServerLog(context.logUri));
    } catch (e) {
        window.showErrorMessage(e);
        return; // Can't create servers -> no reason to continue
    }

    // Setup client manager
    clientManager = new ClientManager(serverFactory, vdmFileExtensions, vdmFilePattern);
    context.subscriptions.push(clientManager);

    // Keep track of VDM workspace folders
    const knownVdmFolders: Map<WorkspaceFolder, vdmDialects> = new Map<WorkspaceFolder, vdmDialects>();
    if (workspace.workspaceFolders) {
        const workspaceFolders: WorkspaceFolder[] = new Array<WorkspaceFolder>(...workspace.workspaceFolders)
            .sort((a, b) => b.name.localeCompare(a.name))
            .reverse();
        for await (const wsFolder of workspaceFolders) {
            await guessDialect(wsFolder)
                .then((dialect: vdmDialects) => knownVdmFolders.set(wsFolder, dialect))
                .catch(() => {});
        }
    }
    context.subscriptions.push(
        workspace.onDidChangeWorkspaceFolders(async (e: WorkspaceFoldersChangeEvent) => {
            e.added.forEach((wsFolder) => {
                guessDialect(wsFolder)
                    .then((dialect: vdmDialects) => knownVdmFolders.set(wsFolder, dialect))
                    .catch(() => {});
            });
            e.removed.forEach((wsFolder) => {
                if (knownVdmFolders.has(wsFolder)) {
                    knownVdmFolders.delete(wsFolder);
                }
            });
        })
    );

    // Show VDM VS Code buttons
    commands.executeCommand("setContext", "vdm-submenus-show", true);

    // Initialise SLSP UI items // TODO Find better place for this (perhaps create a UI class that takes care of stuff like this)
    context.subscriptions.push(new ProofObligationPanel(context, clientManager));
    context.subscriptions.push(
        new CombinatorialTestingView(clientManager, knownVdmFolders, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler())
    );
    context.subscriptions.push(new TranslateButton(languageId.latex, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.word, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.graphviz, ExtensionInfo.name, clientManager));
    context.subscriptions.push(new TranslateButton(languageId.isabelle, ExtensionInfo.name, clientManager));
    const generateCoverageButton: GenerateCoverageButton = new GenerateCoverageButton(ExtensionInfo.name, clientManager);
    context.subscriptions.push(generateCoverageButton);
    context.subscriptions.push(new RTLogViewHandler(context, knownVdmFolders));
    context.subscriptions.push(new CoverageOverlay(generateCoverageButton.eventEmitter, vdmFileExtensions));

    // Initialise handlers
    context.subscriptions.push(new AddLibraryHandler(clientManager));
    context.subscriptions.push(new AddRunConfigurationHandler());
    context.subscriptions.push(new AddExampleHandler());
    context.subscriptions.push(new JavaCodeGenHandler(clientManager));
    context.subscriptions.push(new AddToClassPathHandler());
    context.subscriptions.push(new OpenVDMToolsHandler(knownVdmFolders));
    context.subscriptions.push(new ChangeVdmjPropertiesHandler(knownVdmFolders));
    context.subscriptions.push(new FMUHandler());

    // Initialise debug handler
    dapSupport.initDebugConfig(context, clientManager);

    // Create a new status bar item
    const hpStatusBarItem: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
    hpStatusBarItem.text = `HP`;
    hpStatusBarItem.tooltip = "High precision mode is active for this project";
    // Go to the setting on click
    hpStatusBarItem.command = {
        command: "workbench.action.openSettings",
        arguments: ["vdm-vscode.server.highPrecision"],
        title: "Go to settings",
    };
    context.subscriptions.push(hpStatusBarItem);

    // Monitor if the active server for the active client is spawned with high precision jar to display the high precision inidcator for the project.
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
                setHighPrecisionStatus(hpStatusBarItem, wsFolder && clientManager.isHighPrecisionClient(clientManager.get(wsFolder)));
            }
        })
    );

    // Register commands and event handlers
    context.subscriptions.push(workspace.onDidOpenTextDocument((document: TextDocument) => clientManager.launchClient(document)));
    workspace.textDocuments.forEach((document: TextDocument) => clientManager.launchClient(document));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders((e) => clientManager.stopClients(e.removed), this));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => resetSortedWorkspaceFolders()));

    // Add settings watch
    workspace.onDidChangeConfiguration(
        (event) => {
            // Restart the extension if changes has been made to the server settings
            if (event.affectsConfiguration("vdm-vscode.server") || event.affectsConfiguration("files.encoding")) {
                // Ask the user to restart the extension if setting requires a restart
                Util.showRestartMsg("Configurations changed. Please reload VS Code to enable it.");
            }
        },
        this,
        context.subscriptions
    );

    // Set high precision inidcator for any project that opens emidiatly with VS Code.
    if (window.activeTextEditor) {
        const wsFolder: WorkspaceFolder = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
        setHighPrecisionStatus(hpStatusBarItem, wsFolder && clientManager.isHighPrecisionClient(clientManager.get(wsFolder)));
    }
}

function setHighPrecisionStatus(statusBarItem: StatusBarItem, isHighPrecision: boolean) {
    if (isHighPrecision) {
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

export async function deactivate() {
    // Make sure that the extension sends the client/shutDown message to the server before deactivation
    for (const client of clientManager.getAllClients()) {
        await client.stop();
    }

    // Hide VDM buttons
    await commands.executeCommand("setContext", "vdm-submenus-show", false);
}
