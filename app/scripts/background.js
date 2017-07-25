"use strict";

(function() {

    if (!chrome.fileSystemProvider) {
        console.log("There is no chrome.fileSystemProvider API. See you on ChromeOS!");
        return;
    }

    Raven.config('https://8f30bd158dea44d2ad5dbce094b67274@sentry.io/189250', {
        release: chrome.runtime.getManifest().version
    }).install();
    console.log("Sentry initialized.");

    var dropbox_fs_ = new DropboxFS();

    var openWindow = function() {
        chrome.app.window.create("window.html", {
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

    var mount = function(successCallback, errorCallback) {
        dropbox_fs_.mount(function() {
            successCallback();
        }, function(reason) {
            errorCallback(reason);
        });
    };

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        switch(request.type) {
        case "mount":
            mount(function() {
                sendResponse({
                    type: "mount",
                    success: true
                });
            }, function(reason) {
                sendResponse({
                    type: "mount",
                    success: false,
                    error: reason
                });
            });
            break;
        default:
            var message;
            if (request.type) {
                message = "Invalid request type: " + request.type + ".";
            } else {
                message = "No request type provided.";
            }
            sendResponse({
                type: "error",
                success: false,
                message: message
            });
            break;
        }
        return true;
    });

})();
