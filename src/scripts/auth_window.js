console.log('In auth_window.js');
function clearData(webview, onSuccess) {
    console.log('In clearData');
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
    webview.clearData({ since: 0 }, clearDataOptions, onSuccess);
}


function onLoad() {
    console.log('In onLoad');
    let stallDetectionTimeout;
    const authWebView =  document.getElementById('authWebView');
    const clearDataAndClose = () => clearData(authWebView, () => {
        chrome.app.window.current().close();
    });
    const listeners = {
        'loadstart': function(event) {
            if (event.isTopLevel && stallDetectionTimeout) {
                clearTimeout(stallDetectionTimeout)
            }
        },
        'loadredirect': function(event) {
            if (event.isTopLevel) {
                if (stallDetectionTimeout) {
                    clearTimeout(stallDetectionTimeout)
                }
                if (event.newUrl.startsWith(window.redirectUrl)) {
                    window.successCallback(event.newUrl);
                    clearDataAndClose();
                }
            }
        },
        'loadabort': function(event) {
            if (event.isTopLevel) {
                stallDetectionTimeout = setTimeout(function() {
                    window.errorCallback('The login process timed out')
                    clearDataAndClose();
                })
            }
        }
    };
    Object.keys(listeners).forEach(eventName => {
        authWebView.addEventListener(eventName, listeners[eventName])
    });
    authWebView.src = window.authUrl;
};

window.addEventListener('load', onLoad);

