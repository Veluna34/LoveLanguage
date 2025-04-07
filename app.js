// server.js (or your main server file)
const express = require('express');
const app = express();
const path = require('path');

app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Define a route for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html')); // Make sure this is the correct path to your main HTML file
});
