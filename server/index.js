const express = require('express');
const path = require('path');
const cors = require('cors');



const app = express();
app.use(cors());

const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send({
    message: 'Express server is running',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});

