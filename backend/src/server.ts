import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { initSockets } from "./sockets";

const app = createApp();
const httpServer = http.createServer(app);

let io: Server;

httpServer.on("listening", () => {
  console.log(`DevFlow API listening on port ${process.env.PORT || 4000}`);
});

io = initSockets(httpServer);

// Exposed so REST controllers can emit real-time events (e.g. task created)
// without importing the whole sockets module and risking circular imports.
export function getIo(): Server {
  return io;
}

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT);

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  httpServer.close(() => process.exit(0));
});
