'use strict';

class BaseWindow {
    constructor() {
        this.setMessageResources();
    }

    setMessageResources() {
        const selector = 'data-message';
        const elements = document.querySelectorAll('[' + selector + ']');

        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];

            const messageID = element.getAttribute(selector);
            const messageText = chrome.i18n.getMessage(messageID);

            let textNode = null;
            switch (element.tagName.toLowerCase()) {
                case 'button':
                    textNode = document.createTextNode(messageText);
                    element.appendChild(textNode);
                    break;
                case 'h1':
                case 'title':
                case 'div':
                    textNode = document.createTextNode(messageText);
                    element.appendChild(textNode);
                    break;
            }
        }
    }
}

// Export
window.BaseWindow = BaseWindow;
