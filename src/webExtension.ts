import { ExtensionContext } from "vscode";

// This class is the target of "entry" in webpack.config.js. and "browser" in package.json. This builds and exposes parts of the extension as a web extension.
// However, the web extension only supports simple syntax highlighting and snippets (see issue #89) so there is no need to do anything here..
export function activate(context: ExtensionContext) {}
