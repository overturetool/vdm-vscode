# VDM Language Support in Visual Studio Code
Extension for Visual Studio Code (VS Code) that provides language support for the VDM dialects VDM-SL, VDM++ and VDM-RT.
The extension provides language support by connecting to the server developed by Nick Battle in [VDMJ](https://github.com/nickbattle/vdmj).
The communication between the extension and the server is carried out using the Specification Language Server Protocol (SLSP), which is an extension to the Language Server Protocol (LSP), and the Debug Adapter Protocol (DAP).

To use, open folder containing a VDM file(.vdmsl, .vdmpp or .vdmrt). The language server will then automatically launch in the background.

To use the debugger, open the file that you want to debug, this will launch the server. With the server running you can launch the debugger, by default the debugger will launch the VDMJ interpreter from where you can debug specifications. 
For further explanation on the features see [here](https://github.com/nickbattle/vdmj/tree/master/LSP).


## Requirements
* [VS Code ≥ v. 1.49.0](https://code.visualstudio.com/download)
* [Java ≥ v. 11](https://adoptopenjdk.net/)

## Features
* Syntax Highlighting
* Syntax- and type-checking
* Smart navigation
* Debugging
* Proof Obligation Generation
* Combinatiorial Testing
* Translation to LaTeX and Word

### Future Work
* Improve debugging execution
* Include coverage report
* Show all workspace folders in the Combinatorial Testing view

## Usage

[//]: # (Insert gifs and stuff here that explains how to use the extension)


### Debugging Using the Extension
To use the debugger, open the file that you want to debug, this will launch the server. With the server running you can launch the debugger, by default the debugger will launch the VDMJ interpreter from where you can debug specifications. 
When debugging VDM projects the extensions launches a VDMJ terminal. To execute a specification the VDMJ format must be used, an explanation of this can be found [here](https://github.com/nickbattle/vdmj/tree/master/LSP).


## Installing the Extension
There are several different ways to install the extensions, some of these are listed below

### Marketplace
Eventually the extensions will be published on the marketplace, but this is not the case yet.

### Install From VSIX
In the extension folders you will find VSIX files containing packaged versions of the extensions (Note that the VSIX files are not always up-to-date with the latest commit).
In VS Code under "Extensions -> Views and More actions... -> Install from VSIX" you can select the extension VSIX file, which will install the extension.

### Cloning Git Repository
To install the extensions by cloning the git repo you must 

1. Run the following bash commands in the VDM extension folder: ```npm install & npm run compile```. (*It is important that this performed **before** the following steps, such that all the necessary files are available in the extension folder*)
1. Navigate to the VS Code extensions folder into: ...\Microsoft VS Code\resources\app\extensions.
1. Copy the VDM extension folder (i.e. 'vdm-vscode') into the VS Code extensions folder.

## VS Code Settings
This extension contributes the following settings:
*
*

[//]: # (Insert the settings..)

## Using the Latests Server SNAPSHOTS
The server available on the VS Code Marketplace may not be the latests. 
See https://github.com/nickbattle/vdmj to find the latest version. 
To use it package the project into jar files and copy the snapshots into the ...\vdm-vscode\resources\jars folder and delete the old ones. Next time VS Code is started the extension will use the new jars.

## Publications
Jonas K. Rask, Frederik P. Madsen, Nick Battle, Hugo D. Macedo and Peter G. Larsen, 
[Visual Studio Code VDM Support](https://www.researchgate.net/publication/346680627_Visual_Studio_Code_VDM_Support),
The 18th Overture Workshop, December 2020 [[PDF](https://www.researchgate.net/publication/346680627_Visual_Studio_Code_VDM_Support)]

## Change Log
See change log [here](CHANGELOG.md)

## Issues
Submit the [issue](https://github.com/jonaskrask/vdm-vscode/issues) if you find a bug or have a suggestion for improving the extension.

## Contributing
Contributions are very welocome, to do so: Fork the [repo](https://github.com/jonaskrask/vdm-vscode) and submit pull requests.
