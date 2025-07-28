class HaxballClient {
    constructor() {
        this.socket = io();
        this.canvas = null;
        this.ctx = null;
        this.gameState = null;
        this.playerId = null;
        this.keys = {};
        this.lastInputSent = 0;
        this.ping = 0;
        this.lastPingTime = 0;
        this.showingPlayers = false;
        this.showingMapSelector = false;
        
        this.setupEventListeners();
        this.setupSocketEvents();
    }

    setupEventListeners() {
        // Form handling
        const playerNameInput = document.getElementById('playerName');
        const roomIdInput = document.getElementById('roomId');
        const joinBtn = document.getElementById('joinBtn');
        const teamBtns = document.querySelectorAll('.team-btn');
        const mapBtns = document.querySelectorAll('.map-btn');
        
        let selectedTeam = null;

        // Team selection
        teamBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                teamBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTeam = btn.dataset.team;
                this.updateJoinButton();
            });
        });

        // Map selection
        mapBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.socket.emit('changeMap', btn.dataset.map);
            });
        });

        // Input validation
        const updateJoinButton = () => {
            const nameValid = playerNameInput.value.trim().length > 0;
            const teamSelected = selectedTeam !== null;
            joinBtn.disabled = !(nameValid && teamSelected);
        };

        this.updateJoinButton = updateJoinButton;

        playerNameInput.addEventListener('input', updateJoinButton);

        // Join game
        joinBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim();
            const roomId = roomIdInput.value.trim() || 'main';
            const mapType = document.getElementById('mapSelect').value;
            
            if (playerName && selectedTeam) {
                this.joinGame(roomId, playerName, selectedTeam, mapType);
            }
        });

        // Enter key to join
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !joinBtn.disabled && document.getElementById('joinForm').style.display !== 'none') {
                joinBtn.click();
            }
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            if (this.gameState && this.canvas) {
                this.updateCanvasSize();
            }
        });

        // Game controls
        document.addEventListener('keydown', (e) => {
            if (this.gameState) {
                // Handle Tab key for showing players and map selector
                if (e.code === 'Tab') {
                    e.preventDefault();
                    this.togglePlayersList();
                    return;
                }
                
                e.preventDefault();
                this.handleKeyDown(e);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.gameState) {
                // Handle Tab key release
                if (e.code === 'Tab') {
                    e.preventDefault();
                    this.hidePlayersList();
                    return;
                }
                
                e.preventDefault();
                this.handleKeyUp(e);
            }
        });
    }

    setupSocketEvents() {
        this.socket.on('joined', (data) => {
            this.playerId = data.playerId;
            this.gameState = data.gameState;
            this.showGame();
            this.showStatus('Connected to game!', 'success');
        });

        this.socket.on('playerJoined', (data) => {
            this.gameState = data.gameState;
            this.updatePlayersList();
            this.showStatus(`${data.playerName} joined the ${data.team} team`, 'success');
        });

        this.socket.on('playerLeft', (data) => {
            this.gameState = data.gameState;
            this.updatePlayersList();
        });

        this.socket.on('gameUpdate', (gameState) => {
            this.gameState = gameState;
            this.render();
        });

        this.socket.on('goal', (data) => {
            this.gameState = data.gameState;
            this.updateScore(data.score);
            this.showGoalNotification(data.team);
        });

        this.socket.on('mapChanged', (data) => {
            this.gameState = data.gameState;
            this.updateCanvasSize();
            this.showStatus(`Map changed to ${data.mapType}`, 'success');
        });

        this.socket.on('connect', () => {
            this.showStatus('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            this.showStatus('Disconnected from server', 'error');
        });

        this.socket.on('connect_error', () => {
            this.showStatus('Failed to connect to server', 'error');
        });

        // Ping measurement
        setInterval(() => {
            this.lastPingTime = Date.now();
            this.socket.emit('ping');
        }, 1000);

        this.socket.on('pong', () => {
            this.ping = Date.now() - this.lastPingTime;
            document.getElementById('ping').textContent = `Ping: ${this.ping}ms`;
        });
    }

    joinGame(roomId, playerName, team, mapType) {
        this.socket.emit('joinRoom', { roomId, playerName, team, mapType });
    }

    showGame() {
        document.getElementById('joinForm').parentElement.style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
        
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.updateCanvasSize();
        this.updatePlayersList();
        this.startGameLoop();
    }

    updateCanvasSize() {
        if (this.gameState && this.canvas) {
            const mapWidth = this.gameState.map.width;
            const mapHeight = this.gameState.map.height;
            
            // Calculate maximum available space (accounting for UI elements) - made bigger
            const maxWidth = window.innerWidth - 50; // Reduced margin for bigger display
            const maxHeight = window.innerHeight - 200; // Reduced UI space for bigger display
            
            // Calculate scale to fit the map in the available space
            const scaleX = maxWidth / mapWidth;
            const scaleY = maxHeight / mapHeight;
            const scale = Math.min(scaleX, scaleY, 1.2); // Allow slight upscaling for bigger display
            
            // Set canvas size
            this.canvas.width = mapWidth;
            this.canvas.height = mapHeight;
            
            // Set display size with scaling
            this.canvas.style.width = (mapWidth * scale) + 'px';
            this.canvas.style.height = (mapHeight * scale) + 'px';
            
            // Store scale for rendering adjustments if needed
            this.canvasScale = scale;
        }
    }

    handleKeyDown(e) {
        const keyMap = {
            'KeyW': 'up',
            'KeyA': 'left', 
            'KeyS': 'down',
            'KeyD': 'right',
            'ArrowUp': 'up',
            'ArrowLeft': 'left',
            'ArrowDown': 'down',
            'ArrowRight': 'right',
            'Space': 'kick'
        };

        const action = keyMap[e.code];
        if (action) {
            this.keys[action] = true;
        }
    }

    handleKeyUp(e) {
        const keyMap = {
            'KeyW': 'up',
            'KeyA': 'left',
            'KeyS': 'down', 
            'KeyD': 'right',
            'ArrowUp': 'up',
            'ArrowLeft': 'left',
            'ArrowDown': 'down',
            'ArrowRight': 'right',
            'Space': 'kick'
        };

        const action = keyMap[e.code];
        if (action) {
            this.keys[action] = false;
        }
    }

    startGameLoop() {
        const gameLoop = () => {
            this.sendInput();
            this.render();
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }

    sendInput() {
        const now = Date.now();
        if (now - this.lastInputSent > 16) { // ~60fps
            const input = {
                up: this.keys.up || false,
                down: this.keys.down || false,
                left: this.keys.left || false,
                right: this.keys.right || false,
                kick: this.keys.kick || false
            };
            
            this.socket.emit('playerInput', input);
            this.lastInputSent = now;
        }
    }

    render() {
        if (!this.gameState || !this.ctx) return;

        const { ctx, canvas } = this;
        const { players, ball, map, kickoffTeam, ballTouched } = this.gameState;

        // Clear canvas
        ctx.fillStyle = '#2d5016';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw field markings
        this.drawField();

        // Draw walls
        ctx.fillStyle = '#8B4513';
        map.walls.forEach(wall => {
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        });

        // Draw goals
        ctx.fillStyle = '#FFD700';
        const goals = map.goals;
        ctx.fillRect(goals.left.x, goals.left.y, goals.left.width, goals.left.height);
        ctx.fillRect(goals.right.x, goals.right.y, goals.right.width, goals.right.height);

        // Draw kickoff indicator
        if (kickoffTeam && !ballTouched) {
            ctx.fillStyle = kickoffTeam === 'red' ? '#ff4757' : '#3742fa';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${kickoffTeam.toUpperCase()} TEAM KICKOFF`, canvas.width / 2, 30);
            
            // Additional instruction
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Stay on your side until ball is touched!', canvas.width / 2, 55);
        }

        // Draw players
        Object.values(players).forEach(player => {
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            ctx.fillStyle = player.team === 'red' ? '#ff4757' : '#3742fa';
            ctx.fill();
            ctx.strokeStyle = player.id === this.playerId ? '#FFD700' : '#000';
            ctx.lineWidth = player.id === this.playerId ? 3 : 1;
            ctx.stroke();

            // Draw player name
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.name, player.x, player.y - player.radius - 5);
        });

        // Draw ball
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw ball shadow
        ctx.beginPath();
        ctx.arc(ball.x + 2, ball.y + 2, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();
    }

    drawField() {
        const { ctx, canvas } = this;
        const { kickoffTeam, ballTouched } = this.gameState;
        
        // Center line - make it more prominent during kickoff
        ctx.strokeStyle = (kickoffTeam && !ballTouched) ? '#FFD700' : '#FFFFFF';
        ctx.lineWidth = (kickoffTeam && !ballTouched) ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();

        // Center circle
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Goal areas
        const goalAreaWidth = 80;
        const goalAreaHeight = 120;
        const goalAreaY = (canvas.height - goalAreaHeight) / 2;

        // Left goal area
        ctx.strokeRect(0, goalAreaY, goalAreaWidth, goalAreaHeight);
        
        // Right goal area  
        ctx.strokeRect(canvas.width - goalAreaWidth, goalAreaY, goalAreaWidth, goalAreaHeight);
    }

    updateScore(score) {
        document.getElementById('redScore').textContent = score.red;
        document.getElementById('blueScore').textContent = score.blue;
    }

    updatePlayersList() {
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        if (this.gameState) {
            Object.values(this.gameState.players).forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = `player ${player.team}`;
                playerDiv.textContent = player.name;
                if (player.id === this.playerId) {
                    playerDiv.textContent += ' (You)';
                }
                playersList.appendChild(playerDiv);
            });
        }
    }

    showStatus(message, type) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }

    togglePlayersList() {
        const playersList = document.querySelector('.players-list');
        const mapSelector = document.querySelector('.game-info .map-selector');
        
        if (!this.showingPlayers) {
            playersList.style.display = 'block';
            mapSelector.style.display = 'block';
            this.showingPlayers = true;
        }
    }

    hidePlayersList() {
        const playersList = document.querySelector('.players-list');
        const mapSelector = document.querySelector('.game-info .map-selector');
        
        playersList.style.display = 'none';
        mapSelector.style.display = 'none';
        this.showingPlayers = false;
    }

    showGoalNotification(team) {
        const notification = document.getElementById('goalNotification');
        notification.textContent = `${team.toUpperCase()} TEAM SCORED!`;
        notification.className = `goal-notification ${team}`;
        notification.style.display = 'block';
        
        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new HaxballClient();
});
