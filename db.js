const low    = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path   = require('path');

//Data persistence in data/db.json
const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db      = low(adapter);

db.defaults({
    projects: [],       //{id, name, passwordHash}
    comments: [],       //{id, projectId, text, sentiment}
    nextProjectId: 1,
    nextCommentId: 1
}).write();

module.exports = db;
