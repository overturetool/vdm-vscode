### 1.4.0-beta.4
- Add visual progress indicator when QuickCheck is running.
- Show cancel button instead of "Run QuickCheck" during long-running QuickCheck.

### 1.4.0-beta.3
- QuickCheck now only runs on the visible subset of proof obligations.
- Fixed bug where QuickCheck info would become stale when changing settings and subsequently running QuickCheck. 

### 1.4.0-beta.2
- Fix char literals syntax highlighting (issue #190)
- Fix name of generated debug configuration (issue #214)
- Fix code lenses on polymorphic functions (issue #188)
- Add the ability to configure QuickCheck using JSON

### 1.4.0-beta.1
- Updated VDMJ to 4.6.0-SNAPSHOT
- Added QuickCheck plugin 4.6.0-SNAPSHOT
- Rewrite of Proof Obligation webview using React.
- Added QuickCheck functionality into Proof Obligation view.

### 1.3.7
- Hotfix to VDMJ to support Java 19
- Updates UML Plugin jar to 0.1.1 including typing abstraction

### 1.3.6
- Hotfix to uml plugin jar: fixes stereotypes not translating correctly to VDM

### 1.3.5
- Added VDM to (Plant) UML translation feature
- Added VDMJ 1.5.0 features (Analysis plugins,...)

### 1.3.4
- Added Real-Time-Logger View 
- Fixed Hover of variables in the debug
- Added groups to settings
- Added highprecision indicator to the status bar
- Added tracing of DAP messages in the terminal 
- Added precision to the launch configuration settings
- Added default file nesting for sources like word files
- Added extracting of embedded VDM in external sources

### 1.3.3
- Updated the publisher name (Breaks settings! Workaround: Replace 'jonaskrask.xyz' to 'overturetool.xyz')
- Added Open in VDMTools Feature
- Added FMI Import/Export features (Port from Overture codebase)
- Added "Change Project Wide VDMJ Properties" Command
- Added a .vscode/vdmignore file to ignore selected files
- Enabled user-provided commands for the debug console
- Added a "state init" proof obligation
- Added support for doc, docx, odt and adoc and md source files
- Added Shift-F12 "find references" functionality

### 1.3.2
- Added additional options and buttons to the combinatorial testing view
- Added partly migration to Web extension 
- Improved the inline coverage display
- Improved the look of the POG view
- Changed library import to support dynamic inclusion from jar files
- Changed logging to console output
- Large refactoring of SLSP features
- Fixed POG view update bug
- Fixes to VDMJ

### 1.3.1
- Added VDMUnit lib
- Added translation settings
- Changed POG View's "proved" with "status"
- Improved completion suggestions
- Improved Server logging
- Improved Debug Watch
- Improved file encodidin support
- Removed dependency on portfinder
- Fixes to VDMJ

### 1.3.0
- Added Launch and Debug code lenses
- Added code snippets (template expansion)
- Added support for Remote Control class
- Added coverage reporting to Latex
- Added Java Gen. options
- Improved breakpoint support
- Improved import example interface
- Changed annotations path setting to class path setting, and improved UI in settings
- Changed names for server related settings
- Correction to IO lib
- Fixes to VDMJ

### 1.2.1
- Fixes to debug launching
- Added dependency graph generation
- Improved CT result filtering

### 1.2.0
- Improved outline view
- Fixes to MATH lib
- Added import example projects
- Added CSV lib support
- Added more debug configuration snippets

### 1.1.3
- Added keywords to syntax highlighting
- Fixes to VDMJ

### 1.1.2
- Add library functionality
- Add coverage decorations
- Fixes to VDMJ

### 1.1.1
- Allow multiple JVM settings
- Minor correction to location of <QUOTE> values
- Improvement to module initialization retries
- Added VDMJ "order" plugin to help create ordering files (VDMJ only)
- Add POG mapping for "ext" clauses
- Correct trace execution context bug
- Fix bug with free variables for type invariant functions
- Improve UI focusing on exceptions and breakpoints
- Allow trace inits to use cached data (experimental)
- Enable F12 goto definition for ext, errs and specification statements

### 1.1.0
- Updated license
- Warning for unused imports
- Removed duplicate type checking errors
- Allow nested comments
- Added scheme to control parse ordering

### 1.0.5
- Added logging of server stdio to a file or terminal, this allows allotations to be printed during CT execution
- Specifications with "Too many type checking errors" handled sensibly
- Maintain synchronisation between client and server on folder deletion
- Improved handling of types that are imported
- Better watch variable output when variables are not in scope
- Allow manipulation of breakpoints while stopped at a breakpoint

### 1.0.4
- Fixes to syntax highlighting
- Initialization and execution are asynchronous and can now be interrupted or paused using the VSC controls (fixes bug #11)
- Output to the console make more consistent use of stdout and stderr
- Better console messages when specifications are terminated or interrupted
- Allow changed "set" settings to take effect on restart
- Several F12 definition location corrections (see bug #6)
- Advice is to use "continue" to exit debug sessions that catch exceptions, rather than the stop button (see bug #9)
- Improved handling for Java internal errors, like OutOfMemory

### 1.0.3
- Updated language server

### 1.0.2
- Changed launch file configurations

### 1.0.1
- Added icon to extension

### 1.0.0
- Initial Release
