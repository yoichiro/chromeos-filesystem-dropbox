"use strict";

(function() {

    var onLoad = function() {
        initializeSentry();
        assignEventHandlers();
        showSeasonImage();
    };

    var initializeSentry = function() {
        Raven.config('https://8f30bd158dea44d2ad5dbce094b67274@sentry.io/189250').install();
        console.log("Sentry initialized.");
    };

    var showSeasonImage = function() {
        var today = new Date();
        var month = today.getMonth() + 1;
        var date = today.getDate();
        // Xmas
        if (month === 12 && (1 <= date && date <= 25)) {
            var img = document.createElement("img");
            img.src = "icons/xmas.png";
            img.classList.add("season");
            var logo = document.querySelector("#logo");
            img.style.top = logo.getBoundingClientRect().top + "px";
            img.style.left = (logo.getBoundingClientRect().left + 32) + "px";
            var body = document.querySelector("body");
            body.appendChild(img);
        }
    };

    var assignEventHandlers = function() {
        var btnMount = document.querySelector("#btnMount");
        btnMount.addEventListener("click", function(e) {
            onClickedBtnMount(e);
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
            limit.addEventListener("click", function(e) {
                onChangedOpenedFilesLimit(e);
            });
        }
    };

    var onClickedBtnMount = function(evt) {
        var btnMount = document.querySelector("#btnMount");
        evt.preventDefault();
        btnMount.setAttribute("disabled", "true");
        $.toaster({message: chrome.i18n.getMessage("mountAttempt")});
        var request = {
            type: "mount"
        };
        chrome.runtime.sendMessage(request, function(response) {
            if (response && response.success) {
                $.toaster({message: chrome.i18n.getMessage("mountSuccess")});
                window.setTimeout(function() {
                    window.close();
                }, 2000);
            } else {
                var msg = {title: chrome.i18n.getMessage("mountFail"), priority: "danger"};
                if (response && response.error) {
                    msg.message = response.error;
                } else {
                    msg.message = "Something wrong.";
                }
                $.toaster(msg);
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
            case "button":
                textNode = document.createTextNode(messageText);
                element.appendChild(textNode);
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
            document.querySelector("#openedFilesLimit" + openedFilesLimit).checked = true;
            $("#settingsDialog").modal("show");
        });
    };

    var onChangedOpenedFilesLimit = function(evt) {
        chrome.storage.local.get("settings", function(items) {
            var settings = items.settings || {};
            var selected = evt.target.id;
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
