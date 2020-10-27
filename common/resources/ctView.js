const vscode = acquireVsCodeApi();

let traces = [];

function buildTable(cts, table)
{
    // Get the table construct and add to it.
    table.id = "ctTable";
    ctContainer.appendChild(table);

    // Build the header row
    let headers = ["Test case", "Result"]
    let thead = table.createTHead();
    let headerRow = thead.insertRow();

    // Add the header row cells
    for (let key of headers) {
        let th = document.createElement("th");       
        th.appendChild(document.createTextNode(key));
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

function buildCTOutline(cts, container, resolve)
{
    let ctSymbolsList = document.createElement('ol');
    ctSymbolsList.classList.add("outerOL");
    for(i = 0; i < cts.length; i++)
    {
        // Add a list item to ctSymbolsList list
        let ctSymbolsListItem = document.createElement('li');
        ctSymbolsList.appendChild(ctSymbolsListItem);

        // Add a details element to the list item - this element is the CTSymbol and contains the traces
        let ctSymbolDetail = document.createElement('details');
        ctSymbolsListItem.appendChild(ctSymbolDetail);
        ctSymbolDetail.firstChild.textContent = cts[i].name;

        // Add a list to the details element 
        let tracesList = document.createElement('ul');
        ctSymbolDetail.appendChild(tracesList);

        // Add trace items to the list in the details element
        let traces = cts[i].traces;
        for(l = 0; l < traces.length; l++)
        {
            let tracesListItem = document.createElement('li');
            testcaseList.appendChild(tracesListItem);

            // Add a details element to the list item - this element is the trace and contains test cases for the trace
            let tracesDetail = document.createElement('details');
            tracesListItem.appendChild(tracesDetail);
            tracesDetail.firstChild.textContent = traces[i].name;

            // Add a list to the details element 
            let testcaseList = document.createElement('ol');
            tracesDetail.appendChild(testcaseList);

            // Add test result items to the list in the details element if test cases are resolved
            if(resolve)
            {
                let testResults = traces[l].testResults;
                for(n = 0; n < testResults.legnth; n++)
                {
                    let testResultListItem = document.appendChild('li');

                    // Add a details element to the list item - this element is the test result and contains the test case
                    let testResultDetail = document.createElement('details');
                    testResultListItem.appendChild(testResultDetail);
                    testResultDetail.firstChild.textContent = testResults[i].id;

                    // Add the test cases to the details element as a table
                    let caseTable = document.createElement('table');
                    testResultDetail.appendChild(caseTable);
                    buildTable(testResults[l].cases, caseTable);
                }
            }
            
        }
    }
    ctSymbolsList.appendChild
}