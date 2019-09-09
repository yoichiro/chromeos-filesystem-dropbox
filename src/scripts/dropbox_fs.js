'use strict';

// Constants

const FILE_SYSTEM_ID = 'dropboxfs';
const FILE_SYSTEM_NAME = 'Dropbox';

class DropboxFS {

    // Constructor

    constructor() {
        this.dropbox_client_map_ = {};
        this.metadata_cache_ = {};
        this.watchers_ = {};
        this.assignEventHandlers();
    }

    // Public functions

    mount(successCallback, errorCallback) {
        const dropboxClient = new DropboxClient(this);
        dropboxClient.authorize(() => {
            dropboxClient.getUserInfo((userInfo) => {
                console.log(userInfo);
                const fileSystemId = this.createFileSystemID(userInfo.uid);
                chrome.fileSystemProvider.getAll(fileSystems => {
                    let mounted = false;
                    for (let i = 0; i < fileSystems.length; i++) {
                        if (fileSystems[i].fileSystemId === fileSystemId) {
                            mounted = true;
                            break;
                        }
                    }
                    if (mounted) {
                        errorCallback('ALREADY_MOUNTED');
                    } else {
                        this.dropbox_client_map_[fileSystemId] = dropboxClient;
                        chrome.storage.local.get('settings', items => {
                            const settings = items.settings || {};
                            const openedFilesLimit = settings.openedFilesLimit || '10';
                            chrome.fileSystemProvider.mount({
                                fileSystemId: fileSystemId,
                                displayName: FILE_SYSTEM_NAME + ' (' + userInfo.displayName + ')',
                                writable: true,
                                openedFilesLimit: Number(openedFilesLimit)
                            }, () => {
                                this.registerMountedCredential(
                                    userInfo.uid, dropboxClient.getAccessToken(), () => {
                                        successCallback();
                                    });
                            });
                        });
                    }
                });
            }, reason => {
                console.log(reason);
                errorCallback(reason);
            });
        }, reason => {
            console.log(reason);
            errorCallback(reason);
        });
    }

    resume(fileSystemId, successCallback, errorCallback) {
        console.log('resume - start');
        this.getMountedCredential(fileSystemId, credential => {
            if (credential) {
                const dropboxClient = new DropboxClient(this);
                dropboxClient.setAccessToken(credential.accessToken);
                dropboxClient.setUid(credential.uid);
                this.dropbox_client_map_[fileSystemId] = dropboxClient;
                console.log('resume - end');
                successCallback();
            } else {
                errorCallback('CREDENTIAL_NOT_FOUND');
            }
        });
    }

    unmount(dropboxClient, callback) {
        this.doUnmount(dropboxClient, null, callback);
    }

    onUnmountRequested(options, successCallback, _errorCallback) {
        console.log('onUnmountRequested');
        console.log(options);
        const dropboxClient = this.getDropboxClient(options.fileSystemId);
        this.doUnmount(dropboxClient, options.requestId, successCallback);
    }

    onReadDirectoryRequested(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.readDirectory(options.directoryPath, entryMetadataList => {
            const cache = this.getMetadataCache(options.fileSystemId);
            cache.put(options.directoryPath, entryMetadataList);
            successCallback(entryMetadataList.map(e => {
                return this.trimMetadata(options, e);
            }), false);
        }, errorCallback);
    }

    onGetMetadataRequested(dropboxClient, options, successCallback, errorCallback) {
        const metadataCache = this.getMetadataCache(options.fileSystemId);
        const cache = metadataCache.get(options.entryPath);
        if (cache.directoryExists && cache.fileExists && !options.thumbnail) {
            successCallback(this.trimMetadata(options, cache.metadata));
        } else {
            dropboxClient.getMetadata(
                options.entryPath, entryMetadata => {
                    successCallback(this.trimMetadata(options, entryMetadata));
                }, errorCallback);
        }
    }

    onOpenFileRequested(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.openFile(options.filePath, options.requestId, options.mode, successCallback, errorCallback);
    }

    onReadFileRequested(dropboxClient, options, successCallback, errorCallback) {
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            dropboxClient.readFile(
                openedFile.filePath, options.offset, options.length, (data, hasMore) => {
                    successCallback(data, hasMore);
                    console.log('onReadFileRequested - end');
                }, errorCallback);
        });
    }

    onCloseFileRequested(dropboxClient, options, successCallback, errorCallback) {
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            dropboxClient.closeFile(openedFile.filePath, options.openRequestId, openedFile.mode, successCallback, errorCallback);
        });
    }

    onCreateDirectoryRequested(dropboxClient, options, successCallback, errorCallback) {
        this.createOrDeleteEntry(
            'createDirectory', options.directoryPath, dropboxClient, options, successCallback, errorCallback);
    }

    onDeleteEntryRequested(dropboxClient, options, successCallback, errorCallback) {
        this.createOrDeleteEntry(
            'deleteEntry', options.entryPath, dropboxClient, options, successCallback, errorCallback);
    }

    onMoveEntryRequested(dropboxClient, options, successCallback, errorCallback) {
        this.copyOrMoveEntry('moveEntry', dropboxClient, options, successCallback, errorCallback);
    }

    onCopyEntryRequested(dropboxClient, options, successCallback, errorCallback) {
        this.copyOrMoveEntry('copyEntry', dropboxClient, options, successCallback, errorCallback);
    }

    onWriteFileRequested(dropboxClient, options, successCallback, errorCallback) {
        this.getOpenedFile(options.fileSystemId, options.openRequestId, openedFile => {
            dropboxClient.writeFile(openedFile.filePath, options.data, options.offset, options.openRequestId, () => {
                const metadataCache = this.getMetadataCache(options.fileSystemId);
                metadataCache.remove(openedFile.filePath);
                successCallback();
            }, errorCallback);
        });
    }

    onTruncateRequested(dropboxClient, options, successCallback, errorCallback) {
        dropboxClient.truncate(options.filePath, options.length, () => {
            const metadataCache = this.getMetadataCache(options.fileSystemId);
            metadataCache.remove(options.filePath);
            console.log('onTruncateRequested - done');
            successCallback(false);
        }, errorCallback);
    }

    onCreateFileRequested(dropboxClient, options, successCallback, errorCallback) {
        this.createOrDeleteEntry(
            'createFile', options.filePath, dropboxClient, options, successCallback, errorCallback);
    }

    onAddWatcherRequested(dropboxClient, options, successCallback, _errorCallback) {
        const watchers = this.getWatchers(options.fileSystemId);
        watchers.add(options.entryPath);
        successCallback();
    }

    onRemoveWatcherRequested(dropboxClient, options, successCallback, _errorCallback) {
        const watchers = this.getWatchers(options.fileSystemId);
        watchers.delete(options.entryPath);
        successCallback();
    }

    onAlarm(_alarm) {
        for (let fileSystemId in this.watchers_) {
            const dropboxClient = this.getDropboxClient(fileSystemId);
            const watchers = this.watchers_[fileSystemId];
            for (let watcher of watchers.values()) {
                this.watchDirectory(fileSystemId, dropboxClient, watcher);
            }
        }
    }

    // Private functions

    trimMetadata(options, metadata) {
        const result = {};
        if (options.isDirectory) {
            result.isDirectory = metadata.isDirectory;
        }
        if (options.name) {
            result.name = metadata.name;
        }
        if (options.size) {
            result.size = metadata.size;
        }
        if (options.modificationTime) {
            result.modificationTime = metadata.modificationTime;
        }
        if (options.thumbnail) {
            result.thumbnail = metadata.thumbnail;
        }
        return result;
    }

    copyOrMoveEntry(operation, dropboxClient, options, successCallback, errorCallback) {
        dropboxClient[operation](options.sourcePath, options.targetPath, () => {
            const metadataCache = this.getMetadataCache(options.fileSystemId);
            metadataCache.remove(options.sourcePath);
            metadataCache.remove(options.targetPath);
            successCallback();
        }, errorCallback);
    }

    createOrDeleteEntry(operation, path, dropboxClient, options, successCallback, errorCallback) {
        dropboxClient[operation](path, () => {
            const metadataCache = this.getMetadataCache(options.fileSystemId);
            metadataCache.remove(path);
            successCallback();
        }, errorCallback);
    }

    doUnmount(dropboxClient, requestId, successCallback) {
        console.log('doUnmount');
        this._doUnmount(
            dropboxClient.getUid(),
            successCallback
        );
    }

    _doUnmount(uid, successCallback) {
        console.log('_doUnmount');
        this.unregisterMountedCredential(
            uid,
            ()=> {
                const fileSystemId = this.createFileSystemID(uid);
                console.log(fileSystemId);
                delete this.dropbox_client_map_[fileSystemId];
                this.deleteMetadataCache(fileSystemId);
                this.deleteWatchers(fileSystemId);
                successCallback();
                chrome.fileSystemProvider.unmount({
                    fileSystemId: fileSystemId
                }, () => {
                    // N/A
                });
            }
        );
    }

    registerMountedCredential(uid, accessToken, callback) {
        const fileSystemId = this.createFileSystemID(uid);
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            credentials[fileSystemId] = {
                accessToken: accessToken,
                uid: uid
            };
            chrome.storage.local.set({
                credentials: credentials
            }, callback);
        });
    }

    getMountedCredential(fileSystemId, callback) {
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            const credential = credentials[fileSystemId];
            callback(credential);
        });
    }

    unregisterMountedCredential(uid, callback) {
        const fileSystemId = this.createFileSystemID(uid);
        chrome.storage.local.get('credentials', items => {
            const credentials = items.credentials || {};
            delete credentials[fileSystemId];
            chrome.storage.local.set({
                credentials: credentials
            }, callback);
        });
    }

    createEventHandler(callback) {
        return (options, successCallback, errorCallback) => {
            const fileSystemId = options.fileSystemId;
            const dropboxClient = this.getDropboxClient(fileSystemId);
            if (!dropboxClient) {
                this.resume(fileSystemId, () => {
                    callback(options, successCallback, errorCallback);
                }, reason => {
                    console.log('resume failed: ' + reason);
                    chrome.notifications.create('', {
                        type: 'basic',
                        title: 'File System for Dropbox',
                        message: 'Resuming failed. Unmount.',
                        iconUrl: '/images/48.png'
                    }, _notificationId => {
                    });
                    this.getMountedCredential(fileSystemId, credential => {
                        if (credential) {
                            this._doUnmount(
                                credential.uid,
                                () => {
                                    errorCallback('FAILED');
                                });
                        } else {
                            console.log('Credential for [' + fileSystemId + '] not found.');
                            errorCallback('FAILED');
                        }
                    });
                });
            } else {
                callback(options, successCallback, errorCallback);
            }
        };
    }

    assignEventHandlers() {
        console.log('Start: assignEventHandlers');
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === 'dropbox_alarm') {
                this.onAlarm(alarm);
            }
        });
        chrome.alarms.create('dropbox_alarm', {
            delayInMinutes: 1,
            periodInMinutes: 1
        });
        chrome.fileSystemProvider.onUnmountRequested.addListener(
            (options, successCallback, errorCallback) => { // Unmount immediately
                console.log('onUnmountRequested', options);
                const fileSystemId = options.fileSystemId;
                const dropboxClient = this.getDropboxClient(fileSystemId);
                if (!dropboxClient) {
                    this.resume(fileSystemId, () => {
                        this.onUnmountRequested(options, successCallback, errorCallback);
                    }, reason => {
                        console.log('resume failed: ' + reason);
                        errorCallback('FAILED');
                    });
                } else {
                    this.onUnmountRequested(options, successCallback, errorCallback);
                }
            });
        const funcNameList = [
            'onReadDirectoryRequested',
            'onGetMetadataRequested',
            'onOpenFileRequested',
            'onReadFileRequested',
            'onCloseFileRequested',
            'onCreateDirectoryRequested',
            'onDeleteEntryRequested',
            'onMoveEntryRequested',
            'onCopyEntryRequested',
            'onWriteFileRequested',
            'onTruncateRequested',
            'onCreateFileRequested',
            'onAddWatcherRequested',
            'onRemoveWatcherRequested'
        ];
        const caller = (self, funcName) => {
            return (options, successCallback, errorCallback) => {
                console.log(funcName, options);
                const dropboxClient = this.getDropboxClient(options.fileSystemId);
                this[funcName](dropboxClient, options, successCallback, errorCallback);
            };
        };
        for (let i = 0; i < funcNameList.length; i++) {
            chrome.fileSystemProvider[funcNameList[i]].addListener(
                this.createEventHandler(
                    caller(this, funcNameList[i])
                )
            );
        }
        console.log('End: assignEventHandlers');
    }

    getMetadataCache(fileSystemId) {
        let metadataCache = this.metadata_cache_[fileSystemId];
        if (!metadataCache) {
            metadataCache = new MetadataCache();
            this.metadata_cache_[fileSystemId] = metadataCache;
            console.log('getMetadataCache: Created. ' + fileSystemId);
        }
        return metadataCache;
    };

    deleteMetadataCache(fileSystemId) {
        console.log('deleteMetadataCache: ' + fileSystemId);
        delete this.metadata_cache_[fileSystemId];
    };

    createFileSystemID(uid) {
        return FILE_SYSTEM_ID + '://' + uid;
    };

    getDropboxClient(fileSystemID) {
        return this.dropbox_client_map_[fileSystemID];
    };

    getOpenedFiles(fileSystemId, callback) {
        chrome.fileSystemProvider.get(fileSystemId, fileSystem => {
            callback(fileSystem.openedFiles);
        });
    };

    getOpenedFile(fileSystemId, openRequestId, callback) {
        this.getOpenedFiles(fileSystemId, openedFiles => {
            const openedFile = openedFiles.filter(x => {
                return x.openRequestId === openRequestId;
            });
            if (openedFile.length >= 1) {
                callback(openedFile[0]);
            } else {
                throw new Error('OpenedFile information not found. openRequestId=' + openRequestId);
            }
        });
    };

    getWatchers(fileSystemId) {
        let watchers = this.watchers_[fileSystemId];
        if (!watchers) {
            watchers = new Set();
            this.watchers_[fileSystemId] = watchers;
        }
        return watchers;
    }

    deleteWatchers(fileSystemId) {
        delete this.watchers_[fileSystemId];
    }

    useWatcher(callback) {
        chrome.storage.local.get('settings', items => {
            const settings = items.settings || {};
            callback(settings.useWatcher || false);
        });
    }

    watchDirectory(fileSystemId, dropboxClient, entryPath) {
        this.useWatcher(use => {
            if (!use) {
                return;
            }
            console.log('watchDirectory:', entryPath);
            dropboxClient.readDirectory(entryPath, entries => {
                const metadataCache = this.getMetadataCache(fileSystemId);
                const currentList = entries;
                const oldList = metadataCache.dir(entryPath) || {};
                const nameSet = new Set();
                for (let i = 0; i < currentList.length; i++) {
                    const current = currentList[i];
                    const old = oldList[current.name];
                    if (old) {
                        // Changed
                        const isBothDirectory = current.isDirectory && old.isDirectory;
                        const isMatchType = current.isDirectory === old.isDirectory;
                        const isMatchSize = current.size === old.size;
                        const isMatchModificationTime = current.modificationTime.getTime() === old.modificationTime.getTime();
                        if (!isBothDirectory && !(isMatchType && isMatchSize && isMatchModificationTime)) {
                            console.log('Changed:', current.name);
                            this.notifyEntryChanged(fileSystemId, entryPath, 'CHANGED', current.name);
                        }
                    } else {
                        // Added
                        console.log('Added:', current.name);
                        this.notifyEntryChanged(fileSystemId, entryPath, 'CHANGED', current.name);
                    }
                    nameSet.add(current.name);
                }
                for (let oldName in oldList) {
                    if (!nameSet.has(oldName)) {
                        // Deleted
                        console.log('Deleted:', oldName);
                        this.notifyEntryChanged(fileSystemId, entryPath, 'DELETED', oldName);
                    }
                }
                metadataCache.put(entryPath, currentList);
            }, (reason) => {
                console.log(reason);
            });
        });
    }

    notifyEntryChanged(fileSystemId, directoryPath, changeType, entryPath) {
        console.log(`notifyEntryChanged: ${directoryPath} ${entryPath} ${changeType}`);
        chrome.fileSystemProvider.notify({
            fileSystemId: fileSystemId,
            observedPath: directoryPath,
            recursive: false,
            changeType: 'CHANGED',
            changes: [
                {entryPath: entryPath, changeType: changeType}
            ]
        }, () => {});
    }

};

// Export
window.DropboxFS = DropboxFS;
