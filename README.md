# VDM Language Support in Visual Studio Code

[![License](https://img.shields.io/:license-gpl3-blue.svg?style=flat-square)](http://www.gnu.org/licenses/gpl-3.0.html)
[![Version](https://img.shields.io/visual-studio-marketplace/v/jonaskrask.vdm-vscode)](https://marketplace.visualstudio.com/items?itemName=jonaskrask.vdm-vscode)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/jonaskrask.vdm-vscode)](https://marketplace.visualstudio.com/items?itemName=jonaskrask.vdm-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/jonaskrask.vdm-vscode)](https://marketplace.visualstudio.com/items?itemName=jonaskrask.vdm-vscode)

VDM-VSCode is an extension for Visual Studio Code (VS Code) that provides language support for the VDM dialects VDM-SL, VDM++ and VDM-RT.
The extension utilises a [language server powered by VDMJ](https://github.com/nickbattle/vdmj/tree/master/lsp) that is developed by [Nick Battle](https://github.com/nickbattle).

<img src="https://github.com/jonaskrask/vdm-vscode/raw/development/documentation/screenshots/GUI.png" width="800">

\*If you are used to the Overture Tool IDE and would like to keep that syntax highlighting we suggest that you use the color theme [Eclipse Classic Light](https://marketplace.visualstudio.com/items?itemName=LorenzoBilli.eclipse-classic-light) or another eclipse color theme.

## Wiki
Check out the [wiki](https://github.com/jonaskrask/vdm-vscode/wiki) for the extension for information about how to get started, learning how to use the features, see developer notes and much more!
Find the wiki at: [https://github.com/jonaskrask/vdm-vscode/wiki](https://github.com/jonaskrask/vdm-vscode/wiki)

## Installation

In Visual Studio Code just type @id:jonaskrask.vdm-vscode in the Extensions view Search box or type vdm and select VDM VSCode.

### Requirements

-   [Visual Studio Code ≥ v. 1.49.0](https://code.visualstudio.com/download)
-   [Java ≥ v. 11](https://adoptopenjdk.net/)

## Web extension

For now only the following limited feature set is available in the web version of the extension:

-   Syntax Highlighting
-   Snippets

Thus, most feature contributions relates to the desktop version of the extension.

## Features

-   Syntax Highlighting
-   Syntax- and type-checking
-   Smart navigation
-   Debugging
-   Proof Obligation Generation
-   Combinatiorial Testing
-   Translation to LaTeX and Word
-   Java code generation
-   Dependency graph generation
-   Coverage report
-   Import of project examples
-   Import of VDM libraries
-   Snippets

### Future Work

-   Improve syntax highlighting
-   Improve debugging execution
-   Show all workspace folders in the Combinatorial Testing view

## Usage

Open a folder (single VDM project) or a workspace (multiple VDM projects) and then open a VDM file(`.vdmsl`, `.vdmpp` or `.vdmrt`) from the explorer window. This will automatically start the language server in the background.

[Click here](https://github.com/jonaskrask/vdm-vscode/wiki/Usage-GIFs) for an overview of how to use the features of the extension.

## Settings

This extension contributes a number of settings. [Click here](https://github.com/jonaskrask/vdm-vscode/wiki/Settings) for a detailed overview.

## Publications

Jonas K. Rask, Frederik P. Madsen, Nick Battle, Hugo D. Macedo and Peter G. Larsen,
[Visual Studio Code VDM Support](https://www.researchgate.net/publication/346680627_Visual_Studio_Code_VDM_Support),
The 18th Overture Workshop, December 2020 [[PDF](https://www.researchgate.net/publication/346680627_Visual_Studio_Code_VDM_Support)]

Jonas K. Rask, Frederik P. Madsen, Nick Battle, Hugo D. Macedo and Peter G. Larsen,
[The Specification Language Server Protocol: A Proposal for Standardised LSP Extensions](https://www.researchgate.net/publication/353220633_The_Specification_Language_Server_Protocol_A_Proposal_for_Standardised_LSP_Extensions),
The 6th Workshop on Formal Integrated Development Environment, May 2021 [[PDF](https://cister-labs.pt/f-ide2021/images/preprints/F-IDE_2021_paper_3.pdf)]

Jonas K. Rask and Frederik P. Madsen, [Decoupling of Core Analysis Support for Specification Languages from User Interfaces in Integrated Development Environments](http://dx.doi.org/10.13140/RG.2.2.21889.99686), Master's Thesis, Department of Engineering, Aarhus University, January 2021 [[PDF](http://dx.doi.org/10.13140/RG.2.2.21889.99686)]

## Change Log

See change log [here](CHANGELOG.md).

## Issues

Submit an [issue](https://github.com/jonaskrask/vdm-vscode/issues) if you find a bug or have a suggestion for improving the extension.

## Contributing

Contributions are very welcome. To do so either open an issue or feature request or fork the [repo](https://github.com/jonaskrask/vdm-vscode) and submit a pull request.
For further information see [here](CONTRIBUTING.md).
