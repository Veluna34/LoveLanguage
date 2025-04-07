const express = require('express');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = app.listen(5500, () => {
  console.log('Server running on port 5500');
});

app.use(express.static(path.join(__dirname, '../public')));

// Socket.IO and server routes go here
// (Keep your existing server logic but remove ALL DOM references)