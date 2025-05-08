const low    = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path   = require('path');

//Data persistence in data/db.json
const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db      = low(adapter);

db.defaults({ comments: [], nextId: 1 })
    .write();

module.exports = db;
