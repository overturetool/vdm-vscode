// SPDX-License-Identifier: GPL-3.0-or-later

import * as languageId from "./slsp/protocol/TranslationLanguageId";
import * as ExtensionInfo from "./ExtensionInfo";
import { ExtensionContext, window, workspace, commands, TextDocument } from "vscode";
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
import { dialectExtensions, vdmWorkspaceFilePattern } from "./util/DialectUtil";
import { resetSortedWorkspaceFolders } from "./util/WorkspaceFoldersUtil";
import { ServerLog } from "./server/ServerLog";
import { OpenVDMToolsHandler } from "./OpenVDMToolsHandler";

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
    const acceptedLanguageIds: string[] = Array.from(dialectExtensions.values()).reduce((prev, cur) => {
        return prev.concat(cur);
    });

    // Setup client manager
    const clientManager: ClientManager = new ClientManager(serverFactory, acceptedLanguageIds, vdmWorkspaceFilePattern);
    context.subscriptions.push(clientManager);

    // Show VDM VS Code buttons
    commands.executeCommand("setContext", "vdm-submenus-show", true);

    // Initialise SLSP UI items // TODO Find better place for this (perhaps create a UI class that takes care of stuff like this)
    context.subscriptions.push(new ProofObligationPanel(context));
    context.subscriptions.push(
        new CombinatorialTestingView(clientManager, vdmWorkspaceFilePattern, new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler())
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
    context.subscriptions.push(new OpenVDMToolsHandler());

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
