require('dotenv').config(); // For environment variables
const http = require("http");
const https = require("https");
const express = require("express");
const fs = require("fs");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const winston = require("winston");

// Configure Logger
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: "error.log", level: "error" }),
        new winston.transports.File({ filename: "combined.log" }),
    ],
});

if (process.env.NODE_ENV !== "production") {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

const app = express();

// Serve static files
app.use(express.static("public"));

// Load SSL certificates if in production
let server;
if (process.env.NODE_ENV === "production") {
    const options = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH)
    };
    server = https.createServer(options, app);
} else {
    server = http.createServer(app);
}

const serverPort = process.env.PORT || 3000;
server.listen(serverPort, () => {
    logger.info(`Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`);
});

// Allowed origins regex from environment variables
const allowedOriginRegex = process.env.ALLOWED_ORIGINS_REGEX
    ? new RegExp(process.env.ALLOWED_ORIGINS_REGEX, 'i')
    : /^https?:\/\/(www\.)?joshuaingle\.art(:\d+)?(\/.*)?$/i;

// Password from environment variables
const ALLOWED_PASSWORD = process.env.ALLOWED_PASSWORD || "asdf";

// WebSocket server setup
const wss = process.env.NODE_ENV === "production"
    ? new WebSocket.Server({ server })
    : new WebSocket.Server({ port: 5001 });

let keepAliveId;

// Handle new connections
wss.on("connection", function (ws, req) {
    const origin = req.headers.origin || req.headers.Origin;
    logger.info(`Connection attempted from origin: ${origin}`);

    ws.isAuthenticated = false;

    // Authenticate based on origin
    if (origin && originIsAllowed(origin)) {
        ws.isAuthenticated = true;
        ws.send(JSON.stringify({ type: 'auth_result', success: true, via: 'origin' }));
        logger.info(`Client authenticated via origin: ${origin}`);
    }

    // Handle incoming messages
    ws.on("message", (data) => {
        try {
            const message = data.toString();

            // Handle keep-alive pongs if needed
            if (message === "pong") {
                logger.info("Received pong from client");
                return;
            }

            // Authentication logic
            if (!ws.isAuthenticated) {
                if (message === ALLOWED_PASSWORD) {
                    ws.isAuthenticated = true;
                    ws.send(JSON.stringify({ type: 'auth_result', success: true, via: 'password' }));
                    logger.info("Client authenticated via password");
                } else {
                    ws.send(JSON.stringify({ type: 'auth_result', success: false, message: 'Unauthorized' }));
                    logger.warn("Unauthorized client attempt");
                    ws.close(1008, "Unauthorized");
                }
                return;
            }

            // Broadcast authenticated messages
            if (ws.isAuthenticated) {
                const broadcastMessage = JSON.stringify({ type: 'broadcast', message: message });
                broadcast(ws, broadcastMessage, false);
                logger.info(`Broadcasted message: ${message}`);
            }

        } catch (err) {
            logger.error("Error handling message:", err);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on("close", (code, reason) => {
        logger.info(`Connection closed: ${code} - ${reason}`);
        if (wss.clients.size === 0) {
            logger.info("Last client disconnected, stopping keepAlive interval");
            clearInterval(keepAliveId);
        }
    });

    ws.on("error", (error) => {
        logger.error(`WebSocket error: ${error}`);
    });

    // Start keep-alive if first client connects
    if (wss.clients.size === 1) {
        logger.info("First connection. Starting keepAlive");
        keepServerAlive();
    }
});

// Function to check if the origin is allowed
function originIsAllowed(origin) {
    if (!origin) return false;
    return allowedOriginRegex.test(origin);
}

// Broadcast function
const broadcast = (ws, message, includeSelf) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            if (includeSelf || client !== ws) {
                client.send(message);
            }
        }
    });
};

// Keep-alive mechanism
const keepServerAlive = () => {
    keepAliveId = setInterval(() => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send("ping");
            }
        });
    }, 50000);
};

// Express route
app.get("/", (req, res) => {
    res.send("Hello World!");
});
