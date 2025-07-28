# Haxball Clone

A real-time multiplayer Haxball clone built with Node.js, Socket.IO, and HTML5 Canvas.

## Features

- **Real-time multiplayer gameplay** - Play with friends over LAN
- **Team-based gameplay** - Red vs Blue teams
- **Multiple maps** - Small Arena, Big Arena, and Rounded Big Arena
- **Intuitive controls** - WASD/Arrow keys for movement, Spacebar for kicking
- **Physics simulation** - Realistic ball and player physics
- **Goal detection** - Automatic scoring system
- **Live scoreboard** - Real-time score updates

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Game

1. Start the server:
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

2. Open your browser and go to `http://localhost:3000`

3. Share the URL with friends on your local network: `http://YOUR_LOCAL_IP:3000`

## How to Play

1. **Join a Room**: Enter your name, choose a team (Red or Blue), select a map, and join
2. **Controls**:
   - **Movement**: WASD or Arrow Keys
   - **Kick Ball**: Spacebar
3. **Objective**: Score goals by getting the ball into the opponent's goal
4. **Teams**: Red team defends the left goal, Blue team defends the right goal

## Game Features

### Maps
- **Small Arena**: Compact 800x400 field for fast-paced games
- **Big Arena**: Large 1200x600 field for more strategic gameplay  
- **Rounded Big Arena**: Large field with rounded corners for unique ball physics

### Multiplayer
- Real-time synchronization across all players
- Automatic player management (join/leave)
- Room-based gameplay - multiple games can run simultaneously
- Ping display for connection quality

### Physics
- Realistic ball physics with friction and collision detection
- Player collision with walls and boundaries
- Ball-player interaction for kicking and ball control
- Goal detection and automatic ball reset

## Technical Details

- **Backend**: Node.js with Express and Socket.IO
- **Frontend**: HTML5 Canvas with real-time rendering
- **Physics**: Custom physics engine with collision detection
- **Networking**: Real-time communication at 60 FPS
- **Architecture**: Client-server model with authoritative server

## Customization

You can easily customize the game by modifying:

- **Maps**: Edit the `maps` object in `server.js` to create new field layouts
- **Physics**: Adjust speed, friction, and ball properties in the Game class
- **Styling**: Modify `public/index.html` CSS for different visual themes
- **Controls**: Change key bindings in `public/game.js`

## Network Setup

To play over LAN:

1. Find your local IP address:
   - Windows: `ipconfig` in command prompt
   - Mac/Linux: `ifconfig` in terminal
   
2. Make sure port 3000 is accessible on your network

3. Share the URL `http://YOUR_LOCAL_IP:3000` with other players

## License

MIT License - feel free to modify and distribute!
