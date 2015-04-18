"use strict";

(function() {

    var onLoad = function() {
        assignEventHandlers();
    };

    var assignEventHandlers = function() {
        var btnMount = document.querySelector("#btnMount");
        btnMount.addEventListener("click", function(e) {
            onClickedBtnMount();
        });
       // Settings dialog
        var btnSettings = document.querySelector("#btnSettings");
        btnSettings.addEventListener("click", function(e) {
            onClickedBtnSettings(e);
        });
        var openedFilesLimits = [0, 5, 10, 15];
        for (var i = 0; i < openedFilesLimits.length; i++) {
            var limit = document.querySelector("#openedFilesLimit" + openedFilesLimits[i]);
            /*jshint loopfunc: true */
            limit.addEventListener("core-change", function(e) {
                onChangedOpenedFilesLimit(e);
            });
        }
    };

    var onClickedBtnMount = function() {
        var btnMount = document.querySelector("#btnMount");
        event.preventDefault();
        btnMount.setAttribute("disabled", "true");
        document.getElementById("toast-mount-attempt").show();
        var request = {
            type: "mount"
        };
        chrome.runtime.sendMessage(request, function(response) {
            if (response.success) {
                document.getElementById("toast-mount-success").show();
                window.setTimeout(function() {
                    window.close();
                }, 2000);
            } else {
                var toast = document.getElementById("toast-mount-fail");
                if (response.error) {
                    toast.setAttribute("text", response.error);
                }
                toast.show();
                btnMount.removeAttribute("disabled");
            }
        });
    };

    var setMessageResources = function() {
        var selector = "data-message";
        var elements = document.querySelectorAll("[" + selector + "]");

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];

            var messageID = element.getAttribute(selector);
            var messageText = chrome.i18n.getMessage(messageID);

            var textNode = null;
            switch(element.tagName.toLowerCase()) {
            case "paper-button":
                textNode = document.createTextNode(messageText);
                element.appendChild(textNode);
                break;
            case "paper-input":
            case "paper-dropdown":
                element.setAttribute("label", messageText);
                break;
            case "paper-toast":
                element.setAttribute("text", messageText);
                break;
            case "h1":
            case "title":
                textNode = document.createTextNode(messageText);
                element.appendChild(textNode);
                break;
            }
        }
    };

    var onClickedBtnSettings = function(evt) {
        chrome.storage.local.get("settings", function(items) {
            var settings = items.settings || {};
            var openedFilesLimit = settings.openedFilesLimit || "10";
            document.querySelector("#openedFilesLimit").selected = "openedFilesLimit" + openedFilesLimit;
            document.querySelector("#settingsDialog").toggle();
        });
    };

    var onChangedOpenedFilesLimit = function(evt) {
        chrome.storage.local.get("settings", function(items) {
            var settings = items.settings || {};
            var selected = document.querySelector("#openedFilesLimit").selected;
            var value = selected.substring(16);
            settings.openedFilesLimit = value;
            chrome.storage.local.set({settings: settings}, function() {
                console.log("Saving settings done.");
            });
        });

    };

    window.addEventListener("load", function(e) {
        onLoad();
    });

    setMessageResources();

})();
