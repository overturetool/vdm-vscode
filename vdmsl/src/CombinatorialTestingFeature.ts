import { Disposable, ExtensionContext, Uri } from "vscode";
import { ClientCapabilities, ServerCapabilities, StaticFeature } from "vscode-languageclient";
import { ExperimentalCapabilities } from "./protocol.lspx";
import { SpecificationLanguageClient } from "./SpecificationLanguageClient";

export class CombinantorialTestingFeature implements StaticFeature {
    private _client: SpecificationLanguageClient;
    private _context: ExtensionContext;
    private _runPOGDisp: Disposable;
    private _lastUri: Uri;

    constructor(client: SpecificationLanguageClient, context: ExtensionContext) {
        this._client = client;
        this._context = context;
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if(!capabilities.experimental)
            capabilities.experimental = { combinatorialTesting: true };
        else
            Object.assign(capabilities.experimental, {combinatorialTesting: true});
    }

    initialize(capabilities: ServerCapabilities<ExperimentalCapabilities>): void {
        // If server supports POG
        
    }
}