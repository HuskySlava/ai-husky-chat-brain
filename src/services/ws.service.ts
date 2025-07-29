import { WebSocket } from "ws";

export async function handleChatWS(ws: WebSocket, message: any) {
    try {
        ws.send(JSON.stringify({
            type: "chat_response",
            message: "Hello world"
        }));
    } catch (e) {
        ws.send(JSON.stringify(
        {
            type: "error",
            message: 'Chat failed'
        }));
    }
}
