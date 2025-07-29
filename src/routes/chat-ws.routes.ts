import { WebSocket } from 'ws';
import * as wsService from '../services/ws.service'

export function handleWebSocketMessages(ws: WebSocket, message: any) {
    switch (message.type) {
        case 'chat':
            wsService.handleChatWS(ws, message);
            break;
        default:
            ws.send(JSON.stringify({
                type: "error",
                message: 'Unknown message'
            }));
    }
}
