const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');



const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ✅ Serve all static files in the root folder (like index.html, style.css, etc.)
app.use(express.static(__dirname));
app.use(express.static('public'));
app.use(express.json());                         // ✅ Handles JSON data (e.g. API)
app.use(express.urlencoded({ extended: true })); 
const usersPath = path.join(__dirname, 'users.json');

const wouldYouRatherLobbies = {}; // { lobbyName: { ...lobbyData } }
// --- Two Truths, One Lie (TTWL) ---
const ttwlLobbies = {}; // { [lobbyName]: { name, isPublic, password, creator, players: [{id,name,disconnected}], gameState: {...} } }



// Then push to the user's extraImages array:



// ✅ Serve index.html at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});





const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage });


app.use(express.static('public'));
app.use(express.json());

app.post('/update-profile', upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'extraImages', maxCount: 10 }
]), (req, res) => {
  try {
  const {
  username,
  oldUsername,
  gender,
  dob,
  password,
  town,
  state,
  bio, // ✅ Add this line
  imagesToRemove
} = req.body;


    const newPic = req.files?.profilePic?.[0]?.filename;
    const extraImages = req.files?.extraImages?.map(f => f.filename) || [];
    const removedImages = imagesToRemove?.split(',').filter(Boolean) || [];

    console.log("🔧 Received:", { username, oldUsername, gender, dob, town, state, password });
    console.log("📷 Files:", req.files);
    console.log("🗑️ To Remove:", removedImages);

    if (!oldUsername || !username) return res.status(400).send('Missing username.');
    if (!fs.existsSync(usersPath)) return res.status(500).send("User data file not found.");

    let users = JSON.parse(fs.readFileSync(usersPath, 'utf-8') || '[]');
    const user = users.find(u => u.username === oldUsername);
    if (!user) return res.status(404).send("User not found.");

    // ✅ Update all fields
    user.username = username;
    user.gender = gender;
    user.dob = dob;
    user.town = town;
    user.state = state;
    user.bio = bio || ''; // ✅ Save the bio (or set empty if none)

    if (password?.trim()) user.password = password;
    if (newPic) user.profilePic = newPic;

    // 🧹 Remove deleted images
    user.extraImages = (user.extraImages || []).filter(img => !removedImages.includes(img));

    // ➕ Add new uploaded extra images
    user.extraImages.push(...extraImages);

    // 🔥 Delete removed image files from disk
    for (const filename of removedImages) {
      const fullPath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    // Save updates
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    res.status(200).send("Profile updated.");
  } catch (err) {
    console.error("❌ Update profile error:", err);
    res.status(500).send("Internal server error.");
  }
});


app.post('/delete-extra-image', (req, res) => {
  const { username, filename } = req.body;

  if (!username || !filename) {
    return res.status(400).send('Missing required fields.');
  }

  if (!fs.existsSync(usersPath)) {
    return res.status(500).send('User data file not found.');
  }

  let users = JSON.parse(fs.readFileSync(usersPath, 'utf-8') || '[]');
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).send('User not found.');

  // Remove image from user's extraImages array
  user.extraImages = (user.extraImages || []).filter(img => img !== filename);

  // Delete image file
  const imagePath = path.join(__dirname, 'uploads', filename);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  res.status(200).send('Image deleted.');
});



app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

const lobbies = {}; // { lobbyName: { password, players: [], gameState: {} } }


io.on('connection', (socket) => {
  console.log('🧩 NEW CONNECTION:', socket.id);

  socket.emit('lobbyCreatedDebug', { success: true });

  console.log("📥 Chat handler registered for:", socket.id);

  // 📢 Handle Would You Rather lobby creation

  // ------- TTWL Chat (backend) -------
socket.on('ttwlChatMessage', ({ lobbyName, playerName, message }) => {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;

  // Basic guard
  const text = (message || '').toString().trim();
  if (!text) return;

  const entry = {
    playerName: playerName || 'Player',
    message: text,
    timestamp: Date.now()
  };

  lobby.gameState.chat = lobby.gameState.chat || [];
  lobby.gameState.chat.push(entry);

  io.to(lobbyName).emit('ttwlChatMessage', entry);
});

socket.on('ttwlTyping', ({ lobbyName, isTyping }) => {
  const pn = socket.data?.playerName || 'Player';
  if (!lobbyName) return;
  // notify everyone else in the room
  socket.to(lobbyName).emit('ttwlTyping', { playerName: pn, isTyping: !!isTyping });
});


  // --- CHAT (shared for ToD + WYR) ---
function ttwlSanitize(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

socket.on('chat:send', ({ scope, lobbyName, text }) => {
  const clean = sanitizeText(text || '').trim();
  if (!clean) return;

  const from = socket.data.playerName || 'Unknown';

  if (scope === 'wyr') {
    const lobby = wouldYouRatherLobbies[lobbyName];
    if (!lobby) return;
    // ensure sender is in this room
    if (!lobby.players.some(p => p.id === socket.id)) return;

    // store (optional)
    const gs = lobby.gameState;
    gs.chat = gs.chat || [];
    gs.chat.push({ from, text: clean, ts: Date.now() });
    if (gs.chat.length > 500) gs.chat.shift(); // cap history

    io.to(lobbyName).emit('chat:msg', { from, text: clean, ts: Date.now(), scope: 'wyr' });
  } else {
    // default to ToD
    const lobby = lobbies[lobbyName];
    if (!lobby) return;
    if (!lobby.players.some(p => p.id === socket.id)) return;

    const gs = lobby.gameState;
    gs.chat = gs.chat || [];
    gs.chat.push({ from, text: clean, ts: Date.now() });
    if (gs.chat.length > 500) gs.chat.shift();

    io.to(lobbyName).emit('chat:msg', { from, text: clean, ts: Date.now(), scope: 'tod' });
  }
});

// typing indicator (optional)
socket.on('chat:typing', ({ scope, lobbyName, typing }) => {
  const from = socket.data.playerName || 'Unknown';
  // only to others in the same room
  socket.to(lobbyName).emit('chat:typing', { from, typing: !!typing, scope });
});


socket.on('createWyrLobby', ({ name, password, isPublic, username }) => {
  if (wouldYouRatherLobbies[name]) {
    return socket.emit('error', 'Lobby name already exists.');
  }

wouldYouRatherLobbies[name] = {
  name,
  password,
  isPublic,
  creator: username,
  players: [],
  gameState: {
    players: {},
    currentTurn: null,
    currentPrompt: null,
    timerInterval: null,
    timerPaused: false,
    timeLeft: 0,
    history: { wyr: [] },
    chat: []                     // ✅ add this
  }
};


  console.log("✅ Created WYR lobby:", name);
  updateWyrLobbyList(); // 🔥 this is crucial
});


// 🧠 Join WYR lobby
socket.on('joinWyrLobby', ({ lobbyName, password, playerName }) => {
  joinWyrLobby(socket, lobbyName, password, playerName);
});

// 🔁 Get all WYR lobbies
socket.on('getWyrLobbies', () => {
  updateWyrLobbyList();
});




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

socket.on('deleteWyrLobby', ({ name, password }) => {
  const lobby = wouldYouRatherLobbies[name];
  if (!lobby) {
    return socket.emit('deleteWyrLobbyError', 'Lobby not found.');
  }

  const requester = socket.data.playerName || 'Unknown';

  // Auth rules:
  // - Public: only the creator can delete
  // - Private: must provide correct password (anyone with it can delete)
  if (lobby.isPublic) {
    if (lobby.creator !== requester) {
      return socket.emit('deleteWyrLobbyError', 'Only the creator can delete this public lobby.');
    }
  } else {
    if (!password || password !== lobby.password) {
      return socket.emit('deleteWyrLobbyError', 'Incorrect password for this private lobby.');
    }
  }

  // Notify all clients in the lobby and boot them from the room
  io.to(name).emit('wyrLobbyDeleted', { name, by: requester });

  // Make sockets leave the room (prevents lingering emits)
  io.socketsLeave(name);

  // Remove the lobby and refresh list
  delete wouldYouRatherLobbies[name];
  updateWyrLobbyList();

  // Ack to the requester
  socket.emit('deleteWyrLobbySuccess', { name });
});

    


 // Example socket event for creating a lobby
socket.on('createLobby', ({ lobbyName, password, playerName, isPublic }) => {
  console.log('✅ Received createLobby:', { lobbyName, password, playerName, isPublic });
    console.log('👤 Creator Username (playerName):', playerName);


  // 🛑 Check if the lobby name is already taken
  if (lobbies[lobbyName]) {
    return socket.emit('error', 'Lobby name already taken.');
  }

  // 🧠 Private lobbies must have a password
  if (!isPublic && (!password || password.trim() === '')) {
    return socket.emit('error', 'Password is required for private lobbies.');
  }

if (!lobbies[lobbyName]) {
  lobbies[lobbyName] = {
    name: lobbyName,
    password,
    isPublic,
    creator: playerName,
    players: [socket.id],
    gameState: createNewGameState()
  };
} else {
  // ✅ Only push the new player if lobby exists
  lobbies[lobbyName].players.push(socket.id);
}


console.log("🧨 After assigning gameState:", JSON.stringify(lobbies[lobbyName], null, 2));



  console.log('🏗️ Lobby created:', lobbies[lobbyName]);

  // 👤 Add the creator to the lobby
  joinLobby(socket, lobbyName, isPublic ? '' : password, playerName);

  // 🔁 Update all clients with the new lobby list
  updateLobbyList();
});

socket.on('disconnect', () => {
  // ... your existing truth-or-dare cleanup

  const wyrLobbyName = socket.data?.wyrLobby;
  const playerName = socket.data?.playerName;

  if (wyrLobbyName) {
    const lobby = wouldYouRatherLobbies[wyrLobbyName];
    if (!lobby) return;

    const gameState = lobby.gameState;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;

    player.disconnected = true;

    if (socket.id === gameState.currentTurn) {
      gameState.timerPaused = true;
      io.to(wyrLobbyName).emit('turnPausedWyr', { message: `${playerName} disconnected. Turn paused.` });
    }

    io.to(wyrLobbyName).emit('updatePlayers', lobby.players);

    const live = lobby.players.filter(p => !p.disconnected);
    if (live.length === 0) {
      gameState.currentTurn = null;
      gameState.currentPrompt = null;
      clearInterval(gameState.timerInterval);
    }
  }
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
    isPublic: lobby.isPublic,
    creator: lobby.creator || "Unknown" // ✅ Include creator!
  }));
  socket.emit('lobbyList', lobbyList);
});

 

socket.on('joinLobby', ({ lobbyName, password, playerName }) => {
  joinLobby(socket, lobbyName, password, playerName);
});

// Emits the list to everyone
function updateWyrLobbyList() {
  const list = Object.values(wouldYouRatherLobbies).map(lobby => ({
    name: lobby.name,
    isPublic: lobby.isPublic,
    count: lobby.players.length,
    creator: lobby.creator || 'Unknown'
  }));
  io.emit('wyrLobbyList', list); // <-- must match the frontend listener
}

// When a lobby is created, call the updater
socket.on('createWyrLobby', ({ name, password, isPublic, username }) => {
  if (wouldYouRatherLobbies[name]) {
    return socket.emit('error', 'Lobby name already exists.');
  }

  wouldYouRatherLobbies[name] = {
    name,
    password,
    isPublic,
    creator: username,
    players: [],
    gameState: { players: {}, currentTurn: null }
  };

  console.log('✅ Created WYR lobby:', name);
  updateWyrLobbyList(); // broadcast updated list
});

// Reply to the initial request on page load
socket.on('requestWyrLobbies', () => {
  updateWyrLobbyList();
});



function joinWyrLobby(socket, lobbyName, password, playerName) {
  const lobby = wouldYouRatherLobbies[lobbyName];
  console.log("📥 Received joinWyrLobby:", lobbyName, playerName);

  if (!lobby) return socket.emit('error', 'Lobby not found.');

  // Password rules
  if (lobby.isPublic && password && password.trim() !== '') {
    return socket.emit('error', 'Public lobbies do not require passwords.');
  }
  if (!lobby.isPublic && lobby.password !== password) {
    return socket.emit('error', 'Incorrect password.');
  }

  const gameState = lobby.gameState;

  // Clean out stale players not present in gameState
  lobby.players = lobby.players.filter(p => gameState.players[p.id]);

  // 1) If same player name exists (rejoin), swap socket id and keep their slot/state
  let existing = lobby.players.find(p => p.name === playerName);
  if (existing) {
    const oldId = existing.id;

    existing.id = socket.id;
    existing.disconnected = false;

    if (gameState.players[oldId]) {
      gameState.players[socket.id] = { ...gameState.players[oldId], id: socket.id, name: playerName };
      delete gameState.players[oldId];
    } else {
      gameState.players[socket.id] = { id: socket.id, name: playerName };
    }

    if (gameState.currentTurn === oldId) {
      gameState.currentTurn = socket.id;
    }
  } else {
    // 2) If a disconnected slot exists, reuse it
    const slotToReplace = lobby.players.find(p => p.disconnected);
    if (slotToReplace) {
      const oldId = slotToReplace.id;
      slotToReplace.id = socket.id;
      slotToReplace.name = playerName;
      slotToReplace.disconnected = false;

      if (gameState.players[oldId]) {
        gameState.players[socket.id] = { ...gameState.players[oldId], id: socket.id, name: playerName };
        delete gameState.players[oldId];
      } else {
        gameState.players[socket.id] = { id: socket.id, name: playerName };
      }

      if (gameState.currentTurn === oldId) {
        gameState.currentTurn = socket.id;
      }
    } else {
      // 3) Brand new player — check capacity (2 max live players)
      const connectedPlayers = lobby.players.filter(p => !p.disconnected);
      if (connectedPlayers.length >= 2) {
        return socket.emit('error', 'Lobby full.');
      }

      lobby.players.push({ id: socket.id, name: playerName, disconnected: false });
      gameState.players[socket.id] = { id: socket.id, name: playerName };
    }
  }



  // Attach session and join room
  socket.join(lobbyName);
  socket.data.wyrLobby = lobbyName;
  socket.data.playerName = playerName;

  io.to(lobbyName).emit('updatePlayers', lobby.players);

  // Send safe game state to just-joined client
  const { timerInterval, ...rest } = gameState;
  const safeGameState = {
    ...rest,
    players: Object.fromEntries(
      Object.entries(gameState.players).map(([id, p]) => [id, { id: p.id, name: p.name }])
    )
  };
socket.emit('wyrLobbyJoined', {
  lobbyName,
  gameState: safeGameState,
  players: lobby.players,
  chat: (gameState.chat || []).slice(-100)   // ✅ send recent chat
});

  // If 2 live players and no current turn, start
  const livePlayers = lobby.players.filter(p => !p.disconnected);
  if (livePlayers.length === 2 && (!gameState.currentTurn || !gameState.players[gameState.currentTurn])) {
    gameState.currentTurn = livePlayers[0].id;
    io.to(lobbyName).emit('turnUpdateWyr', gameState.currentTurn, gameState.players[gameState.currentTurn].name);
    sendWyrPrompt(lobbyName); // <-- your function that sets gameState.currentPrompt and emits it
  }

  // If we were paused and now two players are live again, resume
  if (livePlayers.length === 2 && gameState.timerPaused) {
    gameState.timerPaused = false;
    io.to(lobbyName).emit('turnUpdateWyr', gameState.currentTurn, gameState.players[gameState.currentTurn]?.name);

    // Re-send the prompt to the rejoining player
    if (gameState.currentPrompt) {
      socket.emit('newWyrPrompt', {
        prompt: gameState.currentPrompt,
        currentTurn: gameState.currentTurn
      });
    }

  }}

  


function sendWyrPrompt(lobbyName) {
  const lobby = wouldYouRatherLobbies[lobbyName];
  if (!lobby) return;
  const gameState = lobby.gameState;

  const prompts = [
    "Would you rather be able to fly or be invisible?",
    "Would you rather have unlimited money or unlimited love?",
    "Would you rather fight 1 horse-sized duck or 100 duck-sized horses?",
    "Would you rather travel to the past or the future?",
    "Would you rather always know when someone is lying or always get away with lying?"
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  gameState.currentPrompt = prompt; // ✅ consistent key

  io.to(lobbyName).emit('newWyrPrompt', {
    prompt,
    currentTurn: gameState.currentTurn
  });

  // If you have a WYR timer, start it here
  if (typeof startWyrTimer === 'function') {
    startWyrTimer(lobbyName, () => {
      io.to(gameState.currentTurn).emit('timeout');
      // your turn-advance function:
      // wyrNextTurn(lobbyName);
      // or:
      const ids = lobby.players.filter(p => !p.disconnected).map(p => p.id);
      if (ids.length >= 2) {
        const i = ids.indexOf(gameState.currentTurn);
        gameState.currentTurn = ids[(i + 1) % ids.length];
        io.to(lobbyName).emit('turnUpdateWyr', gameState.currentTurn, gameState.players[gameState.currentTurn]?.name);
        sendWyrPrompt(lobbyName);
      }
    });
  }
}





function joinLobby(socket, lobbyName, password, playerName) {
  const lobby = lobbies[lobbyName];
if (typeof lobby.creator === 'undefined') {
  console.warn(`🛑 Lobby "${lobbyName}" is missing creator during join. Restoring it from socket data.`);
  lobby.creator = socket.data?.playerName || playerName || 'Unknown';
}


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
  const list = Object.values(lobbies).map(lobby => ({
    name: lobby.name,
    count: lobby.players.length,
    isPublic: lobby.isPublic,
    creator: lobby.creator || "Unknown" // 👈 make sure this is passed
  }));

    console.log("📤 Broadcasting lobby list:", list); // ✅ shows creators too
      console.log("📤 Sending lobby list to all clients:", list); // ✅ Confirm creator exists

Object.entries(lobbies).forEach(([name, lobby]) => {
  if (!lobby.creator) {
    console.warn(`⚠️ Lobby "${name}" is missing creator`);
  }
});


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

  function sanitizeText(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

// Send message to the current WYR lobby
socket.on('wyrChat:send', ({ text }) => {
  const lobbyName = socket.data.wyrLobby;
  if (!lobbyName) return;

  const lobby = wouldYouRatherLobbies[lobbyName];
  if (!lobby) return;

  const gs = lobby.gameState;
  gs.chat = gs.chat || [];

  const msg = {
    from: socket.data.playerName || 'Unknown',
    text: sanitizeText(text || '').trim(),
    ts: Date.now()
  };
  if (!msg.text) return;

  gs.chat.push(msg);
  if (gs.chat.length > 500) gs.chat.shift(); // cap history

  io.to(lobbyName).emit('wyrChat:msg', msg);
});

// Typing indicator (optional)
socket.on('wyrChat:typing', ({ typing }) => {
  const lobbyName = socket.data.wyrLobby;
  if (!lobbyName) return;
  socket.to(lobbyName).emit('wyrChat:typing', {
    from: socket.data.playerName || 'Unknown',
    typing: !!typing
  });
});


  socket.on('submitAnswer', ({ answer, imageUrl, dareImageUrl }) => {
  const lobbyName = socket.data.lobby;
  const playerName = socket.data.playerName;

  if (!lobbies[lobbyName]) return;

  const gameState = lobbies[lobbyName].gameState;
  const playerId = socket.id;

  const isDare = !answer || answer.trim() === '';

  if (!imageUrl) {
    socket.emit('error', 'Image is required.');
    return;
  }

  console.log(`✅ submitAnswer received (${isDare ? 'DARE' : 'QUESTION'}):`, {
    answer,
    imageUrl
  });

const entry = {
  type: isDare ? 'dare' : 'question',
  question: isDare ? null : gameState.currentQuestion,
  dare: isDare ? gameState.currentDare : null, // ✅ Set the dare field
  answer: isDare ? null : answer.trim(),
  imageUrl,
  dareImageUrl,
  player: playerName,
  timestamp: Date.now()
};


  // ✅ Store in correct section
  if (isDare) {
    gameState.history.dares.unshift(entry);
  } else {
    gameState.history.questions.unshift(entry);
  }

  gameState.currentQuestion = null;
  gameState.currentDare = null;
  clearInterval(gameState.timerInterval);

  io.to(lobbyName).emit('answerSubmitted', entry);
  io.to(lobbyName).emit('roundCompleted');

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


  socket.on('submitWyrChoice', ({ choice }) => {
  const lobbyName  = socket.data.wyrLobby;
  const playerName = socket.data.playerName;
  const lobby = wouldYouRatherLobbies[lobbyName];
  if (!lobby || !playerName) return;

  const gameState = lobby.gameState;

  // ✅ Make sure history bucket exists
  gameState.history = gameState.history || {};
  gameState.history.wyr = gameState.history.wyr || [];

  // ✅ Use a consistent prompt key
  const prompt = gameState.currentPrompt || null;

  const entry = {
    prompt,
    player: playerName,
    choice,                // "A" or "B"
    timestamp: Date.now()
  };

  gameState.history.wyr.unshift(entry);

  // Notify clients this round is done
  io.to(lobbyName).emit('wyrRoundCompleted', entry);

  // ✅ Clear prompt and timer for this round
  gameState.currentPrompt = null;
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }

  // ✅ Advance to the next connected player (not just % 2 on raw ids)
  const live = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  if (live.length < 2) {
    // Not enough players to continue
    gameState.currentTurn = live[0] || null;
    return;
  }

  const idx = live.indexOf(gameState.currentTurn);
  const nextId = live[(idx + 1) % live.length];
  gameState.currentTurn = nextId;

  const nextName =
    gameState.players[nextId]?.name ||
    lobby.players.find(p => p.id === nextId)?.name ||
    'Player';

  io.to(lobbyName).emit('turnUpdateWyr', nextId, nextName);

  // ✅ Kick off the next prompt + timer
  sendWyrPrompt(lobbyName);
});

// ====== TTWL: LOBBY LIST ======
socket.on('requestTtwlLobbies', () => {
  updateTtwlLobbyList();
});

// ====== TTWL: CREATE LOBBY ======
socket.on('createTtwlLobby', ({ name, password, isPublic, username }) => {
  if (ttwlLobbies[name]) {
    return socket.emit('error', 'Lobby name already exists.');
  }
  if (!isPublic && (!password || !password.trim())) {
    return socket.emit('error', 'Password required for private lobby.');
  }
// When creating a TTWL lobby (example)
ttwlLobbies[name] = {
  name,
  password,
  isPublic,
  creator: username,
  players: [],
  gameState: {
    players: {},
    currentTurn: null,
    // …
    chat: [] // 👈 add this
  }
};

  updateTtwlLobbyList();
});

// ====== TTWL: JOIN LOBBY ======
socket.on('joinTtwlLobby', ({ lobbyName, password, playerName }) => {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return socket.emit('error', 'Lobby not found.');

  if (lobby.isPublic && password && password.trim() !== '') {
    return socket.emit('error', 'Public lobbies do not require passwords.');
  }
  if (!lobby.isPublic && lobby.password !== password) {
    return socket.emit('error', 'Incorrect password.');
  }

  const gs = lobby.gameState;
  gs.history ||= [];
  gs.chat    ||= [];
  lobby.players ||= [];

  // Rejoin or occupy slot
  let existing = lobby.players.find(p => p.name === playerName);
  if (existing) {
    const oldId = existing.id;
    existing.id = socket.id;
    existing.disconnected = false;

    if (gs.players[oldId]) {
      gs.players[socket.id] = { ...gs.players[oldId], id: socket.id, name: playerName };
      delete gs.players[oldId];
    } else {
      gs.players[socket.id] = { id: socket.id, name: playerName };
    }
    if (gs.currentTurn === oldId) gs.currentTurn = socket.id;
  } else {
    const slot = lobby.players.find(p => p.disconnected);
    if (slot) {
      const oldId = slot.id;
      slot.id = socket.id;
      slot.name = playerName;
      slot.disconnected = false;

      if (gs.players[oldId]) {
        gs.players[socket.id] = { ...gs.players[oldId], id: socket.id, name: playerName };
        delete gs.players[oldId];
      } else {
        gs.players[socket.id] = { id: socket.id, name: playerName };
      }
      if (gs.currentTurn === oldId) gs.currentTurn = socket.id;
    } else {
      const live = lobby.players.filter(p => !p.disconnected);
      if (live.length >= 2) return socket.emit('error', 'Lobby full.');
      lobby.players.push({ id: socket.id, name: playerName, disconnected: false });
      gs.players[socket.id] = { id: socket.id, name: playerName };
    }
  }

  socket.join(lobbyName);
  socket.data.ttwlLobby = lobbyName;
  socket.data.ttwlPlayerName = playerName;

  io.to(lobbyName).emit('updatePlayers', lobby.players);

  // Safe state
  const { timerInterval, ...rest } = gs;
  const safeGS = {
    ...rest,
    players: Object.fromEntries(
      Object.entries(gs.players).map(([id, p]) => [id, { id: p.id, name: p.name }])
    )
  };

  // Send to **joining client** only
  
  socket.emit('ttwlLobbyJoined', {
    lobbyName,
    gameState: safeGS,
    players: lobby.players,
    history: gs.history,
    chat: gs.chat.slice(-100)
  });

  // Start game if 2 live players and no turn yet
  const liveIds = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  if (liveIds.length === 2 && (!gs.currentTurn || !gs.players[gs.currentTurn])) {
    gs.currentTurn = liveIds[0];
    const curName = gs.players[gs.currentTurn]?.name || 'Player';
    io.to(lobbyName).emit('ttwlTurnUpdate', gs.currentTurn, curName);
    gs.currentPhase = 'awaitingSet';
    io.to(lobbyName).emit('ttwlAwaitingSet', { currentTurn: gs.currentTurn, playerName: curName });
    // make sure this exists:
    startTtwlTimer(lobbyName, () => nextTtwlTurn(lobbyName));
  }

  // If a round was mid-flow, re-send context to the joining socket
  if (gs.currentPhase === 'awaitingSet') {
    const curName = gs.players[gs.currentTurn]?.name || 'Player';
    socket.emit('ttwlAwaitingSet', { currentTurn: gs.currentTurn, playerName: curName });
  } else if (gs.currentPhase === 'awaitingGuess' && gs.currentSet?.shuffled) {
    const guesserId = liveIds.find(id => id !== gs.currentSet.ownerId) || null;
    socket.emit('ttwlShowSet', {
      ownerName: gs.currentSet.ownerName,
      statements: gs.currentSet.shuffled,
      currentTurn: gs.currentTurn,
      guesserId
    });
  }
});

// ====== TTWL: SUBMIT SET (Two truths, one lie) ======
socket.on('ttwlSubmitSet', ({ statements, lieIndex }) => {
  const lobbyName = socket.data.ttwlLobby;
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;
  const gs = lobby.gameState;

  // basic validation
  if (!Array.isArray(statements) || statements.length !== 3) return;
  if (![0,1,2].includes(lieIndex)) return;
  if (gs.currentTurn !== socket.id) return; // not your turn

  // store set
  gs.currentSet = {
    ownerId: socket.id,
    ownerName: gs.players[socket.id]?.name || 'Player',
    statements: statements.map(s => String(s || '').trim()),
    lieIndex
  };

  // send to guesser
  const live = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  const guesserId = live.find(id => id !== socket.id) || null;

  const order = [0,1,2].sort(() => Math.random() - 0.5);
  const shuffled = order.map(i => gs.currentSet.statements[i]);
  gs.currentSet.shuffled = shuffled;
  gs.currentSet.map = order; // map[shuffledIndex] = originalIndex
  gs.currentPhase = 'awaitingGuess';

  io.to(lobbyName).emit('ttwlShowSet', {
    ownerName: gs.currentSet.ownerName,
    statements: shuffled,
    currentTurn: gs.currentTurn,
    guesserId
  });
});


// ====== TTWL: GUESS LIE ======
socket.on('ttwlGuess', ({ guessIndex }) => {
  const lobbyName = socket.data.ttwlLobby;
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;
  const gs = lobby.gameState;
  const set = gs.currentSet;
  if (!set || gs.currentPhase !== 'awaitingGuess') return;

  const live = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  const guesserId = live.find(id => id !== set.ownerId);
  if (socket.id !== guesserId) return;

  const originalIndex = set.map?.[guessIndex];
  const correct = originalIndex === set.lieIndex;

  const entry = {
    owner: set.ownerName,
    statements: set.statements,
    lieIndex: set.lieIndex,
    guesser: lobby.players.find(p => p.id === guesserId)?.name || 'Player',
    guessIndex: originalIndex,
    correct,
    ts: Date.now()
  };

  gs.history = gs.history || [];
  gs.history.unshift(entry);

  io.to(lobbyName).emit('ttwlRoundCompleted', entry);

  // advance turn (your function)
  nextTtwlTurn(lobbyName);
});

// --- TTWL Chat ---
function ttwlSanitize(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

socket.on('ttwlChat:send', ({ text, playerName }) => {
  const lobbyName = socket.data?.ttwlLobby;
  if (!lobbyName) return;

  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;

  const gs = lobby.gameState;
  gs.chat = gs.chat || [];

  const clean = ttwlSanitize(text || '').trim();
  if (!clean) return;

  const from = playerName || socket.data?.ttwlPlayerName || 'Player';
  const msg = { from, text: clean, ts: Date.now() };

  gs.chat.push(msg);
  if (gs.chat.length > 500) gs.chat.shift(); // cap history

  io.to(lobbyName).emit('ttwlChat:msg', msg);
});

socket.on('ttwlChat:typing', ({ typing }) => {
  const lobbyName = socket.data?.ttwlLobby;
  if (!lobbyName) return;
  const from = socket.data?.ttwlPlayerName || 'Player';
  socket.to(lobbyName).emit('ttwlChat:typing', { from, typing: !!typing });
});



// ====== TTWL: CHAT (optional; re-use channel name if you want a separate feed) ======
socket.on('ttwlChat', ({ lobbyName, playerName, message }) => {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;
  // You can also store lobby.gameState.chat if you want history
  io.to(lobbyName).emit('ttwlChat', {
    playerName,
    message: String(message || '').slice(0, 500),
    timestamp: Date.now()
  });
});

// ====== TTWL: DELETE LOBBY ======
socket.on('deleteTtwlLobby', ({ lobbyName, password }) => {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return socket.emit('deleteLobbyError', 'Lobby not found.');
  if (!lobby.isPublic && lobby.password !== password) {
    return socket.emit('deleteLobbyError', 'Incorrect password.');
  }
  io.to(lobbyName).emit('deleteLobbySuccess', { message: `${lobbyName} was deleted.` });
  delete ttwlLobbies[lobbyName];
  updateTtwlLobbyList();
});

// ====== TTWL: DISCONNECT HANDLING ======
socket.on('disconnect', () => {
  const lobbyName = socket.data?.ttwlLobby;
  const playerName = socket.data?.ttwlPlayerName;
  if (!lobbyName) return;

  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;

  const gs = lobby.gameState;
  const p = lobby.players.find(pl => pl.id === socket.id);
  if (!p) return;

  p.disconnected = true;

  if (socket.id === gs.currentTurn) {
    gs.timerPaused = true;
    io.to(lobbyName).emit('ttwlTurnPaused', { message: `${playerName} disconnected. Turn paused.` });
  }

  io.to(lobbyName).emit('updatePlayers', lobby.players);

  const live = lobby.players.filter(pl => !pl.disconnected);
  if (live.length === 0) {
    gs.currentTurn = null;
    gs.currentPhase = 'idle';
    gs.currentSet = null;
    clearInterval(gs.timerInterval);
    gs.timerInterval = null;
  }
});


});


  


function createTTWLGameState() {
  return {
    players: {},                 // socketId -> { id, name }
    currentTurn: null,           // socketId
    currentPhase: 'idle',        // 'awaitingSet' | 'awaitingGuess' | 'idle'
    currentSet: null,            // { ownerId, ownerName, statements:[s1,s2,s3], lieIndex, shuffled:[...], map:[origIndexAtShuffledPos] }
    timerInterval: null,
    timerPaused: false,
    timeLeft: 3600,              // seconds
    history: []                  // { owner, statements:[...], lieIndex, guesser, guessIndex, correct, ts }
  };
}

function updateTtwlLobbyList() {
  const list = Object.values(ttwlLobbies).map(lobby => ({
    name: lobby.name,
    isPublic: lobby.isPublic,
    count: lobby.players.filter(p => !p.disconnected).length,
    creator: lobby.creator || 'Unknown'
  }));
  io.emit('ttwlLobbyList', list);
}

function startTtwlTimer(lobbyName, onTimeout) {
  const gs = ttwlLobbies[lobbyName]?.gameState;
  if (!gs) return;
  clearInterval(gs.timerInterval);
  gs.timeLeft = 3600;
  gs.timerPaused = false;
  gs.timerInterval = setInterval(() => {
    if (gs.timerPaused) return;
    gs.timeLeft--;
    io.to(lobbyName).emit('ttwlUpdateTimer', gs.timeLeft);
    if (gs.timeLeft <= 0) {
      clearInterval(gs.timerInterval);
      gs.timerInterval = null;
      onTimeout?.();
    }
  }, 1000);
}

function nextTtwlTurn(lobbyName) {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;
  const gs = lobby.gameState;

  const live = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  if (live.length < 2) {
    gs.currentPhase = 'idle';
    return;
  }

  const idx = Math.max(0, live.indexOf(gs.currentTurn));
  const nextId = live[(idx + 1) % live.length];
  gs.currentTurn = nextId;
  gs.currentPhase = 'awaitingSet';
  gs.currentSet = null;

  const curName =
    gs.players[nextId]?.name ||
    lobby.players.find(p => p.id === nextId)?.name ||
    'Player';

  io.to(lobbyName).emit('ttwlTurnUpdate', nextId, curName);
  io.to(lobbyName).emit('ttwlAwaitingSet', { currentTurn: nextId, playerName: curName });
  startTtwlTimer(lobbyName, () => {
    // If the setter times out, just pass the turn
    nextTtwlTurn(lobbyName);
  });
}

function sendTtwlSetToGuesser(lobbyName) {
  const lobby = ttwlLobbies[lobbyName];
  if (!lobby) return;
  const gs = lobby.gameState;
  const set = gs.currentSet;
  if (!set) return;

  // Build shuffled view for the guesser
  const order = [0,1,2].sort(() => Math.random() - 0.5);
  const shuffled = order.map(i => set.statements[i]);
  const map = order; // map[shuffledIndex] = originalIndex

  gs.currentSet.shuffled = shuffled;
  gs.currentSet.map = map;

  gs.currentPhase = 'awaitingGuess';

  // Identify guesser: the other live player
  const live = lobby.players.filter(p => !p.disconnected).map(p => p.id);
  const guesserId = live.find(id => id !== set.ownerId);
  const turnName = gs.players[gs.currentTurn]?.name || 'Player';

  io.to(lobbyName).emit('ttwlShowSet', {
    ownerName: set.ownerName,
    statements: shuffled,
    currentTurn: gs.currentTurn,
    guesserId
  });

  startTtwlTimer(lobbyName, () => {
    // If the guesser times out, mark no-guess and move on
    const entry = {
      owner: set.ownerName,
      statements: set.statements,
      lieIndex: set.lieIndex,
      guesser: lobby.players.find(p => p.id === guesserId)?.name || 'Player',
      guessIndex: null,
      correct: false,
      ts: Date.now()
    };
    gs.history.unshift(entry);
    io.to(lobbyName).emit('ttwlRoundCompleted', entry);
    nextTtwlTurn(lobbyName);
  });
}



  

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


// ✅ CREATE ACCOUNT HANDLER
app.post('/create-account', upload.single('profilePic'), (req, res) => {
  const { oldUsername, username, gender, dob, password, town, state } = req.body;
  const profilePic = req.file?.filename;

  if (!username || !password || !gender || !dob || !town || !state || !profilePic) {
    return res.status(400).send("Missing required fields.");
  }

  const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  const existing = users.find(u => u.username === username);

  if (existing) {
    return res.send(`<h2>❌ Username already exists.</h2><a href="/create-account.html">Try Again</a>`);
  }

  users.push({ username, password, gender, dob, town, state, profilePic, extraImages: [] });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

  res.redirect(`/index.html?status=created&user=${encodeURIComponent(username)}`);
});


// ✅ SIGN IN HANDLER
app.post('/sign-in', (req, res) => {
  const { username, password } = req.body;

  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, '[]');
  }

  let users = [];
  try {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf-8') || '[]');
  } catch (err) {
    return res.status(500).send("Server error.");
  }

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    // Render the HTML manually with an error message injected
    const signinHTML = fs.readFileSync(path.join(__dirname, 'signin.html'), 'utf-8');
    const injected = signinHTML.replace(
      '<!-- ERROR_MESSAGE -->',
      `<div class="alert alert-danger text-center">❌ Invalid credentials</div>`
    );
    return res.send(injected);
  }

res.redirect(`/index.html?status=loggedin&user=${encodeURIComponent(username)}`);
});

app.post('/update-profile', upload.fields([
  { name: 'profilePic', maxCount: 1 },
  { name: 'extraImages', maxCount: 10 }
]), (req, res) => {
  const { oldUsername, username, gender, dob, password } = req.body;
  const newPic = req.files?.profilePic?.[0]?.filename;
  const extraImages = req.files?.extraImages?.map(f => f.filename) || [];

  if (!oldUsername || !username) return res.status(400).send('Missing username.');

  if (!fs.existsSync(usersPath)) return res.status(500).send("User data file not found.");

  let users;
  try {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf-8') || '[]');
  } catch {
    return res.status(500).send("Error reading user file.");
  }

  const user = users.find(u => u.username === oldUsername);
  if (!user) return res.status(404).send("User not found.");

  // Update all editable fields
  user.username = username;
  user.gender = gender;
  user.dob = dob;
  if (password?.trim()) user.password = password;
  if (newPic) user.profilePic = newPic;
  user.extraImages = [...(user.extraImages || []), ...extraImages];

  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  res.status(200).send("Profile updated.");
});




app.get('/profile-data', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ error: "Username is required." });

  if (!fs.existsSync(usersPath)) {
    return res.json({ error: "No users found." });
  }

  let users = [];
  try {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf-8') || '[]');
  } catch (err) {
    return res.json({ error: "Error loading user data." });
  }

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.json({ error: "User not found." });
  }

  // Return user data (omit password for security)
  const { password, ...safeUser } = user;
  res.json(safeUser);
});



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
