const WebSocket = require('ws');

class GameServer {
    constructor(port) {
        this.server = new WebSocket.Server({ port: port });
        this.players = {};
        this.powerups = [];
        this.matchInProgress = false;
        this.matchDuration = 300; // 5 minutes
        
        this.setupServerEvents();
        this.startGameLoop();
        
        console.log(`Game server running on port ${port}`);
    }

    setupServerEvents() {
        this.server.on('connection', (socket) => {
            console.log('New client connected');
            
            socket.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handlePlayerMessage(socket, data);
                } catch (error) {
                    console.error('Error handling message:', error);
                }
            });

            socket.on('close', () => {
                this.handlePlayerDisconnect(socket);
            });
        });
    }

    handlePlayerMessage(socket, data) {
        console.log('Message received:', data);
        switch (data.type) {
            case 'register':
                this.registerPlayer(socket, data);
                break;
            case 'update':
                this.updatePlayerState(data);
                break;
            case 'shoot':
                this.handleShoot(data);
                break;
        }
    }

    registerPlayer(socket, data) {
        const playerId = data.id;
        console.log(`Registering player with ID: ${playerId}`);
        socket.playerId = playerId;
        
        this.players[playerId] = {
            id: playerId,
            socket: socket,
            lat: null,
            lon: null,
            azimuth: null,
            health: 100,
            score: 0,
            kills: 0
        };
        console.log('Players after registration:', this.players);
        this.broadcastGameState();
    }

    updatePlayerState(data) {
        if (this.players[data.id]) {
            Object.assign(this.players[data.id], {
                lat: data.lat,
                lon: data.lon,
                azimuth: data.azimuth,
                health: data.health
            });
            this.broadcastGameState();
        }
    }

    handlePlayerDisconnect(socket) {
        if (socket.playerId && this.players[socket.playerId]) {
            console.log('Player disconnected:', socket.playerId);
            delete this.players[socket.playerId];
            this.broadcastGameState();
        }
    }

    handleShoot(data) {
        const shooter = this.players[data.shooter];
        if (!shooter) return;
        // Check for hits on other players
        Object.values(this.players).forEach(target => {
            if (target.id !== shooter.id) {
                if (this.checkHit(shooter, target)) {
                    this.handleHit(shooter, target);
                }
            }
        });
    }

    checkHit(shooter, target) {
        console.log("Checking hit...");
    
        // Ensure the shooter and target have valid coordinates
        if (!shooter.lat || !shooter.lon || !target.lat || !target.lon) {
            console.log("Missing coordinates for shooter or target.");
            return false;
        }
    
        // Calculate distance between players
        const distance = this.calculateDistance(
            shooter.lat, shooter.lon,
            target.lat, target.lon
        );
        console.log(`Distance between shooter and target: ${distance} km`);
    
        // Calculate angle difference
        const bearingToTarget = this.calculateBearing(
            shooter.lat, shooter.lon,
            target.lat, target.lon
        );
        const angleDiff = Math.abs((shooter.azimuth - bearingToTarget + 360) % 360);
        const shortestAngleDiff = Math.min(angleDiff, 360 - angleDiff);
        console.log(`Bearing to target: ${bearingToTarget}, Shortest angle difference: ${shortestAngleDiff}`);
    
        // Define hit criteria
        const isWithinRange = distance * 1000 < 10; // 10 meters
        const isAligned = shortestAngleDiff >= 175 && shortestAngleDiff <= 185; // Tight range for "facing"
        const isHit = isWithinRange && isAligned;
    
        console.log(`Is within range: ${isWithinRange}, Is aligned: ${isAligned}, Is hit: ${isHit}`);
        return isHit;
    }
    
    
    handleHit(shooter, target) {
        console.log(`Handling hit: Shooter ${shooter.id} -> Target ${target.id}`);
        
        // Ensure both shooter and target exist
        if (!this.players[shooter.id] || !this.players[target.id]) {
            console.log('Shooter or target does not exist');
            return;
        }
        
        // Reduce target's health
        this.players[target.id].health -= 10;
        console.log(`Target ${target.id} health: ${this.players[target.id].health}`);
        
        // Check if target is eliminated
        if (this.players[target.id].health <= 0) {
            console.log(`Player ${target.id} eliminated by ${shooter.id}`);
            this.players[target.id].health = 0;
            this.players[target.id].isEliminated = true;
        
            // Update shooter's score and kills
            this.players[shooter.id].score += 100;
            this.players[shooter.id].kills += 1;
        }
        
        // Broadcast the hit to all clients
        const hitMessage = {
            type: 'hit',
            shooter: shooter.id,
            target: target.id,
            health: this.players[target.id].health
        };
        this.server.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(hitMessage));
            }
        });
        
        // Broadcast updated game state
        this.broadcastGameState();
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Implement the Haversine formula or any other distance calculation
        const R = 6371; // Radius of the Earth in km
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        const dLon = this.degreesToRadians(lon2 - lon1);
        lat1 = this.degreesToRadians(lat1);
        lat2 = this.degreesToRadians(lat2);

        const x = Math.sin(dLon) * Math.cos(lat2);
        const y = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const initialBearing = Math.atan2(x, y);
        return (this.radiansToDegrees(initialBearing) + 360) % 360; // Normalize to 0-360
    }

    radiansToDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    broadcastGameState() {
        const state = {
            type: 'updatePlayers',
            players: this.players,
            powerups: this.powerups,
            matchInProgress: this.matchInProgress
        };
        console.log('Broadcasting game state:', state);
        const message = JSON.stringify(state);
        this.server.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    startGameLoop() {
        // Implement game loop logic if needed
        setInterval(() => {
            // Example: Update game state, spawn powerups, etc.
        }, 1000); // Adjust interval as needed
    }
}

// Start the server
const port = process.argv[2] || 8080; // Allow port to be set via command line
new GameServer(port);
