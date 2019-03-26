# Code Structure

This document describes you code structure of this software. Mainly, I write down about the directory structure and the purpose of each file.

# Directories

* [/](https://github.com/yoichiro/chromeos-filesystem-dropbox) - Build files, Configuration files, and etc.
* [/src](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/src) - This directory has one HTML file and the manifest.json file.
* [/src/_locales/en](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/src/_locales/en) - There is one message resource file for English.
* [/src/icons](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/src/icons) - This directory has some image files.
* [/src/scripts](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/src/scripts) - There are some JavaScript files.
* [/src/styles](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/src/styles) - There is one css style sheet definition file.
* [/docs](https://github.com/yoichiro/chromeos-filesystem-dropbox/tree/master/docs) - Currently, there is one image file which is referenced by the README.md file.

At least, if you are a programmer, first you should enter the /app/scripts directory and see each JavaScript files to understand this app's behaviors.

# Files

## For Building

### [/gulpfile.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/gulpfile.js)

This file defines all procedures to build this software with [gulp](https://gulpjs.com/).

### [/package.json](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/package.json)

This file defines npm project information, building script commands and dependencies.

## HTML

### [/src/window.html](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/window.html)

This is a HTML file for the screen which users see at first when this software is launched. For instance, this HTML file has one button to start mounting the Dropbox storage. The click event is handled by the function defined in the /src/scripts/window.js file.

## JavaScript

This software consists of some JavaScript files. The abstract structure is the following:

<img src="https://raw.githubusercontent.com/yoichiro/chromeos-filesystem-dropbox/master/docs/code_structure.png">

### [/src/scripts/window.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/window.js)

This window.js file is in charge of handling each click event fired on the window.html. For instance, there are the events below:

* Mount button click event
* Setting button click event
* Opened files limit radio buttons change event

Each event handler is assigned by the assignEventHandlers() function.

#### Mount button click event

When this event fired, the onClickedBtnMount() function is called. The window.js file doesn't have any process to mount the Dropbox. Instead, this event handler delegates the actual process to the background page represented by the background.js file. For instance, the onClickedBtnMount() function sends a message to the background page. The message has one key/value pair: type:"mount".

After sending the message to the background page, the function waits a response. If the response has a success flag, the function closes the window.

#### Setting button click event

When this event fired, the onClickedBtnSettings() function is called. This function opens the setting dialog.

#### Opened files limit radio buttons change event

When this event fired, the onChangedOpenedFilesLimit() function is called. In the function, the selected value is stored with the chrome.storage.local API.

#### Other

If a current date is on December, this script shows you a special image.

### [/src/scripts/background.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/background.js)

This is a background page script. Mainly, this script has a responsibility of launching the window when users want to mount the Dropbox. Also, this script has an ability to receive the message from the window.js script. When the message received, this script delegates the request of mounting the Dropbox to the [/src/scripts/dropbox_fs.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/dropbox_fs.js) script. Especially, this script has one DropboxFS instance.

This script can know what users want to mount the Dropbox by handling [chrome.fileSystemProvider.onMountRequested](https://developer.chrome.com/extensions/fileSystemProvider#event-onMountRequested) event. When this event fired, this script opens the window.html.

### [/src/scripts/dropbox_fs.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/dropbox_fs.js)

This script file is an implementation for [chrome.fileSystemProvider](https://developer.chrome.com/apps/fileSystemProvider) API. That is, this script has a responsibility of the following:

* When this script receives the request of mounting/unmounting, do mounting.mounting with the chrome.fileSystemProvider.mount()/unmount() API.
* Handling all events of the chrome.fileSystemProvider API. Each event has a name "on\***Requested", and this script has functions which has the same name of each event.
* Caching fetched meta data. For instance, Each meta data fetched is stored into [/src/scripts/metadata_cache.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/metadata_cache.js). This script improves a performance using the cache mechanism.
* This software has an ability to mount multiple accounts of Dropbox at the same time. Each connection is represented by DropboxClient class defined in [/src/scripts/dropbox_client.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/dropbox_client.js). This script manages multiple DropboxClient instances.

This script defines a DropboxFS class. The DropboxFS instance is created by the background.js. This script never communicate to Dropbox API server. Instead, this script delegates them to the dropbox_client.js script. That is, this script has a responsibility of handling FSP events and proxying them to the dropbox_client.js script.

* mount() - DropboxClient#authorize(), DropboxClient#getUserInfo()
* onReadDirectoryRequested() - DropboxClient#readDirectory()
* onGetMetadataRequested() - DropboxClient#getMetadata()
* onOpenFileRequested() - DropboxClient#openFile()
* onReadFileRequested() - DropboxClient#readFile()
* onCloseFileRequested() - DropboxClient#closeFile()
* onCreateDirectoryRequested() - DropboxClient#createDirectory()
* onDeleteEntryRequested() - DropboxClient#deleteEntry()
* onMoveEntryRequested() - DropboxClient#moveEntry()
* onCopyEntryRequested() - DropboxClient#copyEntry()
* onWriteFileRequested() - DropboxClient#writeFile()
* onTruncateRequested() - DropboxClient#truncate()
* onCreateFileRequested() - DropboxClient#createFile()

### [/src/scripts/dropbox_client.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/dropbox_client.js)

This script provides an ability to communicate with Dropbox API server. That is, this script uses each Dropbox API to treat user's directories/files. For instance, [Dropbox API v2](https://www.dropbox.com/developers/documentation/http/overview) is used.

OAuth2 Implicit Grant flow is used to identify a user. But, this script doesn't use the Dropbox OAuth2 Implicit Grant flow directly. Instead, uses [chrome.identity](https://developer.chrome.com/extensions/identity) API.

Basically, there are functions corresponding to each Dropbox API.

* authorize() - [/oauth2/authorize](https://www.dropbox.com/developers/documentation/http/documentation)
* unauthorize() - [/token/revoke](https://www.dropbox.com/developers/documentation/http/documentation#auth-token-revoke)
* getUserInfo() - [/users/get_current_account](https://www.dropbox.com/developers/documentation/http/documentation#users-get_current_account)
* getMetadata() - [/files/get_metadata](https://www.dropbox.com/developers/documentation/http/documentation#files-get_metadata)
* readDirectory() - [/files/list_folder](https://www.dropbox.com/developers/documentation/http/documentation#files-list_folder) [files/list_folder/continue](https://www.dropbox.com/developers/documentation/http/documentation#files-list_folder-continue)
* closeFile() - [/files/upload_session/finish](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-finish)
* readFile() - [/files/download](https://www.dropbox.com/developers/documentation/http/documentation#files-download)
* createDirectory() - [/files/create_folder](https://www.dropbox.com/developers/documentation/http/documentation#files-create_folder)
* deleteEntry() - [/files/delete](https://www.dropbox.com/developers/documentation/http/documentation#files-delete)
* moveEntry() - [/files/move](https://www.dropbox.com/developers/documentation/http/documentation#files-move)
* copyEntry() - [/files/copy](https://www.dropbox.com/developers/documentation/http/documentation#files-copy)
* createFile() - [/files/upload](https://www.dropbox.com/developers/documentation/http/documentation#files-upload)
* writeFile() - [/files/upload_session/start](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-start) [/files/upload_session/append_v2](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-append_v2)
* truncate() - [/files/upload_session/start](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-start) [/files/upload_session/append_v2](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-append_v2) [/files/upload_session/finish](https://www.dropbox.com/developers/documentation/http/documentation#files-upload_session-finish) 

### [/src/scripts/metadata_cache.js](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/scripts/metadata_cache.js)

This script provides an ability to keep metadata objects. As the result, whole performance is increased because of reducing a network communication. Each metadata object is stored per each directory. That is, the cache key is a directory path.

* put() - Store metadata object array to the cache storage mapped by the specified directory path.
* get() - Retrieve metadata object/array specified by the directory path/file path.
* remove() - Delete the metadata object/array specified by the directory path/file path.

## Other

### [/src/manifest.json](https://github.com/yoichiro/chromeos-filesystem-dropbox/blob/master/src/manifest.json)

This is a manifest file which is needed for Chrome Apps.
