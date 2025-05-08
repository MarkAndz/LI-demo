require('dotenv').config();
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

let comments = [];
let nextId   = 1;

app.get('/comments', (req, res) => {
  res.json(comments);
});

app.post('/comments', async (req, res, next) => {
    const { text = '' } = req.body;
    const trimmed = text.trim();

    //Under 50char not accepted
    if (trimmed.length < 50) {
        return res
            .status(400)
            .json({ error: 'Comment must be at least 50 characters long' });
    }

    //Run analysis
    let sentiment = { label: 'neutral', score: 0 };
    try {
        const nluRes = await nlu.analyze({
            text: trimmed,
            features: { sentiment: {} }
        });
        const doc = nluRes.result.sentiment.document;
        sentiment = { label: doc.label, score: doc.score };
    } catch (err) {
        console.warn('NLU error, defaulting neutral:', err.message);
    }

    //Store comments
    const comment = { id: nextId++, text: trimmed, sentiment };
    comments.push(comment);
    res.status(201).json(comment);
});





app.put('/comments/:id', (req, res) => {
  const id  = Number(req.params.id);
  const idx = comments.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  comments[idx] = { ...comments[idx], ...req.body };
  console.log('Updated comment:', comments[idx]);
  res.json(comments[idx]);
});
// DELETE /comments/:id
app.delete('/comments/:id', (req, res) => {
  const idBefore = comments.length;
  comments = comments.filter(c => c.id !== Number(req.params.id));
  if (comments.length === idBefore) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  console.log('Deleted comment id:', req.params.id);
  res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
