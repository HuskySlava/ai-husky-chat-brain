import dotenv from 'dotenv';
import express from "express";
import helmet from "helmet";
import chatRoutes from "./routes/chat-rest.routes";

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { handleWebSocketMessages } from './routes/chat-ws.routes'

dotenv.config();
export const server = express();

server.use(helmet());
server.use(express.json());
server.disable('x-powered-by');


// WS
const wsServer = createServer(server);
const wss = new WebSocketServer({ server: wsServer });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleWebSocketMessages(ws, message);
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });
});

// REST
server.use('/chat', chatRoutes)
server.get('*', (req    , res) => {
    res.status(404).json({
        message: 'Not Found'
    });
});

wsServer.listen(process.env.PORT,  () => {
    console.log(Date() + ` - Server started on port ${process.env.PORT}`);
})
