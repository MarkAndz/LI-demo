require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

//Static files from public
app.use(express.static('public'));


app.get('/', (req, res) => {
  res.json({ message: 'API is alive!' });
});

let comments = [];
let nextId   = 1;

app.post('/comments', (req, res) => {
  const comment = { id: nextId++, ...req.body };
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
