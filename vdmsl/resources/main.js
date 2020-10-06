(function () {
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState();

    const counter = document.getElementById('lines-of-code-counter');
    let currentCount = (oldState && oldState.count) || 0;
    counter.textContent = currentCount;

    setInterval(() => {
        counter.textContent = currentCount++;

        // Update state
        vscode.setState({ count: currentCount });
    }, 1000);


    window.addEventListener('message', event => {
        counter.textContent = currentCount++;
        const message = event.data; // The json data that the extension sent
        let json = message.command;
        
        // Create the list element:
        var list = document.createElement('ul');
        list.classList.add('dem');

        for(var i = 0; i < Object.keys(json).length; i++) {
            // Create the list item:
            var item = document.createElement('li');

            // Set its contents:
            item.appendChild(document.createTextNode(Object.values(json)[i]));

            // Add it to the list:
            list.appendChild(item);
        }

        document.getElementById('middleList').appendChild(list);
    });
}());