// SPDX-License-Identifier: GPL-3.0-or-later

import path = require("path");
import { ExtensionContext, Uri } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient";
import { CombinantorialTestingFeature } from "./CombinatorialTestingFeature";
import * as LanguageId from "./LanguageId";
import { LensRefreshFeature } from "./LensRefreshFeature";
import { ProofObligationGenerationFeature } from "./ProofObligationGenerationFeature";
import { TranslateFeature } from "./TranslateFeature";
import * as Util from "./Util"

export class SpecificationLanguageClient extends LanguageClient {
    public readonly projectRoot = this.clientOptions.workspaceFolder.uri;
    public readonly projectSavedDataUri = Uri.joinPath(this.projectRoot, ".generated");
    public readonly logPath: string;
    public readonly language: string;

    constructor(id: string, name: string, language: string, serverOptions: ServerOptions, clientOptions: LanguageClientOptions, private readonly _context: ExtensionContext, public readonly dataStoragePath: Uri, forceDebug?: boolean) {
        super(id, name, serverOptions, clientOptions, forceDebug);
        this.language = language;
        this.logPath = path.resolve(this._context.logUri.fsPath, `${name}.log`);
        Util.ensureDirectoryExistence(this.logPath);
        this.registerFeatures([
            new ProofObligationGenerationFeature(this, this._context),
            new CombinantorialTestingFeature(),
            new TranslateFeature(LanguageId.latex),
            new TranslateFeature(LanguageId.word),
            new TranslateFeature(LanguageId.coverage),
            new TranslateFeature(LanguageId.graphviz),
            new TranslateFeature(LanguageId.isabelle),
            new LensRefreshFeature(this) // TODO Delete if codeLens.refresh support is added to VS Code
        ]);
    }
}
