const vscode = acquireVsCodeApi();

let traces = [];

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
            tracesListItem.appendChild(tracesDetail);
            let tracesDetailSummary = document.createElement("SUMMARY");
            tracesDetailSummary.textContent = traces[l].name;
            tracesDetail.appendChild(tracesDetailSummary);

            // Add a list to the details element 
            let testResultList = document.createElement('ul');
            tracesDetail.appendChild(testResultList);

            // Add test result items to the list in the details element if test cases are resolved
            if(resolve)
            {
                let testResults = traces[l].testResults;
                for(k = 0; k < testResults.length; k++)
                {
                    console.log(testResults[k]);
                    let testResultListItem = document.createElement('li');
                    testResultList.appendChild(testResultListItem);
                    // Add a details element to the list item - this element is the test result and contains the test case
                    let testResultDetail = document.createElement('details');
                    testResultListItem.appendChild(testResultDetail);
                    let testResultDetailSummary = document.createElement("SUMMARY");
                    testResultDetailSummary.textContent = testResults[k].id;
                    testResultDetail.appendChild(testResultDetailSummary);

                    // Add the test cases to the details element as a table
                    let container = document.createElement('div');
                    let caseTable = document.createElement('table');
                    container.appendChild(caseTable);
                    testResultDetail.appendChild(container);
                    buildTable(testResults[k].cases, caseTable);
                }
            }
            
        }
    }
}

window.addEventListener('message', event => {
    switch (event.data.command) {
        case 'showCTOutline':
            buildCTOutline(event.data.cts, false);
            return;
        case 'showCTResolved':
            buildCTOutline(event.data.cts, true);
            return;
    }
});