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
    public readonly name: string;
    public readonly dataStoragePath: Uri

    constructor(
        name: string,
        language: string,
        serverOptions: ServerOptions,
        clientOptions: LanguageClientOptions,
        context: ExtensionContext,
        dataStoragePath: Uri,
        forceDebug?: boolean) {
        super(name, serverOptions, clientOptions, forceDebug);
        this.name = name;
        this.language = language;
        this.dataStoragePath = dataStoragePath;
        this.logPath = path.resolve(context.logUri.fsPath, `${name}.log`);
        util.ensureDirectoryExistence(this.logPath);
    };

    registerBuiltinFeatures() {
        super.registerBuiltinFeatures();
        this.registerFeature(new ProofObligationGenerationFeature(this));
        this.registerFeature(new CombinantorialTestingFeature());
        this.registerFeature(new TranslateFeature(this, LanguageId.latex));
        this.registerFeature(new TranslateFeature(this, LanguageId.word));
        this.registerFeature(new TranslateFeature(this, LanguageId.coverage));
        this.registerFeature(new TranslateFeature(this, LanguageId.graphviz));
        this.registerFeature(new TranslateFeature(this, LanguageId.isabelle));
    }
}