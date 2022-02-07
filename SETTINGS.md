### Translation

-   `vdm-vscode.translate.general.storeAllTranslations`: If enabled stores each translation in a timestamped folder instead of overwriting the previouse content.
-   `vdm-vscode.translate.general.allowSingleFileTranslation`: If enabled, translates only the selected file. If disabled, translate is always applied to the whole project.

#### Translate to LaTeX

-   `vdm-vscode.translate.latex.modelOnly`: Only model part will be included in the Latex translation, i.e., everything enclosed within '\begin{vdm_al}' and '\end{vdm_al}'.
-   `vdm-vscode.translate.latex.markCoverage`: Mark coverage in the Latex translation.
-   `vdm-vscode.translate.latex.insertCoverageTables`: Insert coverage tables in the Latex translation.

### Java Code Generation

-   `vdm-vscode.javaCodeGen.disableCloning`: Disable cloning (may lead to code being generated that does not preserve the semantics of the input specification).
-   `vdm-vscode.javaCodeGen.sequencesAsStrings`: Generate character sequences as strings.
-   `vdm-vscode.javaCodeGen.concurrencyMechanisms`: Generate concurrency mechanisms.
-   `vdm-vscode.javaCodeGen.vdmLocationInformation`: Generate VDM location information for code generated constructs.
-   `vdm-vscode.javaCodeGen.outputPackage`: Choose output package e.g : my.code.
-   `vdm-vscode.javaCodeGen.skipClassesModules`: Skip classes/modules during the code generation process. Separate by ';' e.g : World;Env.

### Server

-   `vdm-vscode.server.highPrecision`: Use high precision server that use more memory for variables ("on" or "off").
-   `vdm-vscode.server.logLevel`: Log server actions at different levels.
-   `vdm-vscode.server.JVMArguments`: Arguments for the JVM that is executing the server (e.g. -Xmx2g).
-   `vdm-vscode.server.classPathAdditions`: Array of folders and/or jar file paths that should be used with the language server.

#### Development

-   `vdm-vscode.server.development.experimentalServer`: Use an experimental/external server. If enabled the client will not launch a server but instead connect to one that is running in another process. E.g. executing the VDMJ server in a debugger.
-   `vdm-vscode.server.development.lspPort`: Port used for the LSP/SLSP connection when `experimentalServer` is enabled.

#### Standard I/O

-   `vdm-vscode.server.stdio.activateStdoutLogging`: Activate logging of stdout/stderr to terminal window.
-   `vdm-vscode.server.stdio.stdioLogPath`: File path for directory that should be used to store stdout/stderr logs. If empty, terminal logging is used instead of file logging.

### Coverage

-   `vdm-vscode.coverage.OverlayLatestCoverage`: If enabled then the latest generated coverage report is utilised for overlaying. Otherwise the user is prompted for which coverage report should be used for overlaying.
-   `vdm-vscode.coverage.UseHeatmapColouring`: If enabled then the number of hits (larger than zero) for a given code section corresponds to a brighter green. Otherwise all sections with any number of hits (larger than zero) are colored the same green.

### Libraries

-   `vdm-vscode.server.libraries.VDM-Libraries`: A list containing library jar paths. Adding a folder path will load all library jars in the folder.
-   `vdm-vscode.server.libraries.includeDefaultLibraries`: Include the default libraries that are packaged with the extension.

### Miscellaneous

-   `vdm-vscode.encoding.showWarning`: If enabled, shows a warning if document encoding is not UTF-8.
-   `vdm-vscode.trace.server`: Enables tracing of communication between VS Code and the VDMJ language server. The trace may contain file paths, source code, and other potentially sensitive information from your project.
