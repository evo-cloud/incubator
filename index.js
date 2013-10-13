module.exports = {
    Package:     require('./lib/Package'),
    Packages:    require('./lib/Packages'),
    Digests:     require('./lib/Digests'),
    Downloader:  require('./lib/Downloader'),
    FileCache:   require('./lib/FileCache'),
    VersionCtrl: require('./lib/VersionCtrl'),
    BuildEngine: require('./lib/BuildEngine'),
    Builder:     require('./lib/Builder'),
    TermLogger:  require('./lib/TermLogger'),
    StreamLogger:require('./lib/StreamLogger')
};