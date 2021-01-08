import { ExtensionContext } from "vscode";
import { ClientCapabilities, ServerCapabilities, StaticFeature, WorkDoneProgressOptions} from "vscode-languageclient";
import { CTHandler } from "./CTHandler";
import { ExperimentalCapabilities} from "./protocol.slsp";

export class CombinantorialTestingFeature implements StaticFeature {
    public SupportsCT: boolean = false;
    public SupportsCTWorkDoneProgress: boolean = false;

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports CT
         if (capabilities?.experimental?.combinatorialTestProvider) {
            this.SupportsCT = true;
            
            // Check if support work done progress
            if (WorkDoneProgressOptions.hasWorkDoneProgress(capabilities?.experimental?.combinatorialTestProvider))
                this.SupportsCTWorkDoneProgress = capabilities?.experimental?.combinatorialTestProvider.workDoneProgress                
        }
    }
}