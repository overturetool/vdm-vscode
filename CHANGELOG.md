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