require('dotenv').config();
const fs    = require('fs');
const https = require('https');
const path  = require('path');
const express = require('express');
const cors    = require('cors');
const bcrypt = require('bcrypt');
const db     = require('./db');


const { IamAuthenticator } = require('ibm-watson/auth');
const NaturalLanguageUnderstandingV1 =
    require('ibm-watson/natural-language-understanding/v1');


const app = express();
app.use(cors());
app.use(express.json());


//Static files from public
app.use(express.static('public'));

const nlu = new NaturalLanguageUnderstandingV1({
  version: '2021-08-01',
  authenticator: new IamAuthenticator({ apikey: process.env.IBM_NLU_APIKEY }),
  serviceUrl:    process.env.IBM_NLU_URL,
});



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
    db.update('nextProjectId', n => n + 1).write();
    db.get('projects')
        .push({ id, name: trimmedName, passwordHash: hash })
        .write();

    res.status(201).json({ id, name: trimmedName });
});


//Listing projects
app.get('/projects', (req, res) => {
    const list = db.get('projects')
        .map(p => ({ id: p.id, name: p.name }))
        .value();
    res.json(list);
});

async function checkProjectAuth(req, res, next) {
    const projectId = Number(req.params.projectId);
    const password  = req.headers['x-project-password'] || '';
    const proj      = db.get('projects').find({ id: projectId }).value();

    if (!proj) {
        return res.status(404).json({ error: 'Project not found' });
    }
    //Comparing password to hash
    const match = await bcrypt.compare(password, proj.passwordHash);
    if (!match) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    req.project = proj;
    next();
}
//Checking auth before GET comments of that project
app.get(
    '/projects/:projectId/comments',
    checkProjectAuth,
    (req, res) => {
        const pid = req.project.id;
        const comms = db.get('comments').filter({ projectId: pid }).value();

        const averageSentiment =
            comms.length === 0
                ? 0
                : comms.reduce((sum, c) => sum + c.sentiment.score, 0) / comms.length;
        res.json({ comments: comms, averageSentiment });
    }
);

app.post(
    '/projects/:projectId/comments',
    checkProjectAuth,
    async (req, res, next) => {
        const { text = '' } = req.body;
        const trimmed = text.trim();

        // Under 50 chars comments are rejected
        if (trimmed.length < 50) {
            return res
                .status(400)
                .json({ error: 'Comment must be at least 50 characters long' });
        }

        // Sentiment analysis
        let sentiment = { label: 'neutral', score: 0 };
        try {
            const nluRes = await nlu.analyze({
                text: trimmed,
                features: { sentiment: {} }
            });
            const doc = nluRes.result.sentiment.document;
            sentiment = { label: doc.label, score: doc.score };
        } catch (err) {
            console.warn('NLU error, defaulting to neutral:', err.message);
        }

        // Assign IDs
        const cid = db.get('nextCommentId').value();
        db.update('nextCommentId', n => n + 1).write();

        // Persist
        const comment = {
            id: cid,
            projectId: req.project.id,
            text: trimmed,
            sentiment
        };
        db.get('comments').push(comment).write();

        res.status(201).json(comment);
    }
);





app.put(
    '/projects/:projectId/comments/:id',
    checkProjectAuth,
    (req, res) => {
        const pid = req.project.id;
        const cid = Number(req.params.id);

        // Ensure it belongs to this project
        const existing = db
            .get('comments')
            .find({ id: cid, projectId: pid })
            .value();
        if (!existing) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const updated = db
            .get('comments')
            .find({ id: cid })
            .assign({ text: req.body.text })
            .write();

        res.json(updated);
    }
);



//DELETE selected comment
app.delete(
    '/projects/:projectId/comments/:id',
    checkProjectAuth,
    (req, res) => {
        const pid = req.project.id;
        const cid = Number(req.params.id);

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


