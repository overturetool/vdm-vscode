const vscode = acquireVsCodeApi();

let traces = [];

let tracesWithGeneratedTests = [];

let tracesWithExecutedTests = [];

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

function buildCTOutline(cts, resolve)
{
    // Create the ct symbols list and add them to the view container
    let ctSymbolsList = document.createElement('ol');
    ctSymbolsList.classList.add("outerOL");
    let ctContainer = document.getElementById('ctContainer');
    ctContainer.appendChild(ctSymbolsList);

    // Populate the ct symbols list
    for(i = 0; i < cts.length; i++)
    {
        // Add a list item to ctSymbolsList list
        let ctSymbolsListItem = document.createElement('li');
        ctSymbolsList.appendChild(ctSymbolsListItem);

        // Add a details element to the list item - this element is the CTSymbol and contains the traces
        let ctSymbolDetail = document.createElement('details');
        ctSymbolsListItem.appendChild(ctSymbolDetail);
        let ctSymbolDetailSummary = document.createElement("SUMMARY");
        ctSymbolDetailSummary.textContent = cts[i].name;
        ctSymbolDetail.appendChild(ctSymbolDetailSummary);

        // Add a list to the details element 
        let tracesList = document.createElement('ul');
        ctSymbolDetail.appendChild(tracesList);

        // Add trace items to the list in the details element
        let traces = cts[i].traces;
        for(l = 0; l < traces.length; l++)
        {
            let tracesListItem = document.createElement('li');
            tracesList.appendChild(tracesListItem);

            // Add a details element to the list item - this element is the trace and contains test cases for the trace
            let tracesDetail = document.createElement('details');
            tracesDetail.id = traces[l].id;
            tracesListItem.appendChild(tracesDetail);
            let tracesDetailSummary = document.createElement("SUMMARY");
            tracesDetailSummary.textContent = traces[l].name;
            tracesDetail.appendChild(tracesDetailSummary);
            
            // Function for handling user expanding the trace detail.
            tracesDetail.onclick = function()
            {
                if(tracesDetail.open)
                    return;

                // Send the trace id for which tests are to be generated.
                if(!tracesWithGeneratedTests.includes(tracesDetail.id))
                {
                    // Send generate traces message
                    vscode.postMessage({
                        command: 'generateTests',
                        text: tracesDetail.id
                    });
                }
            }  
        }
    }
}

function updateTestGenerationProgess(newPercentage, traceId) {
    let testGenerationProgress = document.getElementById(traceId).getElementsByTagName('progress')[0];
    if(testGenerationProgress && testGenerationProgress.style.display != 'none' && newPercentage <= testGenerationProgress.max)
        testGenerationProgress.value = newPercentage;  
} 

function addTestsToTrace(traceId, tests)
{
    // A state is needed for which traces have their tests generated.
    tracesWithGeneratedTests.push(traceId);

    // Add a list to the details element
    let tracesDetail = document.getElementById(traceId); 
    let testResultList = document.createElement('ul');
    tracesDetail.appendChild(testResultList);

    // Add test result items to the list in the details element if test cases are resolved
    for(k = 0; k < tests.length; k++)
    {
        let testResultListItem = document.createElement('li');
        testResultList.appendChild(testResultListItem);
        // Add a details element to the list item - this element is the test result and contains the test case
        let testResultDetail = document.createElement('details');
        testResultListItem.appendChild(testResultDetail);
        let testResultDetailSummary = document.createElement("SUMMARY");
        testResultDetailSummary.textContent = tests[k].id;
        testResultDetail.appendChild(testResultDetailSummary);

        // Add the test cases to the details element as a table
        let container = document.createElement('div');
        let caseTable = document.createElement('table');
        container.appendChild(caseTable);
        testResultDetail.appendChild(container);
        buildTable(tests[k].cases, caseTable);
    }
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'showCTOutline':
            buildCTOutline(event.data.cts);
            return;
        case 'testGenerationProgressUpdate':
            updateTestGenerationProgess(event.data.generationProgress, event.data.traceId)
            return;
        case 'testGenerated':
            addTestsToTrace(event.data.traceId, event.data.tests)
    }
});