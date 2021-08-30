// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";
import * as Util from "./Util"

export class SpecificationLanguageClient extends LanguageClient {
    public static readonly latexLanguageId = "latex"; // See the LSP specification for alternative language ids
    public static readonly wordLanguageId = "word"; // See the LSP specification for alternative language ids
    public static readonly covLanguageId = "coverage";
    public static readonly graphvizLanguageId = "dependencies" // TODO use another language id
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri; 
    public readonly projectSavedDataPath = Uri.joinPath(this.projectRoot, ".generated");
    public readonly logPath;
    public readonly dialect;

    constructor(id: string, name: string, dialect: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, private readonly _context: ExtensionContext, public readonly dataStoragePath:Uri, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this.dialect = dialect;
        this.logPath = path.resolve(this._context.logUri.fsPath, `${name}.log`);
        Util.ensureDirectoryExistence(this.logPath);
        this.registerFeatures([ 
            new ProofObligationGenerationFeature(this, this._context), 
            new CombinantorialTestingFeature(),
            new TranslateFeature(SpecificationLanguageClient.latexLanguageId),
            new TranslateFeature(SpecificationLanguageClient.wordLanguageId),
            new TranslateFeature(SpecificationLanguageClient.covLanguageId),
            new TranslateFeature(SpecificationLanguageClient.graphvizLanguageId)
        ]);
    }
}
