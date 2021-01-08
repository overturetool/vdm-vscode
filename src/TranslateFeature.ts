import { commands } from "vscode";
import { ClientCapabilities, DocumentSelector, ServerCapabilities, StaticFeature, WorkDoneProgressOptions } from "vscode-languageclient";
import { ExperimentalCapabilities } from "./protocol.slsp";

export class TranslateFeature implements StaticFeature {
    public supportWorkDone: boolean = false;

    constructor(
        private readonly languageKind: string) {
    }
    
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        // Client supports Translate
        if(!capabilities.experimental)
            capabilities.experimental = { translateProvider: true };
        else
            Object.assign(capabilities.experimental, {translateProvider: true});
    }
    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>, _documentSelector: DocumentSelector): void {
        // If server supports Translate
        if (capabilities?.experimental?.translateProvider) {
            if (typeof capabilities.experimental.translateProvider != "boolean"){
                if (capabilities.experimental.translateProvider.languageId?.includes(this.languageKind))
                    // Only register commands for the ones that the server says it can
                    commands.executeCommand( 'setContext', 'tr-'+this.languageKind+'-show-button', true );
            }

            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(capabilities?.experimental?.translateProvider))
                this.supportWorkDone = capabilities?.experimental?.translateProvider.workDoneProgress
        }
    }
}