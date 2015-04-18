"use strict";

(function() {

    // Constants

    var FILE_SYSTEM_ID = "dropboxfs";
    var FILE_SYSTEM_NAME = "Dropbox";

    // Constructor

    var DropboxFS = function() {
        this.dropbox_client_map_ = {};
        this.opened_files_ = {};
        this.metadata_cache_ = {};
        assignEventHandlers.call(this);
    };

    // Public functions

    DropboxFS.prototype.mount = function(successCallback, errorCallback) {
        var dropboxClient = new DropboxClient(this);
        dropboxClient.authorize(function() {
            dropboxClient.getUserInfo(function(userInfo) {
                console.log(userInfo);
                var fileSystemId = createFileSystemID.call(this, userInfo.uid);
                chrome.fileSystemProvider.getAll(function(fileSystems) {
                    var mounted = false;
                    for (var i = 0; i < fileSystems.length; i++) {
                        if (fileSystems[i].fileSystemId === fileSystemId) {
                            mounted = true;
                            break;
                        }
                    }
                    if (mounted) {
                        errorCallback("ALREADY_MOUNTED");
                    } else {
                        this.dropbox_client_map_[fileSystemId] = dropboxClient;
                        chrome.storage.local.get("settings", function(items) {
                            var settings = items.settings || {};
                            var openedFilesLimit = settings.openedFilesLimit || "10";
                            chrome.fileSystemProvider.mount({
                                fileSystemId: fileSystemId,
                                displayName: FILE_SYSTEM_NAME + " (" + userInfo.displayName + ")",
                                writable: true,
                                openedFilesLimit: Number(openedFilesLimit)
                            }, function() {
                                registerMountedCredential.call(
                                    this, userInfo.uid, dropboxClient.getAccessToken(), function() {
                                        successCallback();
                                    }.bind(this));
                            }.bind(this));
                        }.bind(this));
                    }
                }.bind(this));
            }.bind(this), function(reason) {
                console.log(reason);
                errorCallback(reason);
            }.bind(this));
        }.bind(this), function(reason) {
            console.log(reason);
            errorCallback(reason);
        }.bind(this));
    };

    DropboxFS.prototype.resume = function(fileSystemId, successCallback, errorCallback) {
        console.log("resume - start");
        getMountedCredential.call(this, fileSystemId, function(credential) {
            if (credential) {
                var dropboxClient = new DropboxClient(this);
                dropboxClient.setAccessToken(credential.accessToken);
                dropboxClient.setUid(credential.uid);
                this.dropbox_client_map_[fileSystemId] = dropboxClient;
                successCallback();
            } else {
                errorCallback("CREDENTIAL_NOT_FOUND");
            }
        }.bind(this));
    };

    DropboxFS.prototype.onUnmountRequested = function(options, successCallback, errorCallback) {
        console.log("onUnmountRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        doUnmount.call(this, dropboxClient, options.requestId, successCallback);
    };

    DropboxFS.prototype.onReadDirectoryRequested = function(options, successCallback, errorCallback) {
        console.log("onReadDirectoryRequested");
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.readDirectory(options.directoryPath, function(entryMetadataList) {
            var cache = getMetadataCache.call(this, options.fileSystemId);
            cache.put(options.directoryPath, entryMetadataList);
            successCallback(entryMetadataList, false);
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onGetMetadataRequested = function(options, successCallback, errorCallback) {
        console.log("onGetMetadataRequested: thumbnail=" + options.thumbnail);
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        if (options.thumbnail) {
            dropboxClient.getMetadata(
                options.entryPath, true, function(entryMetadata) {
                    successCallback(entryMetadata);
                }.bind(this), errorCallback);
        } else {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            var cache = metadataCache.get(options.entryPath);
            if (cache.directoryExists && cache.fileExists) {
                successCallback(cache.metadata);
            } else {
                dropboxClient.getMetadata(
                    options.entryPath, false, function(entryMetadata) {
                        successCallback(entryMetadata);
                    }.bind(this), errorCallback);
            }
        }
    };

    DropboxFS.prototype.onOpenFileRequested = function(options, successCallback, errorCallback) {
        console.log("onOpenFileRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.openFile(options.filePath, options.requestId, options.mode, function() {
            var openedFiles = getOpenedFiles.call(this, options.fileSystemId);
            openedFiles[options.requestId] = options.filePath;
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onReadFileRequested = function(options, successCallback, errorCallback) {
        console.log("onReadFileRequested - start");
        console.log(options);
        var filePath = getOpenedFiles.call(this, options.fileSystemId)[options.openRequestId];
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.readFile(
            filePath, options.offset, options.length, function(data, hasMore) {
                successCallback(data, hasMore);
                console.log("onReadFileRequested - end");
            }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onCloseFileRequested = function(options, successCallback, errorCallback) {
        console.log("onCloseFileRequested");
        var filePath = getOpenedFiles.call(this, options.fileSystemId)[options.openRequestId];
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.closeFile(filePath, options.openRequestId, function() {
            delete getOpenedFiles.call(this, options.fileSystemId)[options.openRequestId];
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onCreateDirectoryRequested = function(options, successCallback, errorCallback) {
        console.log("onCreateDirectoryRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.createDirectory(options.directoryPath, function() {
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onDeleteEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onDeleteEntryRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.deleteEntry(options.entryPath, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.entryPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onMoveEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onMoveEntryRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.moveEntry(options.sourcePath, options.targetPath, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onCopyEntryRequested = function(options, successCallback, errorCallback) {
        console.log("onCopyEntryRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.copyEntry(options.sourcePath, options.targetPath, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onWriteFileRequested = function(options, successCallback, errorCallback) {
        console.log("onWriteFileRequested");
        console.log(options);
        var filePath = getOpenedFiles.call(this, options.fileSystemId)[options.openRequestId];
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.writeFile(filePath, options.data, options.offset, options.openRequestId, function() {
            successCallback();
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onTruncateRequested = function(options, successCallback, errorCallback) {
        console.log("onTruncateRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.truncate(options.filePath, options.length, function() {
            console.log("onTruncateRequested - done");
            successCallback(false);
        }.bind(this), errorCallback);
    };

    DropboxFS.prototype.onCreateFileRequested = function(options, successCallback, errorCallback) {
        console.log("onCreateFileRequested");
        console.log(options);
        var dropboxClient = getDropboxClient.call(this, options.fileSystemId);
        dropboxClient.createFile(options.filePath, function() {
            var metadataCache = getMetadataCache.call(this, options.fileSystemId);
            metadataCache.remove(options.filePath);
            successCallback();
        }.bind(this), errorCallback);
    };

    // Private functions

    var doUnmount = function(dropboxClient, requestId, successCallback) {
        console.log("doUnmount");
        _doUnmount.call(
            this,
            dropboxClient.getUid(),
            function() {
                successCallback();
            }.bind(this));
    };

    var _doUnmount = function(uid, successCallback) {
        console.log("_doUnmount");
        unregisterMountedCredential.call(
            this, uid,
            function() {
                var fileSystemId = createFileSystemID.call(this, uid);
                console.log(fileSystemId);
                chrome.fileSystemProvider.unmount({
                    fileSystemId: fileSystemId
                }, function() {
                    delete this.dropbox_client_map_[fileSystemId];
                    deleteMetadataCache.call(this, fileSystemId);
                    successCallback();
                }.bind(this));
            }.bind(this));
    };

    var registerMountedCredential = function(uid, accessToken, callback) {
        var fileSystemId = createFileSystemID.call(this, uid);
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            credentials[fileSystemId] = {
                accessToken: accessToken,
                uid: uid
            };
            chrome.storage.local.set({
                credentials: credentials
            }, function() {
                callback();
            }.bind(this));
        }.bind(this));
    };

    var getMountedCredential = function(fileSystemId, callback) {
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            var credential = credentials[fileSystemId];
            callback(credential);
        }.bind(this));
    };

    var unregisterMountedCredential = function(uid, callback) {
        var fileSystemId = createFileSystemID.call(this, uid);
        chrome.storage.local.get("credentials", function(items) {
            var credentials = items.credentials || {};
            delete credentials[fileSystemId];
            chrome.storage.local.set({
                credentials: credentials
            }, function() {
                callback();
            }.bind(this));
        }.bind(this));
    };

    var createEventHandler = function(callback) {
        return function(options, successCallback, errorCallback) {
            var fileSystemId = options.fileSystemId;
            var dropboxClient = getDropboxClient.call(this, fileSystemId);
            if (!dropboxClient) {
                this.resume(fileSystemId, function() {
                    callback(options, successCallback, errorCallback);
                }.bind(this), function(reason) {
                    console.log("resume failed: " + reason);
                    chrome.notifications.create("", {
                        type: "basic",
                        title: "File System for Dropbox",
                        message: "Resuming failed. Unmount.",
                        iconUrl: "/images/48.png"
                    }, function(notificationId) {
                    }.bind(this));
                    getMountedCredential.call(this, fileSystemId, function(credential) {
                        if (credential) {
                            _doUnmount.call(
                                this,
                                credential.uid,
                                function() {
                                    errorCallback("FAILED");
                                }.bind(this));
                        } else {
                            console.log("Credential for [" + fileSystemId + "] not found.");
                            errorCallback("FAILED");
                        }
                    }.bind(this));
                }.bind(this));
            } else {
                callback(options, successCallback, errorCallback);
            }
        }.bind(this);
    };

    var assignEventHandlers = function() {
        console.log("Start: assignEventHandlers");
        chrome.fileSystemProvider.onUnmountRequested.addListener(
            function(options, successCallback, errorCallback) { // Unmount immediately
                var fileSystemId = options.fileSystemId;
                var dropboxClient = getDropboxClient.call(this, fileSystemId);
                if (!dropboxClient) {
                    this.resume(fileSystemId, function() {
                        this.onUnmountRequested(options, successCallback, errorCallback);
                    }.bind(this), function(reason) {
                        console.log("resume failed: " + reason);
                        errorCallback("FAILED");
                    }.bind(this));
                } else {
                    this.onUnmountRequested(options, successCallback, errorCallback);
                }
            }.bind(this));
        chrome.fileSystemProvider.onReadDirectoryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onReadDirectoryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onGetMetadataRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onGetMetadataRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onOpenFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onOpenFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onReadFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onReadFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCloseFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCloseFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCreateDirectoryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCreateDirectoryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onDeleteEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onDeleteEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onMoveEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onMoveEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCopyEntryRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCopyEntryRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onWriteFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onWriteFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onTruncateRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onTruncateRequested(options, successCallback, errorCallback);
                }.bind(this)));
        chrome.fileSystemProvider.onCreateFileRequested.addListener(
            createEventHandler.call(
                this,
                function(options, successCallback, errorCallback) {
                    this.onCreateFileRequested(options, successCallback, errorCallback);
                }.bind(this)));
        console.log("End: assignEventHandlers");
    };

    var getMetadataCache = function(fileSystemId) {
        var metadataCache = this.metadata_cache_[fileSystemId];
        if (!metadataCache) {
            metadataCache = new MetadataCache();
            this.metadata_cache_[fileSystemId] = metadataCache;
            console.log("getMetadataCache: Created. " + fileSystemId);
        }
        return metadataCache;
    };

    var deleteMetadataCache = function(fileSystemId) {
        console.log("deleteMetadataCache: " + fileSystemId);
        delete this.metadata_cache_[fileSystemId];
    };

    var createFileSystemID = function(uid) {
        return FILE_SYSTEM_ID + "://" + uid;
    };

    var getDropboxClient = function(fileSystemID) {
        var dropboxClient = this.dropbox_client_map_[fileSystemID];
        return dropboxClient;
    };

    var getOpenedFiles = function(fileSystemId) {
        var openedFiles = this.opened_files_[fileSystemId];
        if (!openedFiles) {
            openedFiles = {};
            this.opened_files_[fileSystemId] = openedFiles;
        }
        return openedFiles;
    };

    // Export

    window.DropboxFS = DropboxFS;

})();
