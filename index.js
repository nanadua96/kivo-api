import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/ping', (_, res) => res.send('pong'));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
