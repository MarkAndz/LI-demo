require('dotenv').config();
const fs    = require('fs');
const https = require('https');
const path  = require('path');
const express = require('express');
const cors    = require('cors');


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
const db = require('./db');

// GET comments from db.json
app.get('/comments', (req, res) => {
    const comments = db.get('comments').value();
    res.json(comments);
});

app.post('/comments', async (req, res, next) => {
    const { text = '' } = req.body;
    const trimmed = text.trim();

    // Under 50 chars: reject
    if (trimmed.length < 50) {
        return res
            .status(400)
            .json({ error: 'Comment must be at least 50 characters long' });
    }

    // Perform sentiment analysis
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

    // Fetch and increment nextId in the DB
    const id = db.get('nextId').value();
    db.update('nextId', n => n + 1).write();

    //Persist comment
    const comment = { id, text: trimmed, sentiment };
    db.get('comments').push(comment).write();

    res.status(201).json(comment);
});





app.put('/comments/:id', (req, res) => {
    const id = Number(req.params.id);

    //Check if exists
    const existing = db.get('comments').find({ id }).value();
    if (!existing) {
        return res.status(404).json({ error: 'Comment not found' });
    }

    //Update
    const updated = db.get('comments')
        .find({ id })
        .assign({ text: req.body.text })
        .write();

    res.json(updated);
});

//DELETE by ID
app.delete('/comments/:id', (req, res) => {
    const id = Number(req.params.id);

    // Remove and get the removed array
    const removed = db.get('comments')
        .remove({ id })
        .write();

    if (removed.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
    }

    res.status(204).end();
});


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


