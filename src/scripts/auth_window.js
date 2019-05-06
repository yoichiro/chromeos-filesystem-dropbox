'use strict';

class AuthWindow extends BaseWindow {
    constructor() {
        super();
        this.onLoad = this.onLoad.bind(this);
        this.onLoadStart = this.onLoadStart.bind(this);
        this.onLoadRedirect = this.onLoadRedirect.bind(this);
        this.onLoadAbort = this.onLoadAbort.bind(this);
        this.stallDetected = this.stallDetected.bind(this);
    }

    onLoad() {
        this.webview_ =  document.querySelector('#authWebView');
        const listeners = {
            'loadstart': this.onLoadStart,
            'loadredirect': this.onLoadRedirect,
            'loadabort': this.onLoadAbort
        };
        Object.keys(listeners).forEach(eventName => {
            this.webview_.addEventListener(eventName, listeners[eventName])
        });
        this.webview_.src = window.authUrl;
    }

    stallDetected() {
        window.errorCallback('The login process timed out')
        this.clearDataAndClose();
    }

    startStallDetection() {
        this.stallDetectionTimeout = setTimeout(this.stallDetected, 5000);
    }

    stopStallDetection() {
        if (this.stallDetectionTimeout) {
            clearTimeout(this.stallDetectionTimeout)
        }
    }

    onLoadStart(event) {
        if (event.isTopLevel) {
            this.stopStallDetection();
        }
    }

    onLoadRedirect(event) {
        if (event.isTopLevel) {
            this.stopStallDetection();
            if (event.newUrl.startsWith(window.redirectUrl)) {
                window.successCallback(event.newUrl);
                this.clearDataAndClose();
            }
        }
    }

    onLoadAbort(event) {
        event.preventDefault();
        if (event.isTopLevel) {
            this.startStallDetection();
        }
    }

    clearData(successCallback) {
        const clearDataOptions = [
            'appcache',
            'cache',
            'cookies',
            'sessionCookies',
            'persistentCookies',
            'fileSystems',
            'indexedDB',
            'localStorage',
            'webSQL'
        ].reduce((opts, key) => {
            opts[key] = true;
            return opts;
        }, {});
        this.webview_.clearData({ since: 0 }, clearDataOptions, successCallback);
    }

    clearDataAndClose() {
        this.clearData(() => {
            chrome.app.window.current().close();
        });
    }
}

window.addEventListener('load', () => {
    new AuthWindow().onLoad();
});

