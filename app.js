const express = require('express');
const app     = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'API is alive!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
