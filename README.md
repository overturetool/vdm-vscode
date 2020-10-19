# VDM language support in Visual Studio Code
Extensions for Visual Studio Code that provides language support for the VDM dialects VDM-SL, VDM++ and VDM-RT.
The extensions provide language support using the Language Server Protocol (LSP) by connecting to the server developed by Nick Battle in [VDMJ](https://github.com/nickbattle/vdmj).

To use, open a VDM file(.vdmsl, .vdmpp or .vdmrt). The language server will then automatically launch in the background.

To use the debugger open the file that you want to debug, this will launch the server. With the server running you can launch the debugger, by default the debugger will launch the VDMJ interpreter from where you can debug specifications. 
For further explanation on the features see [here](https://github.com/nickbattle/vdmj/tree/master/LSP).

The syntax highlighting is borrowed from [Futa Hirahoba](https://github.com/korosuke613/vdmpp-vscode-extension)

***Note:** The extension is a working progress and may contain errors*

## Installing the Extension
There are several different ways to install the extensions, some of these are listed below

### Marketplace
Eventually the extensions will be published on the marketplace, but this is not the case yet.

### Install from VSIX
In the extension folders you will find VSIX files containing packaged versions of the extensions (Note that the VSIX files are not always up-to-date with the latest commit).
In VS Code under "Extensions -> Views and More actions... -> Install from VSIX" you can select the extension VSIX file, which will install the extension.

### Cloning git repo
To install the extensions by cloning the git repo you must 

* Navigate to the VS Code extensions folder into: ...\Microsoft VS Code\resources\app\extensions.
* Copy the VDM extension folder (e.g. 'vdmsl') into the VS Code extensions folder 
* Open the VDM extension folder (e.g. ```cd vdmsl```)
* Run the following bash commands in the VDM extension folder: ```npm install & npm run compile```


