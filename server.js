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
        #shoot, #powerUp {
            position: fixed;
            bottom: 20px;
            background: #ff4444;
            border: none;
            color: white;
            padding: 15px 30px;
            border-radius: 25px;
            cursor: pointer;
            pointer-events: auto;
        }
        #shoot { right: 20px; }
        #powerUp { left: 20px; background: #4CAF50; }
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
            <div>Match Time: <span id="matchTime">05:00</span></div>
        </div>
        <div id="leaderboard" class="stats">
            <h3>Top Players</h3>
            <div id="leaderboardList"></div>
        </div>
        <button id="shoot">SHOOT</button>
        <button id="powerUp">POWER UP</button>
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
                this.matchTime = 300; // 5 minutes

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
                    this.socket.send(JSON.stringify({ type: 'register', id: this.playerId }));
                };
                this.socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleServerMessage(data);
                };
            }

            setupControls() {
                navigator.geolocation.watchPosition(
                    (position) => {
                        this.position = {
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        };
                        this.sendUpdate();
                    },
                    (error) => console.error('GPS Error:', error),
                    { enableHighAccuracy: true }
                );

                window.addEventListener('deviceorientationabsolute', (event) => {
                    if (event.alpha !== null) {
                        this.azimuth = event.alpha;
                        this.sendUpdate();
                    }
                });

                document.getElementById('shoot').addEventListener('click', () => this.shoot());
                document.getElementById('powerUp').addEventListener('click', () => this.activatePowerUp());
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
                this.effects = this.effects.filter(effect => effect.lifetime > 0);
                this.matchTime = Math.max(0, this.matchTime - 1 / 60);
                const minutes = Math.floor(this.matchTime / 60).toString().padStart(2, '0');
                const seconds = Math.floor(this.matchTime % 60).toString().padStart(2, '0');
                document.getElementById('matchTime').textContent = `${minutes}:${seconds}`;
                document.getElementById('healthBar').style.width = `${this.health}%`;
                document.getElementById('scoreDisplay').textContent = this.score;
                document.getElementById('rankDisplay').textContent = this.rank;
                document.getElementById('playerCount').textContent = Object.keys(this.players).length;
            }

            render() {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.drawGrid();
                Object.entries(this.players).forEach(([id, player]) => this.drawPlayer(player, id === this.playerId));
                this.effects.forEach(effect => this.drawEffect(effect));
            }

            drawGrid() {
                this.ctx.strokeStyle = '#2a2a4a';
                const gridSize = 50;
                for (let x = 0; x < this.canvas.width; x += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, 0);
                    this.ctx.lineTo(x, this.canvas.height);
                    this.ctx.stroke();
                }
                for (let y = 0; y < this.canvas.height; y += gridSize) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, y);
                    this.ctx.lineTo(this.canvas.width, y);
                    this.ctx.stroke();
                }
            }

            drawPlayer(player, isCurrentPlayer) {
                if (!player.lat || !player.lon) return;
                const x = (player.lon - this.position.lon) * 1000000 + this.canvas.width / 2;
                const y = (this.position.lat - player.lat) * 1000000 + this.canvas.height / 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 20, 0, Math.PI * 2);
                this.ctx.fillStyle = isCurrentPlayer ? '#4CAF50' : '#FF5722';
                this.ctx.fill();
            }

            drawEffect(effect) {
                const alpha = effect.lifetime / effect.maxLifetime;
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                this.ctx.beginPath();
                this.ctx.moveTo(effect.x1, effect.y1);
                this.ctx.lineTo(effect.x2, effect.y2);
                this.ctx.stroke();
            }

            handleServerMessage(data) {
                if (data.type === 'updatePlayers') this.players = data.players;
                if (data.type === 'hit' && data.target === this.playerId) this.health = Math.max(0, this.health - 10);
            }

            sendUpdate() {
                if (this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify({
                        type: 'update',
                        id: this.playerId,
                        lat: this.position?.lat,
                        lon: this.position?.lon,
                        azimuth: this.azimuth,
                        health: this.health
                    }));
                }
            }

            shoot() {
                if (this.socket.readyState === WebSocket.OPEN) {
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

            activatePowerUp() {
                this.health = Math.min(100, this.health + 20);
                this.score += 50;
            }
        }

        window.addEventListener('load', () => new Game());
    </script>
</body>
</html>
