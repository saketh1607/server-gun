<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Location Game</title>
    <style>
        body { margin: 0; overflow: hidden; font-family: Arial, sans-serif; }
        canvas { background: #1a1b2e; }
        #gameInterface {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            pointer-events: none;
        }
        .stats {
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 10px;
            margin: 10px;
            border-radius: 5px;
            position: absolute;
        }
        #playerStats { top: 10px; left: 10px; }
        #gameInfo { top: 10px; right: 10px; }
        #leaderboard { top: 10px; left: 50%; transform: translateX(-50%); }
        .health-bar {
            width: 200px;
            height: 20px;
            background: #333;
            margin: 5px 0;
            border-radius: 10px;
            overflow: hidden;
        }
        .health-bar div {
            height: 100%;
            background: linear-gradient(90deg, #ff0000, #ff4444);
            transition: width 0.3s;
        }
        #shoot {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #ff4444;
            border: none;
            color: white;
            padding: 15px 30px;
            border-radius: 25px;
            cursor: pointer;
            pointer-events: auto;
        }
    </style>
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    <div id="gameInterface">
        <div id="playerStats" class="stats">
            <div>Health: <div class="health-bar"><div id="healthBar"></div></div></div>
            <div>Score: <span id="scoreDisplay">0</span></div>
            <div>Rank: <span id="rankDisplay">Rookie</span></div>
        </div>
        <div id="gameInfo" class="stats">
            <div>Players Online: <span id="playerCount">0</span></div>
            <div>Match Time: <span id="matchTime">5:00</span></div>
        </div>
        <div id="leaderboard" class="stats">
            <h3>Top Players</h3>
            <div id="leaderboardList"></div>
        </div>
        <button id="shoot">SHOOT</button>
    </div>

    <script>
        class Game {
            constructor() {
                this.canvas = document.getElementById('gameCanvas');
                this.ctx = this.canvas.getContext('2d');
                this.playerId = Math.random().toString(36).substr(2, 9);
                this.players = {};
                this.health = 100;
                this.score = 0;
                this.rank = 'Rookie';
                this.effects = [];
                this.lastUpdate = 0;
                this.updateInterval = 2000; // 2 seconds in milliseconds
                this.pendingUpdate = false;
                
                this.setupCanvas();
                this.setupWebSocket();
                this.setupControls();
                this.setupGameLoop();
            }

            setupCanvas() {
                const resize = () => {
                    this.canvas.width = window.innerWidth;
                    this.canvas.height = window.innerHeight;
                };
                window.addEventListener('resize', resize);
                resize();
            }

            setupWebSocket() {
                this.socket = new WebSocket("ws://192.168.0.103:8080");
                this.socket.onopen = () => {
                    console.log("WebSocket connection established.");
                    this.socket.send(JSON.stringify({
                        type: 'register',
                        id: this.playerId
                    }));
                    console.log("Player registered with ID:", this.playerId);
                };

                this.socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    console.log("Message received from server:", data);
                    this.handleServerMessage(data);
                };

                this.socket.onclose = () => {
                    console.log("WebSocket connection closed.");
                };

                this.socket.onerror = (error) => {
                    console.error("WebSocket error:", error);
                };
            }

            setupControls() {
                navigator.geolocation.watchPosition(
                    (position) => {
                        this.position = {
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        };
                        console.log("Updated position - Lat:", this.position.lat, "Lon:", this.position.lon);
                        this.queueUpdate();
                    },
                    (error) => console.error('GPS Error:', error),
                    { enableHighAccuracy: true }
                );

                window.addEventListener('deviceorientationabsolute', (event) => {
                    if (event.alpha !== null) {
                        this.azimuth = event.alpha;
                        console.log("Updated azimuth angle:", this.azimuth);
                        this.queueUpdate();
                    }
                });

                document.getElementById('shoot').addEventListener('click', () => {
                    console.log("Shoot button clicked.");
                    this.shoot();
                });
            }

            queueUpdate() {
                this.pendingUpdate = true;
                const now = Date.now();
                if (now - this.lastUpdate >= this.updateInterval) {
                    this.sendUpdate();
                }
            }

            sendUpdate() {
                if (!this.pendingUpdate) return;
                
                const now = Date.now();
                if (now - this.lastUpdate < this.updateInterval) return;

                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        type: 'update',
                        id: this.playerId,
                        lat: this.position?.lat,
                        lon: this.position?.lon,
                        azimuth: this.azimuth,
                        health: this.health
                    }));
                    console.log("Player state updated:", {
                        id: this.playerId,
                        lat: this.position?.lat,
                        lon: this.position?.lon,
                        azimuth: this.azimuth,
                        health: this.health
                    });
                    
                    this.lastUpdate = now;
                    this.pendingUpdate = false;
                }
            }

            setupGameLoop() {
                const gameLoop = () => {
                    this.update();
                    this.render();
                    requestAnimationFrame(gameLoop);
                };
                gameLoop();
            }

            update() {
                // Check if we should send an update
                if (this.pendingUpdate) {
                    this.sendUpdate();
                }

                // Update effects
                this.effects = this.effects.filter(effect => {
                    effect.lifetime -= 16; // 16ms per frame approx
                    return effect.lifetime > 0;
                });

                // Update UI
                document.getElementById('healthBar').style.width = `${this.health}%`;
                document.getElementById('scoreDisplay').textContent = this.score;
                document.getElementById('rankDisplay').textContent = this.rank;
                document.getElementById('playerCount').textContent = Object.keys(this.players).length;
            }

            render() {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Draw world grid
                this.drawGrid();
                
                // Draw players
                Object.entries(this.players).forEach(([id, player]) => {
                    this.drawPlayer(player, id === this.playerId);
                });

                // Draw effects
                this.effects.forEach(effect => this.drawEffect(effect));
            }

            drawGrid() {
                this.ctx.strokeStyle = '#2a2a4a';
                this.ctx.lineWidth = 1;
                
                const gridSize = 50;
                const offsetX = this.canvas.width / 2 % gridSize;
                const offsetY = this.canvas.height / 2 % gridSize;

                for (let x = offsetX; x < this.canvas.width; x += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, 0);
                    this.ctx.lineTo(x, this.canvas.height);
                    this.ctx.stroke();
                }

                for (let y = offsetY; y < this.canvas.height; y += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, y);
                    this.ctx.lineTo(this.canvas.width, y);
                    this.ctx.stroke();
                }
            }

            drawPlayer(player, isCurrentPlayer) {
                if (!player.lat || !player.lon) return;

                // Convert GPS to screen coordinates
                const x = (player.lon - this.position.lon) * 1000000 + this.canvas.width / 2;
                const y = (this.position.lat - player.lat) * 1000000 + this.canvas.height / 2;

                // Draw player circle
                this.ctx.beginPath();
                this.ctx.arc(x, y, 20, 0, Math.PI * 2);
                const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 20);
                gradient.addColorStop(0, isCurrentPlayer ? '#4CAF50' : '#FF5722');
                gradient.addColorStop(1, isCurrentPlayer ? '#1B5E20' : '#BF360C');
                this.ctx.fillStyle = gradient;
                this.ctx.fill();

                // Draw direction indicator
                const angle = (player.azimuth || 0) * Math.PI / 180;
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
                this.ctx.lineTo(
                    x + Math.cos(angle) * 30,
                    y + Math.sin(angle) * 30
                );
                this.ctx.strokeStyle = isCurrentPlayer ? '#81C784' : '#FF8A65';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();

                // Draw player name
                this.ctx.font = '14px Arial';
                this.ctx.fillStyle = '#fff';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(player.id, x, y - 30);
            }

            drawEffect(effect) {
                switch (effect.type) {
                    case 'shoot':
                        const alpha = effect.lifetime / effect.maxLifetime;
                        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(effect.x1, effect.y1);
                        this.ctx.lineTo(effect.x2, effect.y2);
                        this.ctx.stroke();
                        break;
                }
            }

            handleServerMessage(data) {
                switch (data.type) {
                    case 'updatePlayers':
                        this.players = data.players;
                        console.log("Updated players:", this.players);
                        console.log("Player count:", Object.keys(this.players).length);
                        document.getElementById('playerCount').textContent = Object.keys(this.players).length;
                        break;
                    case 'hit':
                        if (data.target === this.playerId) {
                            this.health = Math.max(0, this.health - 10);
                            console.log("Player hit! New health:", this.health);
                            this.addDamageEffect();
                        }
                        break;
                }
            }

            shoot() {
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        type: 'shoot',
                        shooter: this.playerId
                    }));

                    // Add shoot effect
                    const centerX = this.canvas.width / 2;
                    const centerY = this.canvas.height / 2;
                    const angle = this.azimuth * Math.PI / 180;
                    this.effects.push({
                        type: 'shoot',
                        x1: centerX,
                        y1: centerY,
                        x2: centerX + Math.cos(angle) * 1000,
                        y2: centerY + Math.sin(angle) * 1000,
                        lifetime: 500,
                        maxLifetime: 500
                    });
                }
            }

            addDamageEffect() {
                // Flash screen red when damaged
                const overlay = document.createElement('div');
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                overlay.style.pointerEvents = 'none';
                overlay.style.transition = 'opacity 0.5s';
                document.body.appendChild(overlay);
                
                setTimeout(() => {
                    overlay.style.opacity = '0';
                    setTimeout(() => overlay.remove(), 500);
                }, 100);
            }
        }

        // Start the game when the page loads
        window.addEventListener('load', () => {
            const game = new Game();
        });
    </script>
</body>
</html>
