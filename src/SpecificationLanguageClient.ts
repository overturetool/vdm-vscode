// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import * as LanguageId from "./LanguageId";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";
import * as util from "./Util"

export class SpecificationLanguageClient extends LanguageClient {
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri;
    public readonly projectSavedDataUri = util.joinUriPath(this.projectRoot, ".generated");
    public readonly logPath: string;
    public readonly language: string;

    constructor(id: string, name: string, language: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, private readonly _context: ExtensionContext, public readonly dataStoragePath: Uri, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this.language = language;
        this.logPath = path.resolve(this._context.logUri.fsPath, `${name}.log`);
        util.ensureDirectoryExistence(this.logPath);
        this.registerFeatures([
            new ProofObligationGenerationFeature(this),
            new CombinantorialTestingFeature(),
            new TranslateFeature(LanguageId.latex),
            new TranslateFeature(LanguageId.word),
            new TranslateFeature(LanguageId.coverage),
            new TranslateFeature(LanguageId.graphviz),
            new TranslateFeature(LanguageId.isabelle),
        ]);
    }
}
