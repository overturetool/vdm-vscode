import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
//import * as vdmvscode from "../../extension";

suite("Extension Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.");

    test("Extension Exists", () => {
        assert.ok(vscode.extensions.getExtension("overturetool.vdm-vscode") !== undefined);
    });

    test("Extension Name is Correct", () => {
        assert.equal(vscode.extensions.getExtension("overturetool.vdm-vscode").id, "overturetool.vdm-vscode");
    });

    test("Extension Activates", () => {
        vscode.extensions
            .getExtension("overturetool.vdm-vscode")
            .activate()
            .then(() => {
                assert.ok(vscode.extensions.getExtension("jonaskrask.vdm-vscode").isActive);
            });
    });
});
