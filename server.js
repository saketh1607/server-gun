const WebSocket = require('ws');

class GameServer {
    constructor(port) {
        this.server = new WebSocket.Server({ port: port });
        this.players = {};
        this.matchInProgress = false;

        this.setupServerEvents();
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
        switch (data.type) {
            case 'register':
                this.registerPlayer(socket, data);
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
    }

    handlePlayerDisconnect(socket) {
        if (socket.playerId && this.players[socket.playerId]) {
            console.log('Player disconnected:', socket.playerId);
            delete this.players[socket.playerId];
        }
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

    handleShoot(data) {
        const shooter = this.players[data.shooter];
        if (!shooter) return;
        this.updatePlayerState(data);
        // Update shooter location and azimuth at the moment of shooting
        // shooter.lat = data.lat;
        // shooter.lon = data.lon;
        // shooter.azimuth = data.azimuth;

        console.log(`Shooter ${shooter.id} fired at lat: ${shooter.lat}, lon: ${shooter.lon}, azimuth: ${shooter.azimuth}`);

        // Check for hits on other players
        Object.values(this.players).forEach(target => {
            if (target.id !== shooter.id && this.checkHit(shooter, target)) {
                this.handleHit(shooter, target);
            }
        });
    }

    checkHit(shooter, target) {
        if (!shooter.lat || !shooter.lon || !target.lat || !target.lon) {
            console.log("Missing coordinates for shooter or target.");
            return false;
        }

        const distance = this.calculateDistance(
            shooter.lat, shooter.lon,
            target.lat, target.lon
        );
        const bearingToTarget = this.calculateBearing(
            shooter.lat, shooter.lon,
            target.lat, target.lon
        );
        const angleDiff = Math.abs(shooter.azimuth - bearingToTarget);

        console.log(`Distance: ${distance}, Angle Difference: ${angleDiff}`);

        return distance < 10 && angleDiff < 360; // Example hit criteria
    }

    handleHit(shooter, target) {
        target.health -= 10;
        console.log(`Target ${target.id} hit! Health: ${target.health}`);

        if (target.health <= 0) {
            target.health = 0;
            target.isEliminated = true;
            shooter.score += 100;
            shooter.kills += 1;

            console.log(`Player ${target.id} eliminated by ${shooter.id}`);
        }

        this.broadcastGameState();
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.degreesToRadians(lat2 - lat1);
        const dLon = this.degreesToRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
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
        return (this.radiansToDegrees(Math.atan2(x, y)) + 360) % 360;
    }

    radiansToDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    broadcastGameState() {
        const state = {
            type: 'updatePlayers',
            players: this.players
        };

        const message = JSON.stringify(state);
        this.server.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}

const port = process.argv[2] || 8080;
new GameServer(port);
