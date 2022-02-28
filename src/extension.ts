// SPDX-License-Identifier: GPL-3.0-or-later

import * as languageId from "./slsp/protocol/LanguageId";
import * as encoding from "./Encoding";
import * as ExtensionInfo from "./ExtensionInfo";
import { ExtensionContext, TextDocument, window, workspace, commands } from "vscode";
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
import { Clients } from "./Clients";
import { ServerFactory } from "./server/ServerFactory";
import { dialects } from "./util/Dialect";
import { getOuterMostWorkspaceFolder, resetSortedWorkspaceFolders } from "./util/WorkspaceFolders";
import { ServerLog } from "./server/ServerLog";

export function activate(context: ExtensionContext) {
    // Setup server factory
    let serverFactory: ServerFactory;
    try {
        serverFactory = new ServerFactory(new ServerLog(context.logUri));
    } catch (e) {
        window.showErrorMessage(e);
        return; // Can't create servers -> no reason to continue
    }

    // Setup client storage
    let _clients = new Clients(serverFactory);
    context.subscriptions.push(_clients);

    // Show VDM VS Code buttons
    commands.executeCommand("setContext", "vdm-submenus-show", true);

    // Initialise SLSP UI items // TODO Find better place for this (perhaps create a UI class that takes care of stuff like this)
    context.subscriptions.push(new ProofObligationPanel(context));
    context.subscriptions.push(new CombinatorialTestingView(new VdmjCTFilterHandler(), new VdmjCTInterpreterHandler()));
    context.subscriptions.push(new TranslateButton(languageId.latex, ExtensionInfo.name));
    context.subscriptions.push(new TranslateButton(languageId.word, ExtensionInfo.name));
    context.subscriptions.push(new TranslateButton(languageId.graphviz, ExtensionInfo.name));
    context.subscriptions.push(new TranslateButton(languageId.isabelle, ExtensionInfo.name));
    const generateCoverageButton: GenerateCoverageButton = new GenerateCoverageButton(ExtensionInfo.name);
    context.subscriptions.push(generateCoverageButton);
    context.subscriptions.push(new CoverageOverlay(generateCoverageButton.eventEmitter, dialects));

    // Initialise handlers
    context.subscriptions.push(new AddLibraryHandler(_clients));
    context.subscriptions.push(new AddRunConfigurationHandler());
    context.subscriptions.push(new AddExampleHandler());
    context.subscriptions.push(new JavaCodeGenHandler(_clients));
    context.subscriptions.push(new AddToClassPathHandler());

    // Initialise debug handler
    dapSupport.initDebugConfig(context);

    // Register commands and event handlers
    context.subscriptions.push(workspace.onDidOpenTextDocument(didOpenTextDocument));
    workspace.textDocuments.forEach(didOpenTextDocument);
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders((e) => _clients.stopClients(e.removed), this));
    context.subscriptions.push(workspace.onDidChangeWorkspaceFolders(() => resetSortedWorkspaceFolders()));

    function didOpenTextDocument(document: TextDocument): void {
        // We are only interested in vdm text
        if (!dialects.find((languageId) => languageId == document.languageId)) {
            return;
        }

        // Check that the document encoding matches the encoding setting
        encoding.checkEncoding(document);

        const uri = document.uri;
        let folder = workspace.getWorkspaceFolder(uri);
        // Files outside a folder can't be handled.
        if (!folder) {
            // TODO remove if we get support for single file workspace
            return;
        }
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = getOuterMostWorkspaceFolder(folder);

        // Start client for the folder
        _clients.launchClient(folder, document.languageId);
    }
}

export function deactivate(): Thenable<void> | undefined {
    let promises: Thenable<void>[] = [];

    // Hide VDM VS Code buttons
    promises.push(commands.executeCommand("setContext", "vdm-submenus-show", false));

    return Promise.all(promises).then(() => undefined);
}
