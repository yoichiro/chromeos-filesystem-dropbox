'use strict';

function tokenFromRedirectUrl(urlWithToken, successCallback, errorCallback) {
    if (urlWithToken) {
        const urlObj = new URL(urlWithToken);
        const hash = urlObj.hash || '';
        const match = hash.match(/access_token=([^&]+)/) || [];
        const access_token = match[1];
        if (access_token) {
            successCallback(access_token);
        } else {
            errorCallback('Access token not found in redirect URL');
        }
    } else {
        errorCallback('Authorization failed')
    }
}

class ChromeWebviewAuthStrategy {
    constructor(authUrl, redirectUrl) {
        this.authUrl = authUrl;
        this.redirectUrl = redirectUrl;
    }

    authorize(successCallback, errorCallback) {
        this.openAuthWindow(redirectUrl => {
            tokenFromRedirectUrl(redirectUrl, successCallback, errorCallback)
        }, reason => {
            errorCallback('Authorization failed: ' + reason);
        });
    }

    openAuthWindow(successCallback, errorCallback) {
        chrome.app.window.create('windows/auth_window.html', {
            innerBounds: {
                width: 600,
                height: 700
            },
            resizable: false
        }, authWindow => {
            const authContentWindow = authWindow.contentWindow;
            authContentWindow.authUrl = this.authUrl;
            authContentWindow.redirectUrl = this.redirectUrl;
            authContentWindow.successCallback = successCallback;
            authContentWindow.errorCallback = errorCallback;
        });
    };
}

class ChromeIdentityAuthStrategy {
    constructor(authUrl) {
        this.authUrl = authUrl;
    }

    authorize(successCallback, errorCallback) {
        chrome.identity.launchWebAuthFlow({
            'url': this.authUrl,
            'interactive': true
        }, redirectUrl => {
            tokenFromRedirectUrl(redirectUrl, successCallback, errorCallback)
        });
    }
}

// Export
window.ChromeWebviewAuthStrategy = ChromeWebviewAuthStrategy;
window.ChromeIdentityAuthStrategy = ChromeIdentityAuthStrategy;
