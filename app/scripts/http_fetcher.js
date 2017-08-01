"use strict";

(function() {

    // Constructor

    var HttpFetcher = function(dropbox_client, caller, request, data, successCallback, errorCallback) {
        this.dropbox_client_ = dropbox_client;
        this.caller_ = caller;
        this.request_ = request;
        this.data_ = data;
        this.successCallback_ = successCallback;
        this.errorCallback_ = errorCallback;
    };

    // Public functions

    HttpFetcher.prototype.fetch = function() {
        $.ajax(this.request_).done(function(result) {
            this.successCallback_(result);
        }.bind(this)).fail(function(error, textStatus, errorThrown) {
            handleError.call(this, error, textStatus, errorThrown);
        }.bind(this));
    };

    // Private functions

    var handleError = function(error, textStatus, errorThrown) {
        var status = Number(error.status);
        if (status === 404 || status === 409) {
            console.debug(error);
            this.errorCallback_("NOT_FOUND");
        } else if (status === 416) {
            console.debug(error);
            this.successCallback_(new ArrayBuffer(), false);
        } else if (status === 401) {
            console.error(error);
            // Access token has already expired or unauthorized. Unmount.
            this.dropbox_client_.unmountByAccessTokenExpired();
            this.errorCallback_("INVALID_OPERATION");
        } else if (status === 429) {
            var retryAfter = error.getResponseHeader("Retry-After");
            if (retryAfter) {
                console.log("Retry to send request(" + this.caller_ + ") after " + retryAfter + "s");
                setTimeout(function () {
                    this.fetch();
                }.bind(this), retryAfter * 1000);
            } else {
                console.error(error);
                var message1 = this.caller_ + " - 429(no Retry-After)";
                if (error.responseText) {
                    message1 += " - " + error.responseText;
                }
                sendMessageToSentry.call(this, message1, error, textStatus, errorThrown);
                this.errorCallback_("FAILED");
            }
        } else if (status === 0) { // Maybe, timeout?
            console.log("Retry to send request(" + this.caller_ + ") after 1s because of timeout");
            setTimeout(function () {
                this.fetch();
            }.bind(this), 1000);
        } else {
            // showNotification.call(this, "Error: status=" + status);
            console.error(error);
            if (status < 500 || 599 < status) {
                var message2 = this.caller_ + " - " + status;
                if (error.responseText) {
                    message2 += " - " + error.responseText;
                }
                sendMessageToSentry.call(this, message2, error, textStatus, errorThrown);
            }
            this.errorCallback_("FAILED");
        }
    };

    var sendMessageToSentry = function(message, error, textStatus, errorThrown) {
        if (Raven.isSetup()) {
            Raven.captureMessage(new Error(message), {
                extra: {
                    error: error,
                    textStatus: textStatus,
                    errorThrown: errorThrown,
                    data: this.data_
                },
                tags: {
                    "app.version": chrome.runtime.getManifest().version
                }
            });
        }
    };

    // Export

    window.HttpFetcher = HttpFetcher;

})();
