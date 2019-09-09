'use strict';

class HttpFetcher {

    // Constructor

    constructor(dropbox_client, caller, request, data, successCallback, errorCallback) {
        this.dropbox_client_ = dropbox_client;
        this.caller_ = caller;
        this.request_ = request;
        this.data_ = data;
        this.successCallback_ = successCallback;
        this.errorCallback_ = errorCallback;
    }

    // Public functions

    fetch() {
        $.ajax(this.request_).done(result => {
            this.successCallback_(result);
        }).fail((error, textStatus, errorThrown) => {
            this.handleError(error, textStatus, errorThrown);
        });
    }

    // Private functions

    handleError(error, _textStatus, _errorThrown) {
        const status = Number(error.status);
        if (status === 404 || status === 409) {
            console.debug(error);
            this.errorCallback_('NOT_FOUND');
        } else if (status === 416) {
            console.debug(error);
            this.successCallback_(new ArrayBuffer(), false);
        } else if (status === 401) {
            console.error(error);
            // Access token has already expired or unauthorized. Unmount.
            this.dropbox_client_.unmountByAccessTokenExpired();
            this.errorCallback_('INVALID_OPERATION');
        } else if (status === 429) {
            const retryAfter = error.getResponseHeader('Retry-After');
            if (retryAfter) {
                console.log('Retry to send request(' + this.caller_ + ') after ' + retryAfter + 's');
                setTimeout(() => {
                    this.fetch();
                }, retryAfter * 1000);
            } else {
                console.error(error);
                this.errorCallback_('FAILED');
            }
        } else if (status === 0) { // Maybe, timeout?
            console.log('Retry to send request(' + this.caller_ + ') after 1s because of timeout');
            setTimeout(() => {
                this.fetch();
            }, 1000);
        } else {
            // showNotification.call(this, 'Error: status=' + status);
            console.error(error);
            this.errorCallback_('FAILED');
        }
    }

};

// Export
window.HttpFetcher = HttpFetcher;
