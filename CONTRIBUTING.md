# Contributing

## How to Contribute
Start by opening an issue or propose a change by submitting a pull request (including a detailed pull request description).

## Running the Project
1. Install [npm](https://docs.npmjs.com/cli/v6/commands/npm-install)
1. Install [Java version >= 11](https://adoptopenjdk.net/)
1. Change directory to the root of the project
1. Install node modules: `npm install`

## Install From VSIX
You may want to package the project yourself this is done using:
1. Installing vsce: `npm install -g vsce`
1. Packageing the extension: `vsce package`

To install the package in VS Code:
In VS Code under "Extensions -> Views and More actions... -> Install from VSIX" locate the .vsix file in the VDM-VSCode extension folder, choose the file and click install. This will install the extension or update it if an older version is already present.

## Using the Latest Server SNAPSHOTS
The language server utilised by the VDM-VSCode extension may not be the latest. 
See https://github.com/nickbattle/vdmj to find the newest version. 
To update the language server manually, package the vdmj and lsp projects into jar files and copy the snapshots into the ...\vdm-vscode\resources\jars folder and delete the old ones. Next time VS Code is started the extension will use the new jars.