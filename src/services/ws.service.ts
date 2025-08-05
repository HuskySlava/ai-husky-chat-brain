import {WebSocket, WebSocketServer} from "ws";
import {Server} from "http";
import { v4 as uuidv4 } from 'uuid';
import AiService, {AIModels} from "./ai.service";

type UUID = string;

const randomMessages = [
    "The history of the world is a complex tapestry woven from countless individual stories, grand events, and the slow, inexorable march of progress and decline. From the rise and fall of empires to the quiet innovations that change daily life, every era contributes its unique threads to this vast narrative. Understanding these layers helps us appreciate the present and anticipate the future, as patterns often repeat, albeit in new guises.",
    "Exploring the vastness of space continues to captivate humanity, pushing the boundaries of our knowledge and technology. From distant galaxies to the potential for life on other planets, the cosmos offers endless mysteries and opportunities for discovery. Every mission, every new astronomical finding, adds another piece to the puzzle of our universe, inspiring awe and a deeper understanding of our place within it.",
    "The development of artificial intelligence marks a significant turning point in human history, promising to reshape industries, improve daily life, and raise profound ethical questions. As AI systems become more sophisticated, their integration into society will require careful consideration of privacy, employment, and the very nature of human creativity and intelligence. The future impact of AI will largely depend on how we choose to guide its evolution.",
    "Nature's resilience is a constant source of wonder and a critical lesson for sustainable living. Despite human impact, ecosystems often find ways to recover and adapt, demonstrating an inherent ability to maintain balance. Protecting biodiversity and understanding the intricate connections within natural environments are essential steps towards ensuring the long-term health of our planet and the well-being of all its inhabitants.",
    "The art of storytelling, in its many forms, has been a fundamental part of human culture for millennia. From ancient oral traditions to modern cinematic masterpieces, stories serve to entertain, educate, and transmit values across generations. They allow us to explore different perspectives, confront complex emotions, and connect with universal human experiences, fostering empathy and understanding in a diverse world.",
    "The quiet hum of technology often masks the intricate dance of data, algorithms, and human ingenuity that powers our modern world. From the smallest smart device to the largest supercomputer, a vast network is constantly at work, processing information and connecting individuals across continents.",
    "Rainforests are vital for the planet's health, acting as enormous carbon sinks and housing an incredible array of biodiversity. Their continued destruction poses a serious threat to global climate patterns and countless species, highlighting the urgent need for conservation efforts.",
    "The invention of the printing press revolutionized the spread of knowledge, making books accessible to a wider audience and fundamentally changing education and communication. This single innovation laid the groundwork for many of the freedoms and advancements we cherish today.",
    "Urban planning is a complex discipline that seeks to balance the needs of populations with the sustainable development of cities. It involves intricate considerations of infrastructure, public spaces, housing, and environmental impact.",
    "Classical music, with its rich history and profound emotional depth, continues to resonate with audiences worldwide. Its intricate compositions and timeless melodies offer a unique journey through human expression and creativity, transcending cultural boundaries.",
    "The scientific method is the cornerstone of modern empirical inquiry, providing a systematic approach to understanding the natural world through observation, experimentation, and rigorous analysis. It is a continuous cycle of hypothesis testing and refinement.",
    "Small acts of kindness can ripple outwards, creating a significant positive impact on communities and individuals. Empathy and compassion are powerful forces that foster connection and build stronger, more supportive societies.",
    "A good book can transport you to another world.",
    "Innovation drives progress.",
    "The ocean holds many secrets.",
    "Sustainability is key.",
    "Learn something new every day.",
    "Think outside the box.",
    "Simple solutions are often best.",
    "Enjoy the little things."
];

export interface ChatMessage {
    id: number;
    type: "incoming" | "outgoing";
    timestamp: number;
    text  : string;
}

interface WsUser {
    uuid: string;
    displayName: string;
    isActive: boolean;
    ws?: WebSocket;
}

interface WsUserList {
    [key: UUID]: WsUser;
}

const users = {}

export default class WebSocketService {
    private static instance: WebSocketService;
    private wss: WebSocketServer;
    private wsUserList: WsUserList;
    private aiService: AiService;

    private constructor(server: Server) {
        this.wss = new WebSocketServer({ server: server });
        this.wsUserList = {};
        this.init();
        this.aiService = AiService.getInstance();
        AiService.initialize();
    }

    public static getInstance(server: Server): WebSocketService {
        if(!WebSocketService.instance){
            WebSocketService.instance = new WebSocketService(server);
        }
        return WebSocketService.instance;
    }

    private init(){
        this.wss.on('connection', (ws: WebSocket, request) => {
            const url = new URL(request.url || "/", `http://${request.headers.host}`);
            const clientUuid = url.searchParams.get("uuid");

            let user: WsUser;
            let isNew = false;

            if(clientUuid && this.wsUserList[clientUuid]){
                user = this.wsUserList[clientUuid];
                user.isActive = true;
            } else {
                const clientUserName = url.searchParams.get("userName") || "Guest";
                user = this.createWsUser(clientUserName);
                this.wsUserList[user.uuid] = user;
                isNew = true;
            }

            user.ws = ws;

            // Send the UUID to the client
            ws.send(JSON.stringify({
                type: "init",
                uuid: user.uuid,
                displayName: user.displayName,
                isNew,
            }));

            ws.send(JSON.stringify({
                id: uuidv4(),
                type: "incoming",
                text: "Hello!, Let's discuss \"5th edition of Cardiac Surgery in the Adult\"",
                timestamp: Date.now()
            }))

            ws.on("close", () => {
                user.isActive = false;
                user.ws = undefined;
            });

            ws.on("message", (message) => {
                try {
                    const raw = message.toString();
                    const msg = JSON.parse(raw);

                    if (typeof msg !== 'object' || msg === null || !msg.type) {
                        throw new Error('Invalid message format: missing "type"');
                    }

                    if(msg.type === "outgoing") {

                        // Echo message
                        ws.send(JSON.stringify({
                            id: msg.id,
                            type: msg.type,
                            text: msg.text,
                            timestamp: msg.timestamp
                        }))

                        this.aiService.queryAi(msg.text, AIModels.LLAMA3).then(res => {
                            ws.send(JSON.stringify({
                                id: uuidv4(),
                                type: 'incoming',
                                text: res,
                                timestamp: Date.now()
                            }))
                        })
                    }


                } catch (err) {
                    console.error('Invalid message:', err);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format',
                    }));
                }
            })

        });

        this.wss.on('error', (error: Error) => {
            console.error('WebSocket server error:', error);
        });

        this.heartBeat();
        // this.simulateMessages();
    }

    createWsUser(displayName: string): WsUser {
        return {
            uuid: uuidv4(),
            displayName: displayName,
            isActive: true,
        }
    }

    heartBeat(){
        setInterval(() => {
            const now = Date.now();
            this.wss.clients.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'heartbeat', time: now}));
                }
            });
        }, 1000);
    }

    simulateMessages(){
        setInterval(() => {
            const now = Date.now();
            this.wss.clients.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'chatMessage', chatMessage: this.generateMockMessage(now)}));
                }
            });
        }, 1000)
    }

    generateMockMessage(id: number): ChatMessage {
        const rngType = Math.random() * 2
        return {
            id: id,
            text: randomMessages[Math.floor(Math.random() * 20)],
            timestamp: new Date().getTime(),
            type: rngType > 1 ? "incoming" : "outgoing"
        }
    }
}


