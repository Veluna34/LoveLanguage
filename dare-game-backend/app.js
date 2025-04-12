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
        "What's something you've always wanted to tell me but haven't?",
        "What is something you wish people asked you more?",
        "If you won the lottery, what’s the first thing you’d buy or pay for?",
        "What is your best skill or talent?",
        "What are your kinks?",
        "What are you most confident about?",
        "What is your worst skill?",
        "What are you least confident about?",
        "What is the sexiest or freakiest thing you would do to me?",
        "What are your biggest red flags in a partner?",
        "What is the craziest thing you have ever done?",
        "What is your biggest secret?",
        "What are your green flags in a partner?",
        "Have you been in other relationships? Why did they end?",
        "If you could be any animal, what animal and why?",
        "What do you dislike the most about me?",
        "What is the sexiest or freakiest thing you’ve ever done?",
        "What part of my body do you find most attractive?",
        "What would our future living together look like?",
        "What part of my body do you find least attractive?",
        "What is your type physically and personality-wise?",
        "Would we have dated in highschool together why or why not",
        "What is the number one item on your bucket list?",
        "If I was in bed with you right now, what would we be doing?",
        "What is something about you most people don’t know?",
        "What’s your love language?",
        "If you saw me randomly in public how would you have approached me",
        "What’s your biggest turn on?",
        "What’s something you've always wanted to try in a relationship?",
        "Describe your ideal date night with me.",
        "Have you ever had a crush on someone you shouldn't have?",
        "What is something about yourself that you're working on?",
        "What's your go-to flirting move?",
        "Give me your worst pickup line",
        "What’s something I do that drives you wild (in a good way)?",
        "If we had a weekend alone together, what would we do?",
        "What’s the most spontaneous thing you’ve ever done?",
        "What compliment do you never get tired of hearing?",
        "What’s a fantasy you’ve never told anyone before?",
        "What do you daydream about when you think of me?",
        "Give me your best pickup line",

      ],

      dares: [
        "Send a picture of where you are",
        "Send a selfie making your best silly face",
        "Send a picture of something that reminds you of me",
        "Send a picture of what you're wearing right now",
        "Send a picture of your favorite possession that you have with you",
        "Send a risky picture of yourself",
        "Send a picture of your cutest smile",
        "Send a picture of your body",
        "Send a pic of your underwear",
        "Send a picture of your favorite part of yourself",
        "Send a picture of what you're doing",
        "Send a mirror pic",
        "Send a picture of someone next to you",
        "Send a picture of your bra or chest",
        "Send a photo pretending to model something",
        "Send a picture of your lips in a kissy face",
        "Send a close-up of just your eyes",
        "Send a selfie hiding half your face",
        "Send a photo of your hand making a heart",
        "Send a photo with a flirty note written on your palm",
        "Take a blurry picture and make them guess what it is",
        "Send a picture of your feet (no socks)",
        "Send a photo of the softest thing nearby",
        "Snap a mysterious picture with the lights off",
        "Send a photo as if you're 'about to kiss the camera'",
        "Snap a picture with a dramatic pose",
        "Take a picture using a funny filter",
        "Send a picture of the first thing you saw this morning",
        "Take a pic of your neck/collarbone",
        "Send a picture with your fingers counting how much you like me (1–10)",
        "Send a picture of a secret place in your room",
        "Send a pic of something sexy written on your body",
        "Send a picture of your bed setup",
        "Send a 'meme selfie' ",
        "Snap a pic with just your shadow",
        "Send a picture of your reflection in something other than a mirror",
        "Send a photo with something covering part of your face",
        "Send a picture that would belong on your dating profile",
        "Take a 'teasing' over-the-shoulder pic",
        "Snap a mirror photo like you're sneaking it",
        "Send a pic of your favorite snack",
        "Snap a pic of the inside of your fridge",
        "Send a picture holding up your favorite drink",
        "Take a picture of the floor under your feet",
        "Send a picture of the weirdest object in arm’s reach",
        "Send a selfie with a random item on your head",
        "Send a picture while pretending to be asleep",
        "Take a picture from under a blanket",
        "Send a picture pretending to cry dramatically",
        "Send a black & white photo of yourself",
        "Send a photo that makes it look like you're hiding a secret"
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
  
    // ⏰ Emit this to trigger frontend timer and UI
    io.to(lobbyName).emit(
      'turnUpdate',
      gameState.currentTurn,
      gameState.players[gameState.currentTurn].name
    );
  
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
