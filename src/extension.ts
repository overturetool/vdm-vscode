// SPDX-License-Identifier: GPL-3.0-or-later

import * as languageId from "./slsp/protocol/TranslationLanguageId";
import * as ExtensionInfo from "./ExtensionInfo";
import { ExtensionContext, window, workspace, commands, TextDocument, WorkspaceFolder, WorkspaceFoldersChangeEvent } from "vscode";
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
import { dialectToExtensions, guessDialect, vdmDialects, vdmFilePattern } from "./util/DialectUtil";
import { resetSortedWorkspaceFolders } from "./util/WorkspaceFoldersUtil";
import { ServerLog } from "./server/ServerLog";
import { OpenVDMToolsHandler } from "./handlers/OpenVDMToolsHandler";

let clientManager: ClientManager;

export function activate(context: ExtensionContext) {
    // Setup server factory
    let serverFactory: ServerFactory;
    try {
        serverFactory = new ServerFactory(new ServerLog(context.logUri));
    } catch (e) {
        window.showErrorMessage(e);
        return; // Can't create servers -> no reason to continue
    }

    // File extension types aka language ids that can be handled
    const acceptedLanguageIds: string[] = Array.from(dialectToExtensions.values()).reduce((prev, cur) => {
        return prev.concat(cur);
    });

    // Setup client manager
    clientManager = new ClientManager(serverFactory, acceptedLanguageIds, vdmFilePattern);
    context.subscriptions.push(clientManager);

    // Keep track of VDM workspace folders
    const knownVdmFolders: Map<WorkspaceFolder, vdmDialects> = new Map<WorkspaceFolder, vdmDialects>();
    workspace.workspaceFolders.forEach((wsFolder) =>
        guessDialect(wsFolder)
            .then((dialect: vdmDialects) => knownVdmFolders.set(wsFolder, dialect))
            .catch(() => {})
    );
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
    context.subscriptions.push(new CoverageOverlay(generateCoverageButton.eventEmitter, acceptedLanguageIds));

    // Initialise handlers
    context.subscriptions.push(new AddLibraryHandler(clientManager));
    context.subscriptions.push(new AddRunConfigurationHandler());
    context.subscriptions.push(new AddExampleHandler());
    context.subscriptions.push(new JavaCodeGenHandler(clientManager));
    context.subscriptions.push(new AddToClassPathHandler());
    context.subscriptions.push(new OpenVDMToolsHandler(knownVdmFolders));

    // Initialise debug handler
    dapSupport.initDebugConfig(context, clientManager);

    // Register commands and event handlers
    context.subscriptions.push(workspace.onDidOpenTextDocument((document: TextDocument) => clientManager.launchClient(document)));
    workspace.textDocuments.forEach((document: TextDocument) => clientManager.launchClient(document));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders((e) => clientManager.stopClients(e.removed), this));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => resetSortedWorkspaceFolders()));
}

export async function deactivate() {
    // Make sure that the extension sends the client/shutDown message to the server before deactivation
    for (const client of clientManager.getAllClients()) {
        await client.stop();
    }

    // Hide VDM buttons
    await commands.executeCommand("setContext", "vdm-submenus-show", false);
}
