'use strict';

class MetadataCache {

    constructor() {
        this.directories_ = {};
    }

    put(directoryPath, metadataList) {
        delete this.directories_[directoryPath];
        const entries = {};
        for (let i = 0; i < metadataList.length; i++) {
            const metadata = metadataList[i];
            entries[metadata.name] = metadata;
        }
        this.directories_[directoryPath] = entries;
    }

    dir(directoryPath) {
        return this.directories_[directoryPath];
    }

    get(entryPath) {
        if (entryPath === '/') {
            return {
                needFetch: true,
                exists: true
            };
        } else {
            const lastDelimiterPos = entryPath.lastIndexOf('/');
            let directoryPath;
            let name;
            if (lastDelimiterPos === 0) {
                directoryPath = '/';
                name = entryPath.substring(1);
            } else {
                directoryPath = entryPath.substring(0, lastDelimiterPos);
                name = entryPath.substring(lastDelimiterPos + 1);
            }
            const entries = this.directories_[directoryPath];
            if (entries) {
                const entry = entries[name];
                if (entry) {
                    return {
                        directoryExists: true,
                        fileExists: true,
                        metadata: entry
                    };
                } else {
                    return {
                        directoryExists: true,
                        fileExists: false
                    };
                }
            } else {
                return {
                    directoryExists: false,
                    fileExists: false
                };
            }
        }
    }

    remove(entryPath) {
        for (let key in this.directories_) {
            if (key.indexOf(entryPath) === 0) {
                delete this.directories_[key];
            }
        }
        const lastDelimiterPos = entryPath.lastIndexOf('/');
        if (lastDelimiterPos !== 0) {
            delete this.directories_[entryPath.substring(0, lastDelimiterPos)];
        }
    }

};

// Export
window.MetadataCache = MetadataCache;
