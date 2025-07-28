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

        // Game settings event handlers
        document.getElementById('hostSettingsBtn').addEventListener('click', () => {
            if (this.isHost) {
                document.getElementById('gameSettings').style.display = 'block';
                // Pre-fill current values
                if (this.gameState) {
                    document.getElementById('timeLimit').value = Math.floor(this.gameState.maxTime / 60);
                    document.getElementById('scoreLimitInput').value = this.gameState.maxScore;
                }
            }
        });

        document.getElementById('applySettings').addEventListener('click', () => {
            const timeLimit = parseInt(document.getElementById('timeLimit').value) * 60;
            const scoreLimit = parseInt(document.getElementById('scoreLimitInput').value);
            this.updateGameSettings(timeLimit, scoreLimit);
            document.getElementById('gameSettings').style.display = 'none';
        });

        document.getElementById('restartGameBtn').addEventListener('click', () => {
            if (confirm('Are you sure you want to restart the game?')) {
                this.restartGame();
                document.getElementById('gameSettings').style.display = 'none';
            }
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            document.getElementById('gameSettings').style.display = 'none';
        });
    }

    setupSocketEvents() {
        this.socket.on('joined', (data) => {
            this.playerId = data.playerId;
            this.gameState = data.gameState;
            this.isHost = data.isHost;
            this.showGame();
            this.updateHostUI();
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
            this.updateGameInfo();
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

        this.socket.on('hostTransferred', (message) => {
            this.isHost = true;
            this.updateHostUI();
            this.showStatus(message, 'success');
        });

        this.socket.on('newHost', (data) => {
            this.gameState = data.gameState;
            this.isHost = (this.playerId === data.hostId);
            this.updateHostUI();
        });

        this.socket.on('gameSettingsUpdated', (data) => {
            this.gameState = data.gameState;
            this.showStatus('Game settings updated', 'success');
        });

        this.socket.on('gameRestarted', (gameState) => {
            this.gameState = gameState;
            this.showStatus('Game restarted', 'success');
        });

        this.socket.on('gameEnded', (data) => {
            this.gameState = data.gameState;
            let message = 'Game ended! ';
            if (data.reason === 'time') {
                message += 'Time limit reached.';
            } else if (data.reason === 'score') {
                message += 'Score limit reached.';
            }
            this.showStatus(message, 'success');
        });

        this.socket.on('kicked', (message) => {
            this.showStatus(message, 'error');
            this.disconnect();
        });

        this.socket.on('banned', (message) => {
            this.showStatus(message, 'error');
            this.disconnect();
        });

        this.socket.on('error', (message) => {
            this.showStatus(message, 'error');
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
            const mapWidth = this.gameState.map.extendedWidth || this.gameState.map.width;
            const mapHeight = this.gameState.map.extendedHeight || this.gameState.map.height;
            
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
        const { players, ball, map, kickoffTeam, ballTouched, kickEffects } = this.gameState;

        // Clear canvas with extended area background (darker green)
        ctx.fillStyle = '#1e3a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw field area (brighter green)
        if (map.fieldBoundaries) {
            ctx.fillStyle = '#2d5016';
            ctx.fillRect(
                map.fieldBoundaries.left, 
                map.fieldBoundaries.top, 
                map.fieldBoundaries.right - map.fieldBoundaries.left, 
                map.fieldBoundaries.bottom - map.fieldBoundaries.top
            );
        }

        // Draw field markings
        this.drawField();

        // Draw field walls (inner walls)
        ctx.fillStyle = '#8B4513';
        map.walls.forEach(wall => {
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        });

        // Draw outer walls (extended area boundaries)
        if (map.outerWalls) {
            ctx.fillStyle = '#654321'; // Darker brown for outer walls
            map.outerWalls.forEach(wall => {
                ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            });
        }

        // Draw rounded corners if available (field corners)
        if (map.corners) {
            ctx.fillStyle = '#8B4513';
            map.corners.forEach(corner => {
                ctx.beginPath();
                ctx.arc(corner.x, corner.y, corner.radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Draw outer rounded corners if available (extended area corners)
        if (map.outerCorners) {
            ctx.fillStyle = '#654321';
            map.outerCorners.forEach(corner => {
                ctx.beginPath();
                ctx.arc(corner.x, corner.y, corner.radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Draw goals
        ctx.fillStyle = '#FFD700';
        const goals = map.goals;
        ctx.fillRect(goals.left.x, goals.left.y, goals.left.width, goals.left.height);
        ctx.fillRect(goals.right.x, goals.right.y, goals.right.width, goals.right.height);

        // Draw field boundary lines (to show the playable area for the ball)
        if (map.fieldBoundaries) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]); // Dashed line
            ctx.strokeRect(
                map.fieldBoundaries.left, 
                map.fieldBoundaries.top, 
                map.fieldBoundaries.right - map.fieldBoundaries.left, 
                map.fieldBoundaries.bottom - map.fieldBoundaries.top
            );
            ctx.setLineDash([]); // Reset to solid line
        }

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

        // Draw kick effects
        if (kickEffects && kickEffects.length > 0) {
            kickEffects.forEach(effect => {
                ctx.beginPath();
                ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${effect.opacity})`;
                ctx.lineWidth = 3;
                ctx.stroke();
            });
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
        const { kickoffTeam, ballTouched, map } = this.gameState;
        
        // Use field boundaries if available, otherwise use original dimensions
        const fieldLeft = map.fieldBoundaries ? map.fieldBoundaries.left : 0;
        const fieldRight = map.fieldBoundaries ? map.fieldBoundaries.right : canvas.width;
        const fieldTop = map.fieldBoundaries ? map.fieldBoundaries.top : 0;
        const fieldBottom = map.fieldBoundaries ? map.fieldBoundaries.bottom : canvas.height;
        const fieldWidth = fieldRight - fieldLeft;
        const fieldHeight = fieldBottom - fieldTop;
        const centerX = fieldLeft + fieldWidth / 2;
        const centerY = fieldTop + fieldHeight / 2;
        
        // Center line - make it more prominent during kickoff
        ctx.strokeStyle = (kickoffTeam && !ballTouched) ? '#FFD700' : '#FFFFFF';
        ctx.lineWidth = (kickoffTeam && !ballTouched) ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(centerX, fieldTop);
        ctx.lineTo(centerX, fieldBottom);
        ctx.stroke();

        // Center circle
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
        ctx.stroke();

        // Goal areas
        const goalAreaWidth = 80;
        const goalAreaHeight = 120;
        const goalAreaY = centerY - goalAreaHeight / 2;

        // Left goal area
        ctx.strokeRect(fieldLeft, goalAreaY, goalAreaWidth, goalAreaHeight);
        
        // Right goal area  
        ctx.strokeRect(fieldRight - goalAreaWidth, goalAreaY, goalAreaWidth, goalAreaHeight);
    }

    updateScore(score) {
        document.getElementById('redScore').textContent = score.red;
        document.getElementById('blueScore').textContent = score.blue;
    }

    updateGameInfo() {
        if (this.gameState) {
            // Update time display
            const timeDisplay = document.getElementById('gameTime');
            if (timeDisplay) {
                const minutes = Math.floor(this.gameState.gameTime / 60);
                const seconds = this.gameState.gameTime % 60;
                timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                // Show time limit if set
                if (this.gameState.maxTime > 0) {
                    const maxMinutes = Math.floor(this.gameState.maxTime / 60);
                    const maxSeconds = this.gameState.maxTime % 60;
                    timeDisplay.textContent += ` / ${maxMinutes}:${maxSeconds.toString().padStart(2, '0')}`;
                }
            }
            
            // Update score limit display
            const scoreDisplay = document.getElementById('scoreLimit');
            if (scoreDisplay && this.gameState.maxScore > 0) {
                scoreDisplay.textContent = `First to ${this.gameState.maxScore}`;
                scoreDisplay.style.display = 'block';
            } else if (scoreDisplay) {
                scoreDisplay.style.display = 'none';
            }
        }
    }

    updatePlayersList() {
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        
        if (this.gameState) {
            Object.entries(this.gameState.players).forEach(([playerId, player]) => {
                const playerDiv = document.createElement('div');
                playerDiv.className = `player-item ${player.team}`;
                
                const playerInfo = document.createElement('span');
                playerInfo.textContent = player.name;
                if (playerId === this.playerId) {
                    playerInfo.textContent += ' (You)';
                }
                if (playerId === this.gameState.hostId) {
                    playerInfo.textContent += ' 👑';
                }
                
                playerDiv.appendChild(playerInfo);
                
                // Add kick/ban buttons for host
                if (this.isHost && playerId !== this.playerId && playerId !== this.gameState.hostId) {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'player-actions';
                    
                    const kickBtn = document.createElement('button');
                    kickBtn.className = 'player-action-btn kick-btn';
                    kickBtn.textContent = 'Kick';
                    kickBtn.onclick = () => this.kickPlayer(playerId);
                    
                    const banBtn = document.createElement('button');
                    banBtn.className = 'player-action-btn ban-btn';
                    banBtn.textContent = 'Ban';
                    banBtn.onclick = () => this.banPlayer(playerId);
                    
                    actionsDiv.appendChild(kickBtn);
                    actionsDiv.appendChild(banBtn);
                    playerDiv.appendChild(actionsDiv);
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

    updateHostUI() {
        // Update map buttons to show/hide based on host status
        const mapBtns = document.querySelectorAll('.map-btn');
        mapBtns.forEach(btn => {
            btn.style.display = this.isHost ? 'inline-block' : 'none';
        });

        // Show/hide host indicator
        const hostIndicator = document.getElementById('hostIndicator');
        if (hostIndicator) {
            hostIndicator.style.display = this.isHost ? 'block' : 'none';
        }

        // Show/hide host settings button
        const hostSettingsBtn = document.getElementById('hostSettingsBtn');
        if (hostSettingsBtn) {
            hostSettingsBtn.style.display = this.isHost ? 'block' : 'none';
        }
    }

    kickPlayer(playerId) {
        if (this.isHost) {
            this.socket.emit('kickPlayer', playerId);
        }
    }

    banPlayer(playerId) {
        if (this.isHost) {
            this.socket.emit('banPlayer', playerId);
        }
    }

    disconnect() {
        this.socket.disconnect();
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('joinForm').parentElement.style.display = 'block';
    }

    updateGameSettings(maxTime, maxScore) {
        if (this.isHost) {
            this.socket.emit('updateGameSettings', { maxTime, maxScore });
        }
    }

    restartGame() {
        if (this.isHost) {
            this.socket.emit('restartGame');
        }
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new HaxballClient();
});
