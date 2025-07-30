import dotenv from 'dotenv';
import express from "express";
import helmet from "helmet";
import chatRoutes from "./routes/chat-rest.routes";
import WebSocketService from "./services/ws.service"
import {createServer} from "node:http";

dotenv.config();
export const server = express();

server.use(helmet());
server.use(express.json());
server.disable('x-powered-by');

// REST
server.use('/chat', chatRoutes)
server.get('*', (req    , res) => {
    res.status(404).json({
        message: 'Not Found'
    });
});

// WSS
const httpServer = createServer(server);
WebSocketService.getInstance(httpServer);

httpServer.listen(process.env.PORT,  () => {
    console.log(Date() + ` - Server started on port ${process.env.PORT}`);
})
