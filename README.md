# LoveLanguage

**A real-time, two-player social game platform built with Node.js, Express, Socket.IO, and vanilla JavaScript.**

LoveLanguage is a multiplayer web application designed to help two people connect through conversation-based games. Users can create accounts, build profiles, create public or password-protected lobbies, chat in real time, and play one of three turn-based games:

* Truth or Dare
* Would You Rather
* Two Truths, One Lie

The project is currently a functional prototype intended for local development and testing. It demonstrates real-time multiplayer state management, lobby lifecycle handling, turn systems, timers, reconnection support, media uploads, and browser-based profile workflows.

## Project Highlights

* Built three real-time multiplayer games using Socket.IO
* Implemented public and private two-player lobbies
* Added lobby discovery, joining, deletion, and capacity validation
* Managed turn state, round state, timers, chat, and game history
* Added disconnect handling, reconnection support, and turn pausing
* Created account, sign-in, profile-viewing, and profile-editing workflows
* Implemented profile-image and gallery-image uploads with cropping
* Added photo capture and upload support for Truth or Dare responses
* Designed the application with Node.js, Express, HTML, CSS, and vanilla JavaScript
* Documented current security limitations and a path toward production readiness

## Why I Built It

I built LoveLanguage to explore how real-time web applications coordinate multiple users across shared interactive experiences.

Unlike a traditional single-page form or static website, a multiplayer game must keep two browsers synchronized while handling:

* Player identity
* Lobby membership
* Turn ownership
* Round progression
* Timers
* Chat messages
* Disconnects
* Reconnection
* Shared game history

The project gave me practical experience designing event-driven systems where the server acts as the source of truth for active multiplayer state.

## Core Features

### Accounts and Profiles

Users can:

* Create an account with a username and password
* Sign in with an existing account
* Add profile information such as gender, date of birth, town, state, and bio
* Upload a profile picture
* Upload, crop, and remove gallery images
* Edit saved profile information
* View their own profile or another player's profile
* Open player profiles directly from lobby lists
* Display age based on the saved date of birth

### Multiplayer Lobby System

Each game supports two-player rooms with:

* Public lobbies listed in a lobby browser
* Private lobbies protected by a password
* Lobby creator information
* Join and delete controls
* Player-count updates
* Two-player capacity checks
* Real-time lobby updates
* Disconnect detection
* Turn pausing when a player disconnects
* Reconnection handling

## Games

### Truth or Dare

Truth or Dare includes:

* Random truth questions and dares
* Custom player-submitted prompts
* Turn-based gameplay
* Lobby chat
* Turn timers
* Answer streak tracking
* Separate truth and dare history
* Camera capture and image upload
* Photo proof for answers and dares
* Reconnection support

### Would You Rather

Would You Rather includes:

* Turn-based two-player rounds
* Random prompts
* Option A and Option B selections
* Real-time chat
* Typing indicators
* Round history
* Turn synchronization
* Reconnection support

### Two Truths, One Lie

Two Truths, One Lie includes:

* Three-statement submission
* Lie selection by the submitting player
* Statement shuffling before display
* Opponent guessing
* Correct and incorrect result handling
* Match history
* Real-time chat
* Turn timers
* Reconnection handling

## Technology Stack

### Backend

* Node.js
* Express 5
* Socket.IO 4
* Multer
* Node.js `fs`, `path`, and `http` modules

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript
* Bootstrap 5 on selected pages
* Cropper.js
* Socket.IO client

### Current Data Storage

* `users.json` stores account and profile data
* `uploads/` stores profile and game images
* Active lobby and game state is stored in server memory

## Application Architecture

```text
Browser Clients
      |
      | HTTP
      v
Express Server
      |
      +--> Account and profile routes
      +--> Image-upload routes
      +--> Static frontend files
      |
      | Socket.IO
      v
Real-Time Game Systems
      |
      +--> Truth or Dare
      +--> Would You Rather
      +--> Two Truths, One Lie
      |
      +--> Lobby state
      +--> Player state
      +--> Turn state
      +--> Timers
      +--> Chat
      +--> History
      +--> Disconnect and reconnection logic
```

## Real-Time State Management

Each game currently maintains its own Socket.IO event handlers and in-memory lobby collection.

Depending on the game, the server manages:

* Lobby creation and discovery
* Password validation
* Two-player capacity
* Player identity
* Turn ownership
* Prompt and round state
* Timers
* Chat messages
* Round or match history
* Disconnect handling
* Reconnection
* Lobby deletion

Active game data exists only while the server is running. Restarting the server clears active lobbies, connected-player state, turns, prompts, timers, chats, and round history.

## Project Structure

```text
LoveLanguage/
├── app.js
├── package.json
├── users.json
├── index.html
├── signin.html
├── create-account.html
├── profile.html
├── truth_or_dare.html
├── would_you_rather.html
├── two_truths_one_lie.html
├── uploads/
└── server.log
```

### Important Files

| File                      | Purpose                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `app.js`                  | Express routes, uploads, account logic, lobby state, Socket.IO events, timers, and game logic |
| `index.html`              | Main game hub and lobby browser                                                               |
| `create-account.html`     | Account registration                                                                          |
| `signin.html`             | Sign-in interface                                                                             |
| `profile.html`            | Profile viewing, editing, image upload, and image cropping                                    |
| `truth_or_dare.html`      | Truth or Dare lobby and gameplay                                                              |
| `would_you_rather.html`   | Would You Rather lobby and gameplay                                                           |
| `two_truths_one_lie.html` | Two Truths, One Lie lobby and gameplay                                                        |
| `users.json`              | Local account and profile storage                                                             |
| `uploads/`                | Uploaded profile and game images                                                              |

## Installation

### Prerequisites

Install a recent Node.js LTS release and npm.

Verify the installation:

```bash
node --version
npm --version
```

### Clone the Project

```bash
git clone <your-repository-url>
cd <your-project-directory>
```

### Install Dependencies

```bash
npm install
```

Current backend dependencies include:

```json
{
  "express": "^5.1.0",
  "multer": "^1.4.5-lts.2",
  "socket.io": "^4.8.1"
}
```

### Create the User Data File

Create `users.json` in the project root with a valid empty JSON array:

```json
[]
```

### Start the Server

```bash
node app.js
```

The server runs on port `3000` unless the `PORT` environment variable is set.

Open:

```text
http://localhost:3000
```

## Basic Usage

1. Create an account.
2. Sign in.
3. Add optional profile information and images.
4. Select a game from the hub.
5. Create a public or private lobby.
6. Have a second signed-in player join.
7. Play using the turn controls and real-time chat.

Each lobby is designed for two active players.

## Selected HTTP Routes

| Method | Route                        | Purpose                                          |
| ------ | ---------------------------- | ------------------------------------------------ |
| `GET`  | `/`                          | Serves the main game hub                         |
| `POST` | `/create-account`            | Creates an account and uploads a profile picture |
| `POST` | `/sign-in`                   | Validates submitted credentials                  |
| `GET`  | `/profile-data?username=...` | Returns profile data without the password field  |
| `POST` | `/update-profile`            | Updates profile fields and images                |
| `POST` | `/delete-extra-image`        | Removes a gallery image                          |
| `POST` | `/upload`                    | Uploads an image used in a game response         |

## Engineering Challenges

### Synchronizing Shared Game State

Both players must see the same lobby, turn, timer, prompt, result, chat, and history state. Socket.IO events coordinate these updates between the server and each connected browser.

### Handling Disconnects and Reconnection

A reconnecting browser receives a new Socket.IO connection ID. The application therefore has to distinguish a returning player from a new player, restore the correct lobby relationship, and avoid incorrectly duplicating player state.

### Managing Multiple Game Flows

Each game has different rules and state transitions:

* Truth or Dare tracks prompt type, proof images, streaks, and separate histories
* Would You Rather tracks option selection and round outcomes
* Two Truths, One Lie tracks statement submission, shuffling, lie selection, and guessing

Supporting all three required separate event flows while preserving a consistent two-player lobby experience.

### Combining Persistent and Temporary Data

Profile information and uploaded files remain after a restart, while active multiplayer state is intentionally temporary. This required separating saved account data from short-lived game state.

## Current Limitations

LoveLanguage is a prototype and is **not ready for public deployment with real user data**.

Current limitations include:

* Passwords are stored as plain text in `users.json`
* Authentication is not backed by secure server-side sessions
* The browser stores the username in `localStorage`
* A user can modify local storage and impersonate another username
* Lobby passwords are stored in server memory as plain text
* Upload validation needs stronger size, extension, and MIME-type checks
* Some frontend content uses `innerHTML` and requires stricter escaping
* Active lobbies and game state are lost when the server restarts
* `app.js` currently contains several unrelated systems
* Some Socket.IO logic is duplicated across games
* Event names and player-data shapes are not fully standardized
* The project does not yet include automated tests

Only test data should be used in the current version.

## Production Readiness Roadmap

The next major engineering steps are:

1. Hash passwords with bcrypt
2. Add session-based authentication with secure cookies
3. Replace `users.json` with a database
4. Add server-side authorization for profile updates
5. Strengthen upload validation
6. Standardize player and lobby data structures
7. Remove duplicate Socket.IO handlers
8. Split the server into routes, services, middleware, and game modules
9. Add centralized error handling
10. Add automated tests for accounts, profiles, lobbies, and gameplay

A possible backend structure is:

```text
src/
├── server.js
├── routes/
│   ├── authRoutes.js
│   ├── profileRoutes.js
│   └── uploadRoutes.js
├── games/
│   ├── truthOrDare.js
│   ├── wouldYouRather.js
│   └── twoTruthsOneLie.js
├── services/
│   ├── userService.js
│   └── fileService.js
├── middleware/
│   ├── requireAuth.js
│   └── upload.js
└── utils/
    └── sanitize.js
```

## Skills Demonstrated

* Node.js and Express backend development
* Event-driven programming
* Real-time communication with Socket.IO
* Multiplayer lobby and turn-state management
* Disconnect and reconnection handling
* Client-server synchronization
* File uploads with Multer
* Browser image cropping and media workflows
* REST-style HTTP route design
* Vanilla JavaScript frontend development
* Temporary and persistent state management
* Technical documentation
* Security-risk identification
* Refactoring and production-readiness planning

## Current Status

LoveLanguage is a functional work-in-progress prototype for local development and testing.

Its current value is as a demonstration of real-time multiplayer engineering, state synchronization, lobby lifecycle management, user profiles, media uploads, and the design challenges involved in moving a prototype toward a production architecture.

## License

ISC

## Author

Aiden Figueroa
