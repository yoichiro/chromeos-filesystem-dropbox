'use strict';

const background = () => {
    if (!chrome.fileSystemProvider) {
        console.log('There is no chrome.fileSystemProvider API. See you on ChromeOS!');
        return;
    }

    const dropbox_fs_ = new DropboxFS();

    const openWindow = () => {
        chrome.app.window.create('window.html', {
            outerBounds: {
                width: 600,
                height: 350
            },
            resizable: false
        });
    };

    chrome.app.runtime.onLaunched.addListener(openWindow);

    if (chrome.fileSystemProvider.onMountRequested) {
        chrome.fileSystemProvider.onMountRequested.addListener(openWindow);
    }

    const mount = (successCallback, errorCallback) => {
        dropbox_fs_.mount(() => {
            successCallback();
        }, reason => {
            errorCallback(reason);
        });
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch(request.type) {
        case 'mount':
            mount(() => {
                sendResponse({
                    type: 'mount',
                    success: true
                });
            }, reason => {
                sendResponse({
                    type: 'mount',
                    success: false,
                    error: reason
                });
            });
            break;
        default:
            sendResponse({
                type: 'error',
                success: false,
                message: request.type ? 'Invalid request type: ' + request.type + '.' : 'No request type provided.'
            });
            break;
        }
        return true;
    });
};

background();
