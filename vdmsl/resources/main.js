(function () {
    //const vscode = acquireVsCodeApi();

    //const oldState = vscode.getState();

    function buildTable(json)
    {
        // Access the DOM to get the table construct and add to it.
        let table = document.getElementById('table');

        // Build the headers
        let thead = table.createTHead();
        let headerRows = thead.insertRow();  
        for (let key of Object.keys(json[0])) {
          let th = document.createElement("th");
          let thtext = document.createTextNode(key);
          th.appendChild(thtext);
          headerRows.appendChild(th);
        }

        // Build the rows
        let tbdy = document.createElement("tbody");
        table.appendChild(tbdy);
        for (let element of json) {
            let row = tbdy.insertRow();
            row.addEventListener("click", function(){
                vscode.postMessage({
                    command: 'rowclick',
                    text: element
                })
            });
            
            for (key in element) {
              let cell = row.insertCell();
              cell.appendChild(document.createTextNode(element[key]));
            }
        }
    }

    window.addEventListener('message', event => {
        let json = event.data.command; // The json data that the extension sent
        buildTable(json)
        //vscode.setState({ data: json });
    });

    buildTable(oldState);
}());