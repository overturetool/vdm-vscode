const vscode = acquireVsCodeApi();

let traces = [];

let tracesWithGeneratedTests = [];

let tracesWithExecutedTests = [];

let menuDisplayed = false;

let menuBox = window.document.querySelector(".menu");

function buildTable(cts, table)
{
    table.id = "ctTable";

    // Build the header row
    let headers = ["Test case", "Result"]
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    // Add the header row cells
    for (let header of headers) {
        let th = document.createElement("th");       
        th.appendChild(document.createTextNode(header));
        headerRow.appendChild(th);
    }

    // Build the data rows 
    let tbdy = document.createElement("tbody");
    tbdy.id = "ctsbody";
    table.appendChild(tbdy);
    for (let ct of cts) {
        let mainrow = tbdy.insertRow();
        mainrow.classList.add("mainrow");

        // Add data cells to the row with content
        for (key in ct) {
            let mainrow_cell = mainrow.insertCell();
            mainrow_cell.classList.add("mainrowcell");
            mainrow_cell.appendChild(document.createTextNode(ct[key]));
        }
    }
}

function buildCTOutline(cts)
{
    // Create the ct symbols list and add them to the view container
    let ctSymbolsList = document.createElement('ol');
    ctSymbolsList.classList.add("outerOL");

    let ctContainer = document.getElementById('ctContainer');
    ctContainer.appendChild(ctSymbolsList);

    // Populate the ct symbols list
    for(i = 0; i < cts.length; i++)
    {
        let ctSymbol = cts[i];
        // Add a list item to ctSymbolsList list
        let ctSymbolsListItem = document.createElement('li');
        ctSymbolsList.appendChild(ctSymbolsListItem);

        // Add a details element to the list item - this element is the CTSymbol and contains the traces
        let ctSymbolDetail = document.createElement('details');
        ctSymbolDetail.id = ctSymbol.name;
        ctSymbolsListItem.appendChild(ctSymbolDetail);

        let ctSymbolDetailSummary = document.createElement("SUMMARY");
        ctSymbolDetailSummary.textContent = ctSymbol.name;
        ctSymbolDetail.appendChild(ctSymbolDetailSummary);

        // Add a list to the details element 
        let tracesList = document.createElement('ul');
        ctSymbolDetail.appendChild(tracesList);

        // Add trace items to the list in the details element
        let traces = ctSymbol.traces;
        for(l = 0; l < traces.length; l++)
        {
            let trace = traces[l];

            let tracesListItem = document.createElement('li');
            tracesList.appendChild(tracesListItem);

            // Add a details element to the list item - this element is the trace and contains test cases for the trace
            let tracesDetail = document.createElement('details');
            tracesDetail.id = "" + ctSymbol.id + trace.id;
            tracesListItem.appendChild(tracesDetail);
            tracesDetail.oncontextmenu = function() {
                var left = arguments[0].clientX;
                var top = arguments[0].clientY;
                
                menuBox.style.left = left + "px";
                menuBox.style.top = top + "px";
                menuBox.style.display = "block";
                
                arguments[0].preventDefault();
                
                menuDisplayed = true;
            }

            let tracesDetailSummary = document.createElement("SUMMARY");
            tracesDetailSummary.textContent = trace.name;
            tracesDetail.appendChild(tracesDetailSummary);

            let testResultList = document.createElement('ul');
            tracesDetail.appendChild(testResultList);
            
            // Function for handling user expanding the trace detail.
            tracesDetail.ontoggle = function()
            {
                if(!tracesDetail.open || tracesWithGeneratedTests.includes(tracesDetail.id))
                    return;

                // Send the trace id for which tests are to be generated.
                generateTraces(tracesDetail.id);
            }  
        }
    }
}

function generateTraces(traceId)
{
     // Send generate traces message
     vscode.postMessage({
        command: 'generateTests',
        text: traceId
    });
}

function updateTestGenerationProgess(newPercentage, traceId) {
    let testGenerationProgress = document.getElementById(traceId).getElementsByTagName('progress')[0];
    if(testGenerationProgress && testGenerationProgress.style.display != 'none' && newPercentage <= testGenerationProgress.max)
        testGenerationProgress.value = newPercentage;  
} 

function addTestsToTrace(traceId, tests)
{
    // A state is needed to track which traces have their tests generated.
    tracesWithGeneratedTests.push(traceId);

    // Get trace detail and its test list
    let tracesDetail = document.getElementById(traceId);
    let testResultList = tracesDetail.getElementsByTagName("ul")[0];

    // Add test result items to the list in the details element
    for(k = 0; k < tests.length; k++)
    {
        let test = tests[k];
        let testResultListItem = document.createElement('li');
        testResultList.appendChild(testResultListItem);

        // Add a details element to the list item - this element is the test result and contains the test case
        let testResultDetail = document.createElement('details');
        testResultListItem.appendChild(testResultDetail);
        testResultDetail.id = test.id;

        let testResultDetailSummary = document.createElement("SUMMARY");
        testResultDetail.appendChild(testResultDetailSummary);
        testResultDetailSummary.textContent = "test " + test.id;

        // Add the test cases to the details element as a table
        let caseTable = document.createElement('table');
        testResultDetail.appendChild(caseTable);
        buildTable(test.cases, caseTable);
    }

    forceViewRefresh(traceId);
}

function removeTestsFromTrace(traceId)
{
    let tracesDetail = document.getElementById(traceId);
    let testResultList = tracesDetail.getElementsByTagName("ul")[0];
    testResultList.innerHTML = "";

    forceViewRefresh(traceId);
}

function forceViewRefresh(elementId)
{
    // Workaround for screen not updating - this forces a redraw of the view...
    document.getElementById(elementId).style.display = 'none';
    document.getElementById(elementId).style.display = 'block';
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'showCTOutline':
            buildCTOutline(event.data.cts);
            return;
        case 'testsGenerated':
            addTestsToTrace(event.data.traceId, event.data.tests);
            return;
    }
});

window.addEventListener("click", function() {
    if(menuDisplayed == true){
        menuBox.style.display = "none";
    }
}, true);