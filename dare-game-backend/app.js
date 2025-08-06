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
  console.log('🧩 NEW CONNECTION:', socket.id);

  socket.emit('lobbyCreatedDebug', { success: true });

  console.log("📥 Chat handler registered for:", socket.id);


  socket.on('chatMessage', ({ lobbyName, playerName, message }) => {
    if (!lobbies[lobbyName]) {
      console.warn("⚠️ Invalid lobby:", lobbyName);
      return;
    }

    const entry = {
      playerName,
      message,
      timestamp: Date.now()
    };

    console.log("📡 Broadcasting to", lobbyName, entry); // ✅ This now works

    // Save to game state history
    lobbies[lobbyName].gameState.chat ||= [];
    lobbies[lobbyName].gameState.chat.push(entry);

    // Send to all sockets in the room
    io.to(lobbyName).emit('chatMessage', entry);
  });


    


 // Example socket event for creating a lobby
socket.on('createLobby', ({ lobbyName, password, playerName, isPublic }) => {
  console.log('✅ Received createLobby:', { lobbyName, password, playerName, isPublic });

  // 🛑 Check if the lobby name is already taken
  if (lobbies[lobbyName]) {
    return socket.emit('error', 'Lobby name already taken.');
  }

  // 🧠 Private lobbies must have a password
  if (!isPublic && (!password || password.trim() === '')) {
    return socket.emit('error', 'Password is required for private lobbies.');
  }

  // ✅ Create the lobby
  lobbies[lobbyName] = {
    name: lobbyName,
    password,
    isPublic,
    players: [],
    gameState: createNewGameState()
  };

  console.log('🏗️ Lobby created:', lobbies[lobbyName]);

  // 👤 Add the creator to the lobby
  joinLobby(socket, lobbyName, isPublic ? '' : password, playerName);

  // 🔁 Update all clients with the new lobby list
  updateLobbyList();
});



  socket.on('disconnect', () => {
  const lobbyName = socket.data.lobby;
  const playerName = socket.data.playerName;

  if (!lobbyName || !lobbies[lobbyName]) return;

  const lobby = lobbies[lobbyName];
  const player = lobby.players.find(p => p.id === socket.id);
  if (!player) return;

  player.disconnected = true;

  if (socket.id === lobby.gameState.currentTurn) {
    lobby.gameState.timerPaused = true;
    io.to(lobbyName).emit('turnPaused', {
      message: `${playerName} disconnected. Turn paused.`
    });
  }

  // 👥 Notify all
  io.to(lobbyName).emit('updatePlayers', lobby.players);

  // 🧼 If both disconnected, null out turn
  const live = lobby.players.filter(p => !p.disconnected);
  if (live.length === 0) {
    lobby.gameState.currentTurn = null;
    lobby.gameState.currentQuestion = null;
    lobby.gameState.currentDare = null;
    clearInterval(lobby.gameState.timerInterval);
  }

  console.log(`${playerName} disconnected from ${lobbyName}`);
});




socket.on('getLobbies', () => {
  const lobbyList = Object.entries(lobbies).map(([name, lobby]) => ({
    name,
    count: lobby.players.length,
    isPublic: lobby.isPublic // ✅ Make sure this is included
  }));
  socket.emit('lobbyList', lobbyList);
});

 

socket.on('joinLobby', ({ lobbyName, password, playerName }) => {
  joinLobby(socket, lobbyName, password, playerName);
});

function joinLobby(socket, lobbyName, password, playerName) {
  const lobby = lobbies[lobbyName];
  if (!lobby) {
    return socket.emit('error', 'Lobby not found.');
  }

  // ❗ Skip password check for public lobbies
if (lobby.isPublic && password && password.trim() !== '') {
  return socket.emit('error', 'Public lobbies do not require passwords.');
}

if (!lobby.isPublic && lobby.password !== password) {
  return socket.emit('error', 'Incorrect password.');
}


  const gameState = lobby.gameState;

  // 🧼 Clean players: remove stale ones without game state
  lobby.players = lobby.players.filter(p => gameState.players[p.id]);

  // ✅ Check if name already exists and is disconnected
  let existing = lobby.players.find(p => p.name === playerName);

  if (existing) {
    const oldId = existing.id;

    existing.id = socket.id;
    existing.disconnected = false;

    if (gameState.players[oldId]) {
      gameState.players[socket.id] = {
        ...gameState.players[oldId],
        id: socket.id,
        name: playerName
      };
      delete gameState.players[oldId];
    }

    if (gameState.currentTurn === oldId) {
      gameState.currentTurn = socket.id;
    }
  } else {
    // 🔁 If name is different but a player is disconnected, reassign that slot
    const slotToReplace = lobby.players.find(p => p.disconnected);
    if (slotToReplace) {
      const oldId = slotToReplace.id;
      slotToReplace.id = socket.id;
      slotToReplace.name = playerName;
      slotToReplace.disconnected = false;

      if (gameState.players[oldId]) {
        gameState.players[socket.id] = {
          ...gameState.players[oldId],
          id: socket.id,
          name: playerName
        };
        delete gameState.players[oldId];
      }

      if (gameState.currentTurn === oldId) {
        gameState.currentTurn = socket.id;
      }
    } else {
      // 🚫 Fully new player and lobby is full
      const connectedPlayers = lobby.players.filter(p => !p.disconnected);
      if (connectedPlayers.length >= 2) {
        return socket.emit('error', 'Lobby full.');
      }

      // ➕ Add new player
      lobby.players.push({ id: socket.id, name: playerName, disconnected: false });
      gameState.players[socket.id] = { id: socket.id, name: playerName };
    }
  }

  // 📎 Attach session
  socket.join(lobbyName);
  socket.data.lobby = lobbyName;
  socket.data.playerName = playerName;

  io.to(lobbyName).emit('updatePlayers', lobby.players);

  if (!gameState.history) {
  gameState.history = {
    questions: [],
    dares: []
  };
}


  const { timer, timerInterval, ...rest } = gameState;
  const safeGameState = {
    ...rest,
    players: Object.fromEntries(
      Object.entries(gameState.players).map(([id, p]) => [id, { id: p.id, name: p.name }])
    )
  };

  io.to(socket.id).emit('lobbyJoined', { lobbyName, gameState: safeGameState });
  io.to(socket.id).emit('gameState', safeGameState);

  // ✅ Always update rejoining player with current turn and active prompt
if (gameState.currentTurn && gameState.players[gameState.currentTurn]) {
  io.to(socket.id).emit('turnUpdate', gameState.currentTurn, gameState.players[gameState.currentTurn].name);
}

if (gameState.currentQuestion) {
  io.to(socket.id).emit('newQuestion', {
    question: gameState.currentQuestion,
    currentTurn: gameState.currentTurn
  });
} else if (gameState.currentDare) {
  io.to(socket.id).emit('newDare', {
    dare: gameState.currentDare,
    currentTurn: gameState.currentTurn
  });
}


  const livePlayers = lobby.players.filter(p => !p.disconnected);

  if (livePlayers.length === 2 && (!gameState.currentTurn || !gameState.players[gameState.currentTurn])) {
    gameState.currentTurn = livePlayers[0].id;
    io.to(lobbyName).emit('turnUpdate', gameState.currentTurn, gameState.players[gameState.currentTurn].name);
    startQuestionRound(lobbyName);
  }

  if (livePlayers.length === 2 && gameState.timerPaused) {
    gameState.timerPaused = false;
    io.to(lobbyName).emit('turnUpdate', gameState.currentTurn, gameState.players[gameState.currentTurn]?.name);

    if (gameState.currentQuestion) {
      io.to(lobbyName).emit('newQuestion', {
        question: gameState.currentQuestion,
        currentTurn: gameState.currentTurn
      });
    } else if (gameState.currentDare) {
      io.to(lobbyName).emit('newDare', {
        dare: gameState.currentDare,
        currentTurn: gameState.currentTurn
      });
    }

    startTimer(lobbyName, () => {
      io.to(gameState.currentTurn).emit('timeout');
      nextTurn(lobbyName);
    });
  }

  // 👤 Ensure non-turn rejoining player still sees current turn + prompt
if (
  livePlayers.length === 2 &&
  gameState.currentTurn &&
  gameState.players[gameState.currentTurn]
) {
  // Send current turn to the newly joined socket
  io.to(socket.id).emit(
    'turnUpdate',
    gameState.currentTurn,
    gameState.players[gameState.currentTurn].name
  );

  // Re-send the current prompt
  if (gameState.currentQuestion) {
    io.to(socket.id).emit('newQuestion', {
      question: gameState.currentQuestion,
      currentTurn: gameState.currentTurn
    });
  } else if (gameState.currentDare) {
    io.to(socket.id).emit('newDare', {
      dare: gameState.currentDare,
      currentTurn: gameState.currentTurn
    });
  }
}

  updateLobbyList();
}




function updateLobbyList() {
  const list = Object.entries(lobbies).map(([name, lobby]) => ({
    name,
    count: Object.keys(lobby.gameState.players).length,
    isPublic: lobby.isPublic || false // ✅ Send isPublic to frontend
  }));
  io.emit('lobbyList', list);
}




  function createNewGameState() {
  
  
    return {
      players: {},
      currentTurn: null,
      usedQuestions: {}, // playerID -> [question strings]
usedDares: {},     // playerID -> [dare strings]
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
        "What is one question you wish people would ask you more",
        "What is your favorite food?",
        "what is your least favorite food?",
        "One is something you wish people knew more about?",
        "What does your perfect date night look like?",
        "If you could go anywhere in the world where would it be?",
        "What is something very personal you never told me?",
        "Who is your favorite person in your life?",
        "If you could date anyone else other than me who would it be?",
        "Who is your celebrity crush or crushes?",
        "What is your favorite part about my personality?",
        "Wat are my green flags?",
        "What are my red flags?",
        "What does your dream wedding look like?",
        "Have you ever loved anyone else?, Why did it end?",
        "what about yourslef are you the most secure about",
        "What about yourself are you the most insecure about?",
        "What do you think your biggest red flag is?",
        "What do you think your biggest green flag is?",
        "How many kids do you want to have?",
        "What is your best pickup line?"

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
        "Send a picture of what your wearing on jut your legs",
        "Send a photo of the softest thing nearby",
        "Snap a mysterious picture with the lights off",
        "Send a photo as if you're 'about to kiss the camera'",
        "Snap a picture with a dramatic pose",
        "Take a picture with your funniest face",
        "Send a picture of the ceiling",
        "Take a pic of just your shirt",
        "Send a picture with your fingers counting how much you like me (1–10)",
        "Send a picture of a secret place you like to go to",
        "Send a pic of something sexy written on your body",
        "Send a picture of your bed",
        "Send a picture that could be a meme",
        "Snap a pic with just your shadow",
        "Send a picture of your reflection in something other than a mirror",
        "Send a photo with something covering part of your face",
        "Send a picture that would belong on your dating profile",
        "Take a 'teasing' over-the-shoulder pic",
        "Send a sexy picture in public",
        "Snap a pic of the inside of a fridge",
        "Send a picture holding up your favorite drink",
        "Take a picture of the floor",
        "Send a picture of the weirdest object in arm’s reach",
        "Send a selfie with a random item on your head",
        "Send a picture while pretending to be asleep",
        "Take a picture from under a blanket",
        "Send a picture pretending to cry dramatically",
        "Send a picture of a note written for me",
        "Send a photo of an item nobody knows you have",
        "Send a picture of the backseat of your car",
        "Send a picture of your car",
        "Send a picture of your favorite body part on yourself",
        "Send a picture of what you think my favorite body part on you is",
        "Draw me and send a picture of it",
        "Go up to stranger and ask for there number until you get one, send a picture of the number",
      ],


      history: {
        questions: [],
        dares: []
      }
    };
  }

  console.log('New connection:', socket.id);

  socket.on('submitAnswer', ({ answer, imageUrl, dareImageUrl }) => {
  const lobbyName = socket.data.lobby;
  const playerName = socket.data.playerName;

  if (!lobbies[lobbyName]) return;

  const gameState = lobbies[lobbyName].gameState;
  const playerId = socket.id;

    console.log('✅ submitAnswer received', answer);


  // Save to history
  const entry = {
    question: gameState.currentQuestion,
    answer,
    imageUrl,
    dareImageUrl,
    player: playerName,
    timestamp: Date.now()
  };

  gameState.history.questions.unshift(entry); // add to beginning
  io.to(lobbyName).emit('answerSubmitted', entry);

  // Clear current round
  gameState.currentQuestion = null;
  clearInterval(gameState.timerInterval);

  // Let frontend reset
  io.to(lobbyName).emit('roundCompleted');

  // Move to next player
  nextTurn(lobbyName);

});

  // ✅ Put this here
  socket.on('deleteLobby', ({ lobbyName, password }) => {
    const lobby = lobbies[lobbyName];
    if (!lobby) {
      socket.emit('deleteLobbyError', 'Lobby not found.');
      return;
    }

    if (lobby.password !== password) {
      socket.emit('deleteLobbyError', 'Incorrect password.');
      return;
    }

    // Notify players in the lobby (if any)
    io.to(lobbyName).emit('deleteLobbySuccess', { message: `${lobbyName} was deleted.` });

    // Clean up
    delete lobbies[lobbyName];
    updateLobbyList();

    
socket.onAny((event, data) => {
  console.log("📡 Received event:", event, data);
});

  });

});




  

function startTimer(lobbyName, onTimeout) {
  const gameState = lobbies[lobbyName]?.gameState;
  if (!gameState) return;

  // Start fresh
  clearInterval(gameState.timerInterval);
  gameState.timeLeft = 60 * 60; // 1 hour in seconds

  gameState.timerInterval = setInterval(() => {
    if (gameState.timerPaused) return; // Do nothing if paused

    gameState.timeLeft--;
    io.to(lobbyName).emit('updateTimer', gameState.timeLeft);

    if (gameState.timeLeft <= 0) {
      clearInterval(gameState.timerInterval);
      onTimeout();
    }
  }, 1000);
}



function startQuestionRound(lobbyName) {
  const gameState = lobbies[lobbyName]?.gameState;
  if (!gameState || gameState.questions.length === 0) return;

  const playerId = gameState.currentTurn;
  const used = gameState.usedQuestions[playerId] || [];

  const unused = gameState.questions.filter(q => !used.includes(q));
  if (unused.length === 0) return; // All used up

  const q = unused[Math.floor(Math.random() * unused.length)];
  gameState.currentQuestion = q;
  gameState.currentDare = null;

  if (!gameState.usedQuestions[playerId]) gameState.usedQuestions[playerId] = [];
  gameState.usedQuestions[playerId].push(q);

  io.to(lobbyName).emit(
    'turnUpdate',
    playerId,
    gameState.players[playerId].name
  );

  startTimer(lobbyName, () => {
    io.to(playerId).emit('timeout');
    nextTurn(lobbyName);
  });

  io.to(lobbyName).emit('newQuestion', {
    question: q,
    currentTurn: playerId
  });
}

  
function startDareRound(lobbyName) {
  const gameState = lobbies[lobbyName]?.gameState;
  if (!gameState || gameState.dares.length === 0) return;

  const playerId = gameState.currentTurn;
  const used = gameState.usedDares[playerId] || [];

  const unused = gameState.dares.filter(d => !used.includes(d));
  if (unused.length === 0) return; // All used up

  const d = unused[Math.floor(Math.random() * unused.length)];
  gameState.currentDare = d;
  gameState.currentQuestion = null;

  if (!gameState.usedDares[playerId]) gameState.usedDares[playerId] = [];
  gameState.usedDares[playerId].push(d);

  startTimer(lobbyName, () => {
    io.to(playerId).emit('timeout');
    nextTurn(lobbyName);
  });

  io.to(lobbyName).emit('newDare', {
    dare: d,
    currentTurn: playerId
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



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
