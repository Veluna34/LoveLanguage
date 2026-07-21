LoveLanguage

LoveLanguage is a two-player multiplayer game hub designed to help people connect through conversation-based games. Players can create accounts, build profiles, create public or private lobbies, chat in real time, and play one of three games:

Truth or Dare

Would You Rather

Two Truths, One Lie

The project uses Node.js, Express, Socket.IO, Multer, HTML, CSS, and browser-side JavaScript.

Development status: Prototype / work in progress. The application is suitable for local development and testing, but its current authentication and data storage systems are not secure enough for production use.

Features

Accounts and profiles

Create an account with a username and password

Add gender, date of birth, town, and state

Upload a profile picture

Sign in with an existing account

View your own profile or another player's profile

Edit profile information

Add a profile bio

Upload and crop profile and gallery images

Remove extra profile images

Open player profiles from lobby lists

Calculate and display age from the saved date of birth

Multiplayer lobbies

Two-player game rooms

Public lobbies that appear in the lobby browser

Private lobbies protected by a password

Lobby creator information

Join and delete lobby controls

Player count displays

Reconnection handling

Turn pausing when a player disconnects

Real-time updates through Socket.IO

Truth or Dare

Random truth questions and dares

Custom questions and dares

Turn-based gameplay

Lobby chat

Turn timer

Camera capture and image upload

Photo proof for answers and dares

Separate truth and dare history

Answer streak display

Would You Rather

Turn-based two-player rounds

Random Would You Rather prompts

Option A and Option B choices

Real-time chat and typing indicators

Round history

Turn updates and reconnection support

Two Truths, One Lie

One player enters three statements

The submitting player selects which statement is the lie

Statements are shuffled before being shown

The other player guesses the lie

Correct and incorrect results

Match history

Real-time chat

Turn timer and reconnection handling

Technology stack

Backend

Node.js

Express 5

Socket.IO 4

Multer

Node.js fs, path, and http modules

Frontend

HTML5

CSS3

Vanilla JavaScript

Bootstrap 5 on selected pages

Cropper.js for image cropping

Socket.IO client

Data storage

users.json stores account and profile information

uploads/ stores uploaded profile and game images

Active lobby and game state is stored in server memory

Project structure

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

Important files

File

Purpose

app.js

Express server, upload routes, account routes, profile routes, lobby state, Socket.IO events, timers, and game logic

index.html

Main LoveLanguage game hub

create-account.html

Account-registration form

signin.html

Sign-in form

profile.html

Profile viewing, editing, image uploading, and image cropping

truth_or_dare.html

Truth or Dare lobby and game interface

would_you_rather.html

Would You Rather lobby and game interface

two_truths_one_lie.html

Two Truths, One Lie lobby and game interface

users.json

Local JSON account storage

uploads/

Uploaded profile pictures and game images

server.log

Previous server output and error logs

Installation

Prerequisites

Install a recent Node.js LTS release and npm.

Verify the installation:

node --version
npm --version

1. Clone or download the project

git clone <your-repository-url>
cd dare-game-backend

Replace <your-repository-url> with the repository URL.

2. Install dependencies

npm install

The current dependencies are:

{
  "express": "^5.1.0",
  "multer": "^1.4.5-lts.2",
  "socket.io": "^4.8.1"
}

3. Create the user-data file

Make sure a users.json file exists in the project root.

[]

The account-creation route reads this file directly, so beginning with a valid empty JSON array avoids startup and registration errors.

4. Start the server

The current package.json does not include a start script, so run:

node app.js

The server uses port 3000 unless the PORT environment variable is set.

Open:

http://localhost:3000

Optional npm start script

Add this to the scripts section of package.json:

{
  "scripts": {
    "start": "node app.js"
  }
}

Then start the application with:

npm start

Basic usage

Open the game hub.

Create an account.

Sign in.

Open your profile and add optional profile details or images.

Select a game from the hub.

Create a public or private lobby.

Have a second signed-in player join the lobby.

Play the game using the displayed turn controls.

Use the in-game chat to communicate.

The application is designed around two active players per lobby.

Main HTTP routes

Method

Route

Purpose

GET

/

Serves the game hub

POST

/create-account

Creates a user account and uploads a profile picture

POST

/sign-in

Checks submitted credentials

GET

/profile-data?username=...

Returns profile data without the password field

POST

/update-profile

Updates profile fields and uploaded images

POST

/delete-extra-image

Removes an extra profile image

POST

/upload

Uploads an image used by a game response

Socket.IO systems

The backend contains separate in-memory lobby collections and event handlers for:

Truth or Dare

Would You Rather

Two Truths, One Lie

Each system manages some combination of:

Lobby creation

Lobby discovery

Joining

Password validation

Two-player capacity

Player identity

Turns

Timers

Chat

History

Disconnects

Reconnection

Lobby deletion

Data behavior

Persistent data

The following data remains after restarting the server:

Accounts stored in users.json

Profile information stored in users.json

Files stored in uploads/

Temporary data

The following data is stored only in memory and is lost when the server restarts:

Active lobbies

Connected players

Current turns

Active prompts

Chat history

Round history

Timers

Known limitations

The current project is functional as a prototype, but it has several important limitations.

Security

Passwords are stored as plain text in users.json.

Sign-in does not create a secure server-side session.

Browser localStorage is used to remember the username.

A user can edit localStorage manually and impersonate another username.

Lobby passwords are stored in server memory as plain text.

Uploaded files need stronger size, extension, and MIME-type validation.

Some frontend content is inserted with innerHTML, which requires careful escaping to prevent cross-site scripting.

Do not deploy this version publicly with real user information.

Backend organization

app.js contains account logic, upload logic, and three game servers in one large file.

Some middleware and Socket.IO handlers are duplicated.

Some events use inconsistent names between frontend and backend.

Multiple disconnect handlers are registered.

Some player collections use different data shapes.

There is no automated test suite.

Server-side errors can be difficult to trace because unrelated systems share the same file.

Frontend organization

Several pages contain duplicated JavaScript.

Some scripts appear outside the <body> or <html> structure.

Some pages rely on inline onclick handlers.

Styling is inconsistent between games.

A few elements and event listeners are duplicated.

Some page titles and labels still use older project names.

Recommended improvements

High priority

Hash passwords with bcrypt.

Add session-based authentication with secure cookies.

Move users from users.json to a database.

Validate that the authenticated user owns the profile being edited.

Add upload size and file-type restrictions.

Remove duplicate Socket.IO event handlers.

Standardize player objects across all games.

Split app.js into routes, services, game modules, and utilities.

Add centralized error handling.

Add tests for account, profile, lobby, and game behavior.

Suggested backend structure

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

Suggested production data model

A future database version could include:

users

profiles

profile_images

lobbies

lobby_players

game_rounds

chat_messages

Development notes

The uploads/ directory is created automatically by the Multer storage configuration when an upload occurs.

The server defaults to port 3000.

Public and private lobbies use separate validation rules.

Each game currently maintains its own Socket.IO event names and lobby state.

The frontend expects the signed-in username to be available in localStorage.

Profile links use a username query parameter and may include readonly=1.

Troubleshooting

callback is not a function

Older server logs show Socket.IO handlers attempting to call a callback that the client did not provide. Check every handler that accepts an acknowledgment callback:

socket.on('someEvent', (data, callback) => {
  if (typeof callback === 'function') {
    callback({ success: true });
  }
});

A player is already registered

Clear or update disconnected player state before treating a reconnection as a new player. A reconnecting player receives a new Socket.IO ID.

Lobby does not appear

Confirm that:

The frontend emits the correct lobby-list request event.

The backend listens for the same event name.

The backend broadcasts the event name expected by that game's page.

The lobby is public if it is supposed to appear in the public list.

Profile image does not load

Confirm that:

The file exists inside uploads/.

The saved filename matches the value in users.json.

Express is serving the directory containing uploads/.

The image URL begins with /uploads/.

Account creation fails

Confirm that:

users.json exists.

users.json contains valid JSON.

The file begins as [] when empty.

Every required form field is submitted.

A profile image is selected.

The account form begins with a valid <form> tag.

Privacy warning

The application accepts personal profile information, chat messages, and uploaded images. In its current form, it does not provide production-grade authentication, authorization, encryption, moderation, retention controls, or privacy protections.

Use test data only until those systems are implemented.

License

This project currently uses the ISC license, as declared in package.json.

Author

Aiden Figueroa
