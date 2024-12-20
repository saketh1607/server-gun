const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 8080 });
console.log("WebSocket server is running on port 8080");

const players = {};

server.on("connection", (socket) => {
    let playerId; // Store the player ID for the session

    console.log("New client connected");

    socket.on("message", (message) => {
        console.log("Received message:", message);
        const data = JSON.parse(message);

        if (data.type === "register") {
            playerId = data.id; // Assign player ID when they register
            players[playerId] = { azimuth: null, lat: null, lon: null };
            console.log("Player registered:", playerId);
            broadcastPlayers();
        } else if (data.type === "update") {
            if (players[data.id]) {
                players[data.id] = { ...players[data.id], ...data };
                console.log("Player updated:", data.id, players[data.id]);
                broadcastPlayers();
            }
        } else if (data.type === "shoot") {
            console.log("Player shooting:", data.shooter);
            handleShoot(data.shooter);
        }
    });

    socket.on("close", () => {
        if (playerId) {
            console.log("Client disconnected: " + playerId);
            delete players[playerId]; // Remove player data on disconnect
            broadcastPlayers();
        }
    });

    socket.on("error", (error) => {
        console.error("WebSocket Error:", error);
    });
});

// Broadcast updated player list
function broadcastPlayers() {
    server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "updatePlayers", players }));
        }
    });
}

// Handle shooting logic
function handleShoot(shooterId) {
    const shooter = players[shooterId];
    if (!shooter || shooter.azimuth === null) return;

    for (const [id, target] of Object.entries(players)) {
        if (id !== shooterId && target.azimuth !== null) {
            const azimuthDiff = Math.abs(shooter.azimuth - target.azimuth);
            const distance = calculateDistance(shooter.lat, shooter.lon, target.lat, target.lon);
            if (azimuthDiff <= 185 && distance <= 20) {
                console.log("Player hit:", id);
                server.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: "hit", target: id }));
                    }
                });
            } else {
                console.log("Shot missed:", id);
            }
        }
    }
}

// Calculate distance between two GPS coordinates (in meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}
