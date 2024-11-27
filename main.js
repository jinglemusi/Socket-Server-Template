const http = require("http");
const express = require("express");
const app = express();

app.use(express.static("public"));

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);
const WebSocket = require("ws");

let keepAliveId;

// Use `server` for production or port 5001 for development
const wss =
  process.env.NODE_ENV === "production"
    ? new WebSocket.Server({ server })
    : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(
  `Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`
);

// Regular expression for allowed origin
const allowedOriginRegex = /^https?:\/\/(www\.)?joshuaingle\.art(:\d+)?(\/.*)?$/i;

// Password for connecting clients
const ALLOWED_PASSWORD = "asdf";

wss.on("connection", function (ws, req) {
  const origin = req.headers.origin || req.headers.Origin;

  console.log(`Connection attempted from origin: ${origin}`);
  ws.isAuthenticated = false; // Track if the client has authenticated

  // Allow connections from allowed origin without password
  if (origin && originIsAllowed(origin)) {
    ws.isAuthenticated = true;
    console.log(`Client authenticated via origin: ${origin}`);
    ws.send("Authenticated via origin");
  }

  ws.on("message", (data) => {
    const message = data.toString();

    // Handle password-based authentication for other origins
    if (!ws.isAuthenticated) {
      if (message === ALLOWED_PASSWORD) {
        ws.isAuthenticated = true;
        console.log("Client authenticated via password");
        ws.send("Authenticated via password");
      } else {
        console.log("Unauthorized client attempt");
        ws.send("Unauthorized: Invalid password or origin");
        ws.close(1008, "Unauthorized");
      }
      return;
    }

    // Broadcast messages if authenticated
    if (ws.isAuthenticated) {
      broadcast(ws, message, false);
    }
  });

  ws.on("close", () => {
    console.log("Closing connection");
    if (wss.clients.size === 0) {
      console.log("Last client disconnected, stopping keepAlive interval");
      clearInterval(keepAliveId);
    }
  });

  // Start the keep-alive mechanism if this is the first connection
  if (wss.clients.size === 1) {
    console.log("First connection. Starting keepAlive");
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
  if (includeSelf) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } else {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

/**
 * Sends a ping message to all connected clients every 50 seconds
 */
const keepServerAlive = () => {
  keepAliveId = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send("ping");
      }
    });
  }, 50000);
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});
