const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
let rooms = {};
let players = {};

// Map configurations
const maps = {
  small: {
    name: "Small Arena",
    width: 800,
    height: 400,
    goals: {
      left: { x: 0, y: 150, width: 10, height: 100 },
      right: { x: 790, y: 150, width: 10, height: 100 }
    },
    walls: [
      { x: 0, y: 0, width: 800, height: 10 }, // top
      { x: 0, y: 390, width: 800, height: 10 }, // bottom
      { x: 0, y: 0, width: 10, height: 150 }, // left top
      { x: 0, y: 250, width: 10, height: 150 }, // left bottom
      { x: 790, y: 0, width: 10, height: 150 }, // right top
      { x: 790, y: 250, width: 10, height: 150 } // right bottom
    ]
  },
  big: {
    name: "Big Arena",
    width: 1200,
    height: 600,
    goals: {
      left: { x: 0, y: 225, width: 15, height: 150 },
      right: { x: 1185, y: 225, width: 15, height: 150 }
    },
    walls: [
      { x: 0, y: 0, width: 1200, height: 15 }, // top
      { x: 0, y: 585, width: 1200, height: 15 }, // bottom
      { x: 0, y: 0, width: 15, height: 225 }, // left top
      { x: 0, y: 375, width: 15, height: 225 }, // left bottom
      { x: 1185, y: 0, width: 15, height: 225 }, // right top
      { x: 1185, y: 375, width: 15, height: 225 } // right bottom
    ]
  },
  rounded: {
    name: "Rounded Big Arena",
    width: 1200,
    height: 600,
    goals: {
      left: { x: 0, y: 225, width: 15, height: 150 },
      right: { x: 1185, y: 225, width: 15, height: 150 }
    },
    walls: [
      { x: 50, y: 0, width: 1100, height: 15 }, // top
      { x: 50, y: 585, width: 1100, height: 15 }, // bottom
      { x: 0, y: 50, width: 15, height: 175 }, // left top
      { x: 0, y: 375, width: 15, height: 175 }, // left bottom
      { x: 1185, y: 50, width: 15, height: 175 }, // right top
      { x: 1185, y: 375, width: 15, height: 175 } // right bottom
    ],
    // Rounded corners - will be handled separately in collision detection
    corners: [
      { x: 50, y: 50, radius: 50, type: 'top-left' },
      { x: 50, y: 550, radius: 50, type: 'bottom-left' },
      { x: 1150, y: 50, radius: 50, type: 'top-right' },
      { x: 1150, y: 550, radius: 50, type: 'bottom-right' }
    ]
  }
};

class Game {
  constructor(roomId, mapType = 'small', hostId = null) {
    this.roomId = roomId;
    this.hostId = hostId; // The player who created the room
    this.players = {};
    this.bannedPlayers = new Set(); // Set of banned player IDs
    this.ball = {
      x: maps[mapType].width / 2,
      y: maps[mapType].height / 2,
      vx: 0,
      vy: 0,
      radius: 10
    };
    this.map = maps[mapType];
    this.score = { red: 0, blue: 0 };
    this.gameStarted = false;
    this.kickoffTeam = null; // Which team can touch the ball first after a goal
    this.ballTouched = false; // Has the ball been touched after kickoff
    
    // New game settings
    this.gameTime = 0; // Time in seconds
    this.maxTime = 300; // 5 minutes default (0 = no time limit)
    this.maxScore = 3; // First to 3 goals wins (0 = no score limit)
    this.gameEnded = false;
    this.kickEffects = []; // Array to store kick effect animations
  }

  addPlayer(playerId, playerName, team) {
    // Calculate spawn position based on existing players
    const teamPlayers = Object.values(this.players).filter(p => p.team === team);
    const playerCount = teamPlayers.length;
    
    let spawnX, spawnY;
    
    if (team === 'red') {
      // Red team on the left side
      spawnX = this.map.width * 0.25 - Math.floor(playerCount / 2) * 40;
      spawnY = (this.map.height / 3) * ((playerCount % 2) + 1);
    } else {
      // Blue team on the right side
      spawnX = this.map.width * 0.75 + Math.floor(playerCount / 2) * 40;
      spawnY = (this.map.height / 3) * ((playerCount % 2) + 1);
    }
    
    this.players[playerId] = {
      id: playerId,
      name: playerName,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      team: team,
      radius: 15,
      kickPower: 0
    };
  }

  removePlayer(playerId) {
    delete this.players[playerId];
  }

  updatePlayer(playerId, input) {
    const player = this.players[playerId];
    if (!player) return;

    const speed = 0.15; // Reduced from 1 to make players even slower
    const friction = 0.95; // decreased friction for better control

    // Apply input forces
    if (input.up) player.vy -= speed;
    if (input.down) player.vy += speed;
    if (input.left) player.vx -= speed;
    if (input.right) player.vx += speed;

    // Apply friction
    player.vx *= friction;
    player.vy *= friction;

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Kickoff field crossing restriction
    if (this.kickoffTeam && !this.ballTouched) {
      const centerLine = this.map.width / 2;
      if (player.team === 'red' && player.x > centerLine) {
        // Red team (left side) cannot cross to right side
        player.x = centerLine;
        player.vx = 0;
      } else if (player.team === 'blue' && player.x < centerLine) {
        // Blue team (right side) cannot cross to left side
        player.x = centerLine;
        player.vx = 0;
      }
    }

    // Boundary collision
    if (player.x - player.radius < 0) {
      player.x = player.radius;
      player.vx = 0;
    }
    if (player.x + player.radius > this.map.width) {
      player.x = this.map.width - player.radius;
      player.vx = 0;
    }
    if (player.y - player.radius < 0) {
      player.y = player.radius;
      player.vy = 0;
    }
    if (player.y + player.radius > this.map.height) {
      player.y = this.map.height - player.radius;
      player.vy = 0;
    }

    // Wall collision
    this.checkWallCollision(player);

    // Ball collision - prevent passing through and allow pushing
    this.checkPlayerBallCollision(player);

    // Player-to-player collision
    this.checkPlayerPlayerCollision(player);

    // Kick ball
    if (input.kick) {
      this.kickBall(player);
    }
  }

  checkWallCollision(player) {
    // Check regular walls
    this.map.walls.forEach(wall => {
      if (player.x + player.radius > wall.x && 
          player.x - player.radius < wall.x + wall.width &&
          player.y + player.radius > wall.y && 
          player.y - player.radius < wall.y + wall.height) {
        
        // Improved collision response to prevent getting stuck
        const centerX = wall.x + wall.width / 2;
        const centerY = wall.y + wall.height / 2;
        const dx = player.x - centerX;
        const dy = player.y - centerY;
        
        // Calculate overlap on both axes
        const overlapX = (player.radius + wall.width / 2) - Math.abs(dx);
        const overlapY = (player.radius + wall.height / 2) - Math.abs(dy);
        
        // Resolve collision on the axis with smaller overlap
        if (overlapX < overlapY) {
          // Horizontal collision
          if (dx > 0) {
            player.x = wall.x + wall.width + player.radius + 1; // Add small buffer
          } else {
            player.x = wall.x - player.radius - 1;
          }
          player.vx = 0;
        } else {
          // Vertical collision
          if (dy > 0) {
            player.y = wall.y + wall.height + player.radius + 1; // Add small buffer
          } else {
            player.y = wall.y - player.radius - 1;
          }
          player.vy = 0;
        }
      }
    });

    // Check rounded corners for rounded map
    if (this.map.corners) {
      this.map.corners.forEach(corner => {
        const dx = player.x - corner.x;
        const dy = player.y - corner.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if player is inside the corner radius
        if (distance < corner.radius + player.radius && distance > corner.radius - player.radius) {
          // Player is colliding with the rounded corner
          if (distance > 0) {
            const dirX = dx / distance;
            const dirY = dy / distance;
            
            // Push player away from corner center
            const targetDistance = corner.radius + player.radius + 1;
            player.x = corner.x + dirX * targetDistance;
            player.y = corner.y + dirY * targetDistance;
            
            // Stop velocity in the direction of the corner
            const velDotDir = player.vx * dirX + player.vy * dirY;
            if (velDotDir < 0) {
              player.vx -= velDotDir * dirX;
              player.vy -= velDotDir * dirY;
            }
          }
        }
      });
    }
  }

  checkPlayerBallCollision(player) {
    // Check if this player's team is allowed to touch the ball
    if (this.kickoffTeam && !this.ballTouched && player.team !== this.kickoffTeam) {
      return; // This team cannot touch the ball yet
    }
    
    const dx = this.ball.x - player.x; // Direction from player to ball
    const dy = this.ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = player.radius + this.ball.radius;
    
    if (distance < minDistance && distance > 0) {
      // Mark that the ball has been touched
      if (this.kickoffTeam && !this.ballTouched) {
        this.ballTouched = true;
        this.kickoffTeam = null; // Reset kickoff restriction
      }
      
      // Calculate overlap
      const overlap = minDistance - distance;
      
      // Normalize direction vector
      const dirX = dx / distance;
      const dirY = dy / distance;
      
      // Separate player and ball
      const separation = overlap / 2;
      player.x -= dirX * separation;
      player.y -= dirY * separation;
      this.ball.x += dirX * separation;
      this.ball.y += dirY * separation;
      
      // Transfer momentum from player to ball (in the direction player is moving)
      const pushForce = 0.3; // Reduced from 0.5 for more controlled ball movement
      this.ball.vx += player.vx * pushForce;
      this.ball.vy += player.vy * pushForce;
      
      // Reduce player velocity on collision
      player.vx *= 0.7;
      player.vy *= 0.7;
    }
  }

  checkPlayerPlayerCollision(currentPlayer) {
    Object.values(this.players).forEach(otherPlayer => {
      if (otherPlayer.id === currentPlayer.id) return;
      
      const dx = currentPlayer.x - otherPlayer.x;
      const dy = currentPlayer.y - otherPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = currentPlayer.radius + otherPlayer.radius;
      
      if (distance < minDistance && distance > 0) {
        // Calculate overlap
        const overlap = minDistance - distance;
        
        // Normalize direction vector
        const dirX = dx / distance;
        const dirY = dy / distance;
        
        // Separate players more gently
        const separation = overlap / 2;
        currentPlayer.x += dirX * separation;
        currentPlayer.y += dirY * separation;
        otherPlayer.x -= dirX * separation;
        otherPlayer.y -= dirY * separation;
        
        // Much gentler velocity reduction on collision
        currentPlayer.vx *= 0.95; // Reduced from 0.8 to 0.95
        currentPlayer.vy *= 0.95;
        otherPlayer.vx *= 0.95;
        otherPlayer.vy *= 0.95;
      }
    });
  }

  kickBall(player) {
    // Check if this player's team is allowed to touch the ball
    if (this.kickoffTeam && !this.ballTouched && player.team !== this.kickoffTeam) {
      return; // This team cannot kick the ball yet
    }
    
    const dx = this.ball.x - player.x;
    const dy = this.ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < player.radius + this.ball.radius + 20) {
      // Mark that the ball has been touched
      if (this.kickoffTeam && !this.ballTouched) {
        this.ballTouched = true;
        this.kickoffTeam = null; // Reset kickoff restriction
      }
      
      const kickPower = 1; // Reduced from 5 to make ball shooting more controlled
      const angle = Math.atan2(dy, dx);
      this.ball.vx += Math.cos(angle) * kickPower;
      this.ball.vy += Math.sin(angle) * kickPower;
      
      // Add kick effect
      this.kickEffects.push({
        x: this.ball.x,
        y: this.ball.y,
        radius: 0,
        maxRadius: 25,
        opacity: 1,
        createdAt: Date.now()
      });
    }
  }

  updateBall() {
    const friction = 0.98;
    const gravity = 0;
    
    // Apply friction and gravity
    this.ball.vx *= friction;
    this.ball.vy *= friction;
    this.ball.vy += gravity;
    
    // Update position
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;
    
    // Ball-to-player collision detection
    this.checkBallPlayerCollisions();
    
    // Boundary collision
    if (this.ball.x - this.ball.radius < 0) {
      this.ball.x = this.ball.radius;
      this.ball.vx = -this.ball.vx * 0.8;
    }
    if (this.ball.x + this.ball.radius > this.map.width) {
      this.ball.x = this.map.width - this.ball.radius;
      this.ball.vx = -this.ball.vx * 0.8;
    }
    if (this.ball.y - this.ball.radius < 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = -this.ball.vy * 0.8;
    }
    if (this.ball.y + this.ball.radius > this.map.height) {
      this.ball.y = this.map.height - this.ball.radius;
      this.ball.vy = -this.ball.vy * 0.8;
    }

    // Wall collision
    this.checkBallWallCollision();
    
    // Update kick effects
    this.updateKickEffects();
    
    // Goal detection - return the scoring team
    return this.checkGoals();
  }

  checkBallPlayerCollisions() {
    Object.values(this.players).forEach(player => {
      // Prevent rival team from touching ball during kickoff
      if (this.kickoffTeam && !this.ballTouched && player.team !== this.kickoffTeam) {
        return;
      }
      const dx = this.ball.x - player.x;
      const dy = this.ball.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = this.ball.radius + player.radius;
      
      if (distance < minDistance && distance > 0) {
        // Mark that the ball has been touched
        if (this.kickoffTeam && !this.ballTouched && player.team === this.kickoffTeam) {
          this.ballTouched = true;
          this.kickoffTeam = null;
        }
        // Calculate overlap
        const overlap = minDistance - distance;
        // Normalize direction vector
        const dirX = dx / distance;
        const dirY = dy / distance;
        // Separate ball and player
        const separation = overlap / 2;
        this.ball.x += dirX * separation;
        this.ball.y += dirY * separation;
        player.x -= dirX * separation;
        player.y -= dirY * separation;
        // Ball bounces off player with some energy loss
        const bounceForce = 0.7;
        const relativeVelX = this.ball.vx - player.vx;
        const relativeVelY = this.ball.vy - player.vy;
        const relativeVelNormal = relativeVelX * dirX + relativeVelY * dirY;
        if (relativeVelNormal > 0) return;
        const impulse = -relativeVelNormal * bounceForce;
        this.ball.vx += impulse * dirX;
        this.ball.vy += impulse * dirY;
        const playerImpulse = impulse * 0.2;
        player.vx -= playerImpulse * dirX;
        player.vy -= playerImpulse * dirY;
      }
    });
  }

  checkBallWallCollision() {
    // Check regular walls
    this.map.walls.forEach(wall => {
      if (this.ball.x + this.ball.radius > wall.x && 
          this.ball.x - this.ball.radius < wall.x + wall.width &&
          this.ball.y + this.ball.radius > wall.y && 
          this.ball.y - this.ball.radius < wall.y + wall.height) {
        
        const centerX = wall.x + wall.width / 2;
        const centerY = wall.y + wall.height / 2;
        const dx = this.ball.x - centerX;
        const dy = this.ball.y - centerY;
        
        // Calculate overlap on both axes
        const overlapX = (this.ball.radius + wall.width / 2) - Math.abs(dx);
        const overlapY = (this.ball.radius + wall.height / 2) - Math.abs(dy);
        
        // Resolve collision on the axis with smaller overlap
        if (overlapX < overlapY) {
          // Horizontal collision
          if (dx > 0) {
            this.ball.x = wall.x + wall.width + this.ball.radius + 1;
          } else {
            this.ball.x = wall.x - this.ball.radius - 1;
          }
          this.ball.vx = -this.ball.vx * 0.8;
        } else {
          // Vertical collision
          if (dy > 0) {
            this.ball.y = wall.y + wall.height + this.ball.radius + 1;
          } else {
            this.ball.y = wall.y - this.ball.radius - 1;
          }
          this.ball.vy = -this.ball.vy * 0.8;
        }
      }
    });

    // Check rounded corners for rounded map
    if (this.map.corners) {
      this.map.corners.forEach(corner => {
        const dx = this.ball.x - corner.x;
        const dy = this.ball.y - corner.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if ball is inside the corner radius
        if (distance < corner.radius + this.ball.radius && distance > corner.radius - this.ball.radius) {
          // Ball is colliding with the rounded corner
          if (distance > 0) {
            const dirX = dx / distance;
            const dirY = dy / distance;
            
            // Push ball away from corner center
            const targetDistance = corner.radius + this.ball.radius + 1;
            this.ball.x = corner.x + dirX * targetDistance;
            this.ball.y = corner.y + dirY * targetDistance;
            
            // Reflect velocity off the curved surface
            const velDotDir = this.ball.vx * dirX + this.ball.vy * dirY;
            this.ball.vx -= 2 * velDotDir * dirX * 0.8;
            this.ball.vy -= 2 * velDotDir * dirY * 0.8;
          }
        }
      });
    }
  }

  updateKickEffects() {
    const now = Date.now();
    this.kickEffects = this.kickEffects.filter(effect => {
      const age = now - effect.createdAt;
      const maxAge = 300; // 300ms duration
      
      if (age >= maxAge) {
        return false; // Remove old effects
      }
      
      // Update effect properties
      const progress = age / maxAge;
      effect.radius = effect.maxRadius * progress;
      effect.opacity = 1 - progress;
      
      return true;
    });
  }

  checkGoals() {
    const goal = this.map.goals;
    
    // Left goal (blue team scores when ball goes in left goal, red defends left)
    if (this.ball.x - this.ball.radius <= goal.left.x + goal.left.width && 
        this.ball.y >= goal.left.y && 
        this.ball.y <= goal.left.y + goal.left.height) {
      this.score.blue++;
      this.kickoffTeam = 'red'; // Red team gets kickoff after being scored on
      this.ballTouched = false;
      this.resetBall();
      this.positionPlayersForKickoff();
      
      // Check if game is over
      if (this.maxScore > 0 && this.score.blue >= this.maxScore) {
        this.gameEnded = true;
      }
      
      return 'blue';
    }
    
    // Right goal (red team scores when ball goes in right goal, blue defends right)
    if (this.ball.x + this.ball.radius >= goal.right.x && 
        this.ball.y >= goal.right.y && 
        this.ball.y <= goal.right.y + goal.right.height) {
      this.score.red++;
      this.kickoffTeam = 'blue'; // Blue team gets kickoff after being scored on
      this.ballTouched = false;
      this.resetBall();
      this.positionPlayersForKickoff();
      
      // Check if game is over
      if (this.maxScore > 0 && this.score.red >= this.maxScore) {
        this.gameEnded = true;
      }
      
      return 'red';
    }
    
    return null;
  }

  resetBall() {
    this.ball.x = this.map.width / 2;
    this.ball.y = this.map.height / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  positionPlayersForKickoff() {
    const redPlayers = Object.values(this.players).filter(p => p.team === 'red');
    const bluePlayers = Object.values(this.players).filter(p => p.team === 'blue');
    
    // Position red team players on the left side
    redPlayers.forEach((player, index) => {
      const rows = Math.ceil(redPlayers.length / 2);
      const playersInRow = Math.ceil(redPlayers.length / rows);
      const row = Math.floor(index / playersInRow);
      const col = index % playersInRow;
      
      player.x = this.map.width * 0.25 - (row * 40); // Start at 25% width (left side)
      player.y = (this.map.height / (playersInRow + 1)) * (col + 1);
      player.vx = 0;
      player.vy = 0;
    });
    
    // Position blue team players on the right side
    bluePlayers.forEach((player, index) => {
      const rows = Math.ceil(bluePlayers.length / 2);
      const playersInRow = Math.ceil(bluePlayers.length / rows);
      const row = Math.floor(index / playersInRow);
      const col = index % playersInRow;
      
      player.x = this.map.width * 0.75 + (row * 40); // Start at 75% width (right side)
      player.y = (this.map.height / (playersInRow + 1)) * (col + 1);
      player.vx = 0;
      player.vy = 0;
    });
  }

  getGameState() {
    return {
      players: this.players,
      ball: this.ball,
      score: this.score,
      map: this.map,
      kickoffTeam: this.kickoffTeam,
      ballTouched: this.ballTouched,
      hostId: this.hostId,
      gameTime: this.gameTime,
      maxTime: this.maxTime,
      maxScore: this.maxScore,
      gameEnded: this.gameEnded,
      kickEffects: this.kickEffects
    };
  }

  isHost(playerId) {
    return this.hostId === playerId;
  }

  isBanned(playerId) {
    return this.bannedPlayers.has(playerId);
  }

  kickPlayer(playerId) {
    if (this.players[playerId]) {
      delete this.players[playerId];
      return true;
    }
    return false;
  }

  banPlayer(playerId) {
    this.bannedPlayers.add(playerId);
    this.kickPlayer(playerId);
  }

  updateGameTime() {
    if (!this.gameEnded && this.gameStarted) {
      this.gameTime++;
      
      // Check if time limit reached
      if (this.maxTime > 0 && this.gameTime >= this.maxTime) {
        this.gameEnded = true;
        return true; // Game ended due to time
      }
    }
    return false;
  }

  updateGameSettings(settings) {
    if (settings.maxTime !== undefined) {
      this.maxTime = Math.max(0, Math.min(3600, settings.maxTime)); // 0-60 minutes max
    }
    if (settings.maxScore !== undefined) {
      this.maxScore = Math.max(0, Math.min(50, settings.maxScore)); // 0-50 goals max
    }
  }

  restartGame() {
    this.gameTime = 0;
    this.score = { red: 0, blue: 0 };
    this.gameEnded = false;
    this.kickoffTeam = null;
    this.ballTouched = false;
    this.kickEffects = [];
    this.resetBall();
    this.positionPlayersForKickoff();
  }
}

// Socket handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', (data) => {
    const { roomId, playerName, team, mapType } = data;
    
    // Create new room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = new Game(roomId, mapType || 'small', socket.id); // Set creator as host
    }
    
    const room = rooms[roomId];
    
    // Check if player is banned
    if (room.isBanned(socket.id)) {
      socket.emit('banned', 'You have been banned from this room');
      return;
    }
    
    // If no host exists (shouldn't happen but safety check), make this player host
    if (!room.hostId) {
      room.hostId = socket.id;
    }
    
    room.addPlayer(socket.id, playerName, team);
    players[socket.id] = { roomId, playerName, team };
    
    socket.join(roomId);
    socket.emit('joined', { 
      playerId: socket.id, 
      gameState: room.getGameState(),
      availableMaps: Object.keys(maps).map(key => ({ id: key, name: maps[key].name })),
      isHost: room.isHost(socket.id)
    });
    
    io.to(roomId).emit('playerJoined', { 
      playerId: socket.id, 
      playerName,
      team,
      gameState: room.getGameState() 
    });
  });

  socket.on('playerInput', (input) => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      rooms[player.roomId].updatePlayer(socket.id, input);
    }
  });

  socket.on('changeMap', (mapType) => {
    const player = players[socket.id];
    if (player && rooms[player.roomId] && maps[mapType]) {
      const room = rooms[player.roomId];
      
      // Only host can change maps
      if (!room.isHost(socket.id)) {
        socket.emit('error', 'Only the host can change maps');
        return;
      }
      
      const hostId = room.hostId; // Preserve host ID
      rooms[player.roomId] = new Game(player.roomId, mapType, hostId);
      
      // Re-add all players
      Object.keys(players).forEach(playerId => {
        if (players[playerId].roomId === player.roomId) {
          rooms[player.roomId].addPlayer(playerId, players[playerId].playerName, players[playerId].team);
        }
      });
      
      io.to(player.roomId).emit('mapChanged', {
        mapType,
        gameState: rooms[player.roomId].getGameState()
      });
    }
  });

  socket.on('kickPlayer', (targetPlayerId) => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      const room = rooms[player.roomId];
      
      // Only host can kick players
      if (!room.isHost(socket.id)) {
        socket.emit('error', 'Only the host can kick players');
        return;
      }

      // Cannot kick the host
      if (targetPlayerId === room.hostId) {
        socket.emit('error', 'Cannot kick the host');
        return;
      }

      if (room.kickPlayer(targetPlayerId)) {
        io.to(targetPlayerId).emit('kicked', 'You have been kicked from the room');
        io.to(player.roomId).emit('playerLeft', { 
          playerId: targetPlayerId,
          gameState: room.getGameState()
        });
        
        // Remove from players tracking
        if (players[targetPlayerId]) {
          delete players[targetPlayerId];
        }
      }
    }
  });

  socket.on('banPlayer', (targetPlayerId) => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      const room = rooms[player.roomId];
      
      // Only host can ban players
      if (!room.isHost(socket.id)) {
        socket.emit('error', 'Only the host can ban players');
        return;
      }

      // Cannot ban the host
      if (targetPlayerId === room.hostId) {
        socket.emit('error', 'Cannot ban the host');
        return;
      }

      if (room.players[targetPlayerId]) {
        room.banPlayer(targetPlayerId);
        io.to(targetPlayerId).emit('banned', 'You have been banned from the room');
        io.to(player.roomId).emit('playerLeft', { 
          playerId: targetPlayerId,
          gameState: room.getGameState()
        });
        
        // Remove from players tracking
        if (players[targetPlayerId]) {
          delete players[targetPlayerId];
        }
      }
    }
  });

  socket.on('updateGameSettings', (settings) => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      const room = rooms[player.roomId];
      
      // Only host can update game settings
      if (!room.isHost(socket.id)) {
        socket.emit('error', 'Only the host can update game settings');
        return;
      }

      room.updateGameSettings(settings);
      io.to(player.roomId).emit('gameSettingsUpdated', {
        maxTime: room.maxTime,
        maxScore: room.maxScore,
        gameState: room.getGameState()
      });
    }
  });

  socket.on('restartGame', () => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      const room = rooms[player.roomId];
      
      // Only host can restart game
      if (!room.isHost(socket.id)) {
        socket.emit('error', 'Only the host can restart the game');
        return;
      }

      room.restartGame();
      io.to(player.roomId).emit('gameRestarted', room.getGameState());
    }
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player && rooms[player.roomId]) {
      const room = rooms[player.roomId];
      
      // If the host disconnected, assign a new host
      if (room.isHost(socket.id)) {
        const remainingPlayers = Object.keys(room.players).filter(id => id !== socket.id);
        if (remainingPlayers.length > 0) {
          room.hostId = remainingPlayers[0];
          io.to(room.hostId).emit('hostTransferred', 'You are now the host');
          io.to(player.roomId).emit('newHost', { 
            hostId: room.hostId,
            gameState: room.getGameState()
          });
        } else {
          room.hostId = null;
        }
      }
      
      room.removePlayer(socket.id);
      io.to(player.roomId).emit('playerLeft', { 
        playerId: socket.id,
        gameState: room.getGameState()
      });
      
      // Clean up empty rooms
      if (Object.keys(room.players).length === 0) {
        delete rooms[player.roomId];
      }
    }
    delete players[socket.id];
    console.log('User disconnected:', socket.id);
  });
});

// Game loop
setInterval(() => {
  Object.values(rooms).forEach(room => {
    const goal = room.updateBall(); // updateBall now returns the scoring team
    
    if (goal) {
      io.to(room.roomId).emit('goal', { 
        team: goal, 
        score: room.score,
        gameState: room.getGameState()
      });
    }
    
    io.to(room.roomId).emit('gameUpdate', room.getGameState());
  });
}, 1000 / 60); // 60 FPS

// Game timer loop (1 second intervals)
setInterval(() => {
  Object.values(rooms).forEach(room => {
    if (Object.keys(room.players).length > 0) {
      room.gameStarted = true; // Start timer when players are present
      const timeEnded = room.updateGameTime();
      
      if (timeEnded) {
        io.to(room.roomId).emit('gameEnded', {
          reason: 'time',
          gameState: room.getGameState()
        });
      }
    }
  });
}, 1000); // 1 second

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Haxball clone server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to play!`);
});
