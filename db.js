//loco db
const low    = require('lowdb');
//read+write
const FileSync = require('lowdb/adapters/FileSync');
//safe fsystem pathing
const path   = require('path');

//path to db
const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db      = low(adapter);

db.defaults({
    projects: [],       //{id, name, passwordHash}
    comments: [],       //{id, projectId, text, sentiment}
    nextProjectId: 1,
    nextCommentId: 1
}).write();

//exportuojuu
module.exports = db;
