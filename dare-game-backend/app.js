const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(express.json());

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

const lobbies = {}; // { lobbyName: { password, players: [], gameState: {} } }

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('createLobby', ({ lobbyName, password, playerName }) => {
    if (lobbies[lobbyName]) {
      socket.emit('error', 'Lobby name already taken.');
      return;
    }
    lobbies[lobbyName] = {
      password,
      players: [],
      gameState: createNewGameState()
    };
    joinLobby(socket, lobbyName, password, playerName);
    updateLobbyList();
  });

  socket.on('getLobbies', () => {
    const lobbyList = Object.entries(lobbies).map(([name, lobby]) => ({
      name,
      count: lobby.players.length
    }));
    socket.emit('lobbyList', lobbyList);
  });

  socket.on('joinLobby', ({ lobbyName, password, playerName }) => {
    joinLobby(socket, lobbyName, password, playerName);
  });

  function joinLobby(socket, lobbyName, password, playerName) {
    const lobby = lobbies[lobbyName];
    if (!lobby) return socket.emit('error', 'Lobby not found.');
    if (lobby.password !== password) return socket.emit('error', 'Incorrect password.');
    if (lobby.players.length >= 2) return socket.emit('error', 'Lobby full.');

    socket.join(lobbyName);
    socket.data.lobby = lobbyName;
    socket.data.playerName = playerName;
    lobby.players.push({ id: socket.id, name: playerName });

    const gameState = lobby.gameState;
    gameState.players[socket.id] = { id: socket.id, name: playerName };

    io.to(lobbyName).emit('updatePlayers', lobby.players);
    io.to(socket.id).emit('gameState', gameState);
    io.to(socket.id).emit('lobbyJoined', { lobbyName, gameState });

    if (lobby.players.length === 2) {
      gameState.currentTurn = lobby.players[0].id;
      io.to(lobbyName).emit('turnUpdate', gameState.currentTurn, gameState.players[gameState.currentTurn].name);
      startQuestionRound(lobbyName);
    }
    
  }

  socket.on('submitQuestion', (question) => {
    const lobby = lobbies[socket.data.lobby];
    if (!lobby) return;
    lobby.gameState.questions.push(question);
    io.to(socket.data.lobby).emit('questionAdded', question);
  });

  socket.on('submitDare', (dare) => {
    const lobby = lobbies[socket.data.lobby];
    if (!lobby) return;
    lobby.gameState.dares.push(dare);
    io.to(socket.data.lobby).emit('dareAdded', dare);
  });

  socket.on('submitAnswer', ({ answer, imageUrl }) => {
    const lobby = lobbies[socket.data.lobby];
    const gameState = lobby?.gameState;
    if (!gameState || socket.id !== gameState.currentTurn || !imageUrl) return;

    const entry = {
      player: socket.data.playerName,
      question: gameState.currentQuestion,
      answer,
      imageUrl,
      timestamp: new Date().toISOString()
    };
    gameState.history.questions.push(entry);
    io.to(socket.data.lobby).emit('answerSubmitted', entry);
    nextTurn(socket.data.lobby);
  });

  socket.on('completeDare', ({ imageUrl }) => {
    const lobby = lobbies[socket.data.lobby];
    const gameState = lobby?.gameState;
    if (!gameState || socket.id !== gameState.currentTurn || !imageUrl) return;

    const entry = {
      player: socket.data.playerName,
      dare: gameState.currentDare,
      imageUrl,
      timestamp: new Date().toISOString()
    };
    gameState.history.dares.push(entry);
    io.to(socket.data.lobby).emit('dareSubmitted', entry);
    nextTurn(socket.data.lobby);
  });

  socket.on('disconnect', () => {
    const lobbyName = socket.data.lobby;
    const playerName = socket.data.playerName;
    const lobby = lobbies[lobbyName];
    if (!lobby) return;

    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    delete lobby.gameState.players[socket.id];

    io.to(lobbyName).emit('updatePlayers', lobby.players);
    if (socket.id === lobby.gameState.currentTurn) {
      nextTurn(lobbyName);
    }

    if (lobby.players.length === 0) delete lobbies[lobbyName];
    updateLobbyList();
    console.log(`${playerName} disconnected from ${lobbyName}`);
  });

  function updateLobbyList() {
    const lobbyList = Object.entries(lobbies).map(([name, lobby]) => ({
      name,
      count: lobby.players.length
    }));
    io.emit('lobbyList', lobbyList);
  }

  function createNewGameState() {
    return {
      players: {},
      currentTurn: null,
      currentQuestion: null,
      currentDare: null,
      timer: null,
      questions: [
        "What's your favorite memory of us?",
        "What do you love most about me?",
        "If we could go anywhere right now, where would you take me?",
        "What's your favorite thing about our relationship?",
        "What's something you've always wanted to tell me but haven't?"
      ],
      dares: [
        "Send a picture of your favorite place in your home",
        "Send a selfie making your best silly face",
        "Send a picture of something that reminds you of me",
        "Send a picture of what you're wearing right now",
        "Send a picture of your favorite possession"
      ],
      history: {
        questions: [],
        dares: []
      }
    };
  }

  function startTimer(lobbyName, callback) {
    const gameState = lobbies[lobbyName]?.gameState;
    clearTimeout(gameState?.timer);
    gameState.timer = setTimeout(callback, 60 * 60 * 1000);
  }

  function startQuestionRound(lobbyName) {
    const gameState = lobbies[lobbyName]?.gameState;
    if (!gameState || gameState.questions.length === 0) return;

    const q = gameState.questions[Math.floor(Math.random() * gameState.questions.length)];
    gameState.currentQuestion = q;
    gameState.currentDare = null;

    startTimer(lobbyName, () => {
      io.to(gameState.currentTurn).emit('timeout');
      nextTurn(lobbyName);
    });

    io.to(lobbyName).emit('newQuestion', {
      question: q,
      currentTurn: gameState.currentTurn
    });
  }

  function startDareRound(lobbyName) {
    const gameState = lobbies[lobbyName]?.gameState;
    if (!gameState || gameState.dares.length === 0) return;

    const d = gameState.dares[Math.floor(Math.random() * gameState.dares.length)];
    gameState.currentDare = d;
    gameState.currentQuestion = null;

    startTimer(lobbyName, () => {
      io.to(gameState.currentTurn).emit('timeout');
      nextTurn(lobbyName);
    });

    io.to(lobbyName).emit('newDare', {
      dare: d,
      currentTurn: gameState.currentTurn
    });
  }

  function nextTurn(lobbyName) {
    const gameState = lobbies[lobbyName]?.gameState;
    if (!gameState) return;
    clearTimeout(gameState.timer);

    const ids = Object.keys(gameState.players);
    if (ids.length < 2) return;

    const i = ids.indexOf(gameState.currentTurn);
    gameState.currentTurn = ids[(i + 1) % 2];
    gameState.currentQuestion = null;
    gameState.currentDare = null;

    io.to(lobbyName).emit('turnUpdate', gameState.currentTurn, gameState.players[gameState.currentTurn].name);

    if (Math.random() > 0.5) startQuestionRound(lobbyName);
    else startDareRound(lobbyName);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
