const http = require("http");
const express = require("express");
const app = express();

app.use(express.static("public"));

const serverPort = process.env.PORT || 3000;
const server = http.createServer(app);
const WebSocket = require("ws");

let keepAliveId;

const wss =
  process.env.NODE_ENV === "production"
    ? new WebSocket.Server({ server })
    : new WebSocket.Server({ port: 5001 });

server.listen(serverPort);
console.log(
  `Server started on port ${serverPort} in stage ${process.env.NODE_ENV}`
);

// List of allowed origins
const allowedOrigins = [
  "https://joshuaingle.art",
  "https://www.joshuaingle.art",
  // Add any other subdomains or variations here
];

// Or use a regular expression to match origins ending with 'joshuaingle.art'
const allowedOriginRegex = /^https?:\/\/(www\.)?joshuaingle\.art(:\d+)?(\/.*)?$/i;

wss.on("connection", function (ws, req) {
  const origin = req.headers.origin || req.headers.Origin;

  // Log the origin for debugging
  console.log(`Connection attempted from origin: ${origin}`);

  // Store the origin in the WebSocket connection object
  ws.origin = origin;

  console.log("Client size: ", wss.clients.size);

  if (wss.clients.size === 1) {
    console.log("First connection. Starting keepAlive");
    keepServerAlive();
  }

  ws.on("message", (data) => {
    let stringifiedData = data.toString();
    if (stringifiedData === "pong") {
      console.log("keepAlive");
      return;
    }

    // Check if the message is from an allowed origin
    if (!originIsAllowed(ws.origin)) {
      console.log(`Message from unauthorized origin: ${ws.origin}`);
      // Optionally notify the client
      // ws.send('You are not authorized to send messages.');
      return;
    }

    broadcast(ws, stringifiedData, false);
  });

  ws.on("close", (data) => {
    console.log("Closing connection");

    if (wss.clients.size === 0) {
      console.log("Last client disconnected, stopping keepAlive interval");
      clearInterval(keepAliveId);
    }
  });
});

// Function to check if the origin is allowed
function originIsAllowed(origin) {
  if (!origin) {
    return false;
  }

  // Check using regular expression
  if (allowedOriginRegex.test(origin)) {
    return true;
  }

  // Alternatively, check against the list of allowed origins
  /*
  return allowedOrigins.includes(origin);
  */

  return false;
}

// Implement broadcast function because ws doesn't have it
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
