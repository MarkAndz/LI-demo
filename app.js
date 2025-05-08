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


const {
    IamAuthenticator
} = require('ibm-watson/auth');
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');


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
                // NLU: sentiment + emotion analysis
                    let sentiment = { label: 'neutral', score: 0 };
                let emotion   = { sadness:0, joy:0, fear:0, disgust:0, anger:0 };
                try {
                        const nluRes = await nlu.analyze({
                                text: trimmed,
                                features: {
                                  sentiment: {},
                                  emotion: {}    // ← request emotion
                                }
                        });

                            // extract sentiment
                               const docSent = nluRes.result.sentiment.document;
                        sentiment = { label: docSent.label, score: docSent.score };

                            // extract emotion breakdown
                                emotion = nluRes.result.emotion.document.emotion;
                    } catch (err) {
                        console.warn('NLU error, defaulting to neutral/emotion zero:', err.message);
                    }

        // Assign IDs
        const cid = db.get('nextCommentId').value();
        db.update('nextCommentId', n => n + 1).write();

                const comment = {
                        id: cid,
                        projectId: req.project.id,
                        text: trimmed,
                        sentiment,
                    emotion      // ← store emotion object
                };
        db.get('comments').push(comment).write();

        res.status(201).json(comment);
    }
);





app.put(
    '/projects/:projectId/comments/:id',
    checkProjectAuth,
    async (req, res, next) => {
        const pid = req.project.id;
        const cid = Number(req.params.id);
        const { text = '' } = req.body;
        const trimmed = text.trim();

        //Make sure comment exists
        const existing = db.get('comments')
            .find({ id: cid, projectId: pid })
            .value();
        if (!existing) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        //Enforce length requirement
        if (trimmed.length < 50) {
            return res
                .status(400)
                .json({ error: 'Comment must be at least 50 characters long' });
        }

        //Run analysis on updated text
        let sentiment = { label: 'neutral', score: 0 };
        let emotion   = { sadness:0, joy:0, fear:0, disgust:0, anger:0 };
        try {
            const nluRes = await nlu.analyze({
                text: trimmed,
                features: { sentiment: {}, emotion: {} }
            });

            //Extract sentiment
            const docSent = nluRes.result.sentiment.document;
            sentiment = { label: docSent.label, score: docSent.score };

            // xtract emotion breakdown
            emotion = nluRes.result.emotion.document.emotion;
        } catch (err) {
            console.warn('NLU error on update, defaulting values:', err.message);
        }

        //Persist updated comment
        const updated = db.get('comments')
            .find({ id: cid })
            .assign({
                text: trimmed,
                sentiment,
                emotion
            })
            .write();

        //Return updated comment
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

//Comment import
app.post(
    '/projects/:projectId/import',
    checkProjectAuth,
    upload.single('file'),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const text = req.file.buffer.toString('utf8');
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        const imported = [];
        const skipped = [];

        for (const line of lines) {
            if (line.length < 50) {
                skipped.push({ text: line, reason: 'too short' });
                continue;
            }
            // NLU
            let sentiment = { label:'neutral', score:0 };
            let emotion   = { sadness:0, joy:0, fear:0, disgust:0, anger:0 };
            try {
                const nluRes = await nlu.analyze({
                    text: line,
                    features: { sentiment:{}, emotion:{} }
                });
                const docSent = nluRes.result.sentiment.document;
                sentiment = { label:docSent.label, score:docSent.score };
                emotion   = nluRes.result.emotion.document.emotion;
            } catch {
                // leave defaults
            }

            //Persist
            const cid = db.get('nextCommentId').value();
            db.update('nextCommentId', n=>n+1).write();
            const comment = {
                id: cid,
                projectId: req.project.id,
                text: line,
                sentiment,
                emotion
            };
            db.get('comments').push(comment).write();
            imported.push(comment);
        }

        res.json({
            importedCount: imported.length,
            skippedCount: skipped.length,
            skipped
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


