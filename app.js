//env loadinu
require('dotenv').config();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs    = require('fs');
const https = require('https');
const path  = require('path');
const express = require('express');
const cors    = require('cors');
const bcrypt = require('bcrypt');
const db     = require('./db');


//IBM NLU helper+instance
const {
    IamAuthenticator
} = require('ibm-watson/auth');
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
const nlu = new NaturalLanguageUnderstandingV1({
    version: '2021-08-01',
    authenticator: new IamAuthenticator({ apikey: process.env.IBM_NLU_APIKEY }),
    serviceUrl:    process.env.IBM_NLU_URL,
});

const app = express();
app.use(cors());
app.use(express.json());


//mini server serving maybe?
app.use(express.static('public'));


//Project creation
app.post('/projects', async (req, res) => {
    const { name = '', password = '' } = req.body;
    const trimmedName = name.trim();
    const trimmedPwd  = password.trim();

    //Project name validation
    if (trimmedName.length < 5) {
        return res
            .status(400)
            .json({ error: 'Project name must be at least 5 characters long.' });
    }

    //Password validation
    const pwdErrors = [];
    if (trimmedPwd.length < 8) {
        pwdErrors.push('at least 8 characters');
    }
    if (!/[A-Z]/.test(trimmedPwd)) {
        pwdErrors.push('one uppercase letter');
    }
    if (!/\d/.test(trimmedPwd)) {
        pwdErrors.push('one digit');
    }
    if (pwdErrors.length) {
        return res
            .status(400)
            .json({ error: `Password must contain ${pwdErrors.join(', ')}.` });
    }

    //Check project name duplication
    const exists = db.get('projects').find({ name: trimmedName }).value();
    if (exists) {
        return res
            .status(409)
            .json({ error: 'A project with that name already exists.' });
    }

    //Hashing the psw
    const hash = await bcrypt.hash(trimmedPwd, 12);

    //Assigning an ID
    const id = db.get('nextProjectId').value();
    db.update('nextProjectId', n => n+1).write();
    db.get('projects').push({ id, name: trimmedName, passwordHash: hash }).write();

    res.status(201).json({ id, name: trimmedName });
});



//Listinuuuuuuuuuuuuu projects
app.get('/projects', (req, res) => {
    const list = db.get('projects').map(p => ({ id: p.id, name: p.name })).value();
    res.json(list);
});



async function checkProjectAuth(req, res, next) {

    const projectId = Number(req.params.projectId);
    const password  = req.headers['x-project-password'] || '';
    const proj      = db.get('projects').find({ id: projectId }).value();

    //OH NO!
    if (!proj) {
        return res.status(404).json({ error: 'Project not found : ((' });
    }
    //Comparing password to hash
    const match = await bcrypt.compare(password, proj.passwordHash);
    if (!match) {
        return res.status(401).json({ error: 'Invalid password ;((' });
    }
    req.project = proj;
    next();
}



app.get('/projects/:projectId/comments', checkProjectAuth, function(req, res) {
    var projectId = req.project.id;

    //fetching project's comments
    var comms = db.get('comments')
        .filter({ projectId: projectId })
        .value();

    //sentiment calculation!!!
    var totalScore = 0;
    for (var i = 0; i < comms.length; i++) {
        totalScore += comms[i].sentiment.score;
    }
    var averageSentiment = 0;
    if (comms.length > 0) {
        averageSentiment = totalScore / comms.length;
    }

    //Sending back the comms + avg sent
    res.json({
        comments: comms,
        averageSentiment: averageSentiment
    });
});


//New comment + analysis + save
app.post('/projects/:projectId/comments', checkProjectAuth, async function(req, res) {
    //Get text from field + trim
    let text = req.body.text ? req.body.text.trim() : '';
    if (text.length < 50) {
        return res.status(400).json({
            error: 'Comment must be at least 50 characters long'
        });
    }
    //default
    let sentiment = { label: 'neutral', score: 0 };
    let emotion   = { sadness: 0, joy: 0, fear: 0, disgust: 0, anger: 0 };

    //Bandom NLUUUU
    try {
        let result = await nlu.analyze({
            text: text,
            features: { sentiment: {}, emotion: {} }
        });
        let docSent = result.result.sentiment.document;
        sentiment = { label: docSent.label, score: docSent.score };
        emotion   = result.result.emotion.document.emotion;
    } catch (e) {
        console.warn('NLU failed, using defaults:', e.message);
    }

    //Create + save comm
    var newId = db.get('nextCommentId').value();
    db.update('nextCommentId', function(n) { return n + 1; }).write();
    var comment = {
        id: newId,
        projectId: req.project.id,
        text: text,
        sentiment: sentiment,
        emotion: emotion
    };
    db.get('comments').push(comment).write();

    res.status(201).json(comment);
});



//Edit comment handling
app.put('/projects/:projectId/comments/:id', checkProjectAuth, async function(req, res) {
    //parse id+text
    let projectId = req.project.id;
    let commentId = Number(req.params.id);
    let text = req.body.text ? req.body.text.trim() : '';

    //Comment exists or nah?
    let existing = db.get('comments')
        .find({ id: commentId, projectId: projectId })
        .value();
    if (!existing) {
        return res.status(404).json({ error: 'Comment not found' });
    }
    if (text.length < 50) {
        return res.status(400).json({
            error: 'Comment must be at least 50 characters long'
        });
    }

    //NLU analysis
    let sentiment = { label: 'neutral', score: 0 };
    let emotion   = { sadness: 0, joy: 0, fear: 0, disgust: 0, anger: 0 };
    try {
        let analysis = await nlu.analyze({
            text: text,
            features: { sentiment: {}, emotion: {} }
        });
        let docSent = analysis.result.sentiment.document;
        sentiment = { label: docSent.label, score: docSent.score };
        emotion   = analysis.result.emotion.document.emotion;
    } catch (e) {
        console.warn('NLU error on update, using defaults:', e.message);
    }

    //Save
    let updated = db.get('comments')
        .find({ id: commentId })
        .assign({
            text: text,
            sentiment: sentiment,
            emotion: emotion
        })
        .write();

    //return
    res.json(updated);
});


//DELETE selected comment
app.delete(
    '/projects/:projectId/comments/:id',
    checkProjectAuth,
    (req, res) => {
        const pid = req.project.id;
        const cid = Number(req.params.id);

        //Checkinu ar toks comment + project yraaa
        const removed = db
            .get('comments')
            .remove({ id: cid, projectId: pid })
            .write();

        if (removed.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        res.status(204).end();
    }
);

//Comment import
app.post('/projects/:projectId/import',
    checkProjectAuth,
    upload.single('file'),
    async function(req, res) {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        //spliting
        let text = req.file.buffer.toString('utf8');
        let rawLines = text.split(/\r?\n/);
        let importedCount = 0;
        let skippedCount  = 0;
        let skipped       = [];

        for (let i = 0; i < rawLines.length; i++) {
            let line = rawLines[i].trim();
            if (line === '') {
                continue;
            }
            if (line.length < 50) {
                skippedCount++;
                skipped.push({ text: line, reason: 'too short' });
                continue;
            }

            //nlu defaults
            let sentiment = { label: 'neutral', score: 0 };
            let emotion   = { sadness: 0, joy: 0, fear: 0, disgust: 0, anger: 0 };

            //lets try NLU ! !
            try {
                let response = await nlu.analyze({
                    text: line,
                    features: { sentiment: {}, emotion: {} }
                });
                let docSent = response.result.sentiment.document;
                sentiment = { label: docSent.label, score: docSent.score };
                emotion   = response.result.emotion.document.emotion;
            } catch (e) {
                console.warn('NLU error, using defaults:', e.message);
            }

            //saving in the db
            let id = db.get('nextCommentId').value();
            db.update('nextCommentId', n => n + 1).write();
            let comment = {
                id: id,
                projectId: req.project.id,
                text: line,
                sentiment: sentiment,
                emotion: emotion
            };
            db.get('comments').push(comment).write();

            importedCount++;
        }

        res.json({
            importedCount: importedCount,
            skippedCount: skippedCount,
            skipped: skipped
        });
    }
);


app.delete(
    '/projects/:projectId',
    checkProjectAuth,
    (req, res) => {
        const pid = req.project.id;

        //Remove project's comments
        db.get('comments')
            .remove({ projectId: pid })
            .write();

        //Remove project
        db.get('projects')
            .remove({ id: pid })
            .write();

        //Response. No content
        res.status(204).end();
    }
);

// load cert/key
const options = {
    key:  fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
};

//https on port 8000
https.createServer(options, app)
    .listen(8000, () => {
        console.log('HTTPS listening on https://localhost:8000');
    });


