# VDM language support in Visual Studio Code
Extensions for Visual Studio Code that provides language support for the VDM dialects VDM-SL, VDM++ and VDM-RT.
The extensions provide language support using the Language Server Protocol (LSP) by connecting to the server developed by Nick Battle in [VDMJ](https://github.com/nickbattle/vdmj).

To use, open a VDM file(.vdmsl, .vdmpp or .vdmrt). The language server will then automatically launch in the background.

To use the debugger open the file that you want to debug, this will launch the server. With the server running you can launch the debugger, by default the debugger will launch the VDMJ interpreter from where you can debug specifications. 
For further explanation on the features see [here](https://github.com/nickbattle/vdmj/tree/master/LSP).
