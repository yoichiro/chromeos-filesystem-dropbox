"use strict";

(function() {

    var dropbox_fs_ = new DropboxFS();

    chrome.app.runtime.onLaunched.addListener(function() {
        chrome.app.window.create("window.html", {
            outerBounds: {
                width: 400,
                height: 220
            },
            resizable: false
        });
    });

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
