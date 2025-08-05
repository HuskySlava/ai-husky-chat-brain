import fs from 'fs/promises';
import dotenv from 'dotenv';
import axios, { AxiosError } from 'axios';

dotenv.config();

export enum AIModels {
    LLAMA3 = 'llama3',
    NOMIC_EMBED_TEXT = 'nomic-embed-text'
}

interface EmbeddableChunk {
    id: string;
    text: string;
    embedding: number[];
    [key: string]: any;
}

interface RankedChunk extends EmbeddableChunk {
    similarity: number;
}

// Configuration from .env file
const embeddingPath = process.env.EMBEDDING_FILE_PATH;
const ollamaApiBaseUrl = process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434';

export default class AiService {
    private static instance: AiService;
    private chunkData: EmbeddableChunk[] = [];
    private isInitialized = false;

    private constructor() { }

    /**
     * Initializes the AiService by loading embeddings from the file.
     * This must be called once when the application starts.
     */
    public static async initialize(): Promise<void> {
        const service = this.getInstance();
        if (service.isInitialized) {
            console.warn('AiService is already initialized.');
            return;
        }

        if (!embeddingPath) {
            console.warn('EMBEDDING_FILE_PATH not set. Service will run without RAG context.');
            service.isInitialized = true;
            return;
        }

        try {
            const fileContent = await fs.readFile(embeddingPath, 'utf-8');
            const parsed = JSON.parse(fileContent);

            // More robustly find the embeddings array
            const embeddings = Array.isArray(parsed)
                ? parsed
                : parsed?.embeddings ?? parsed?.embedding;

            if (Array.isArray(embeddings)) {
                service.chunkData = embeddings;
                console.log(`✅ Successfully loaded ${service.chunkData.length} embeddings.`);
            } else {
                console.warn('⚠️ Invalid embedding format. Expected an array or an object with an "embeddings" key.');
            }
        } catch (err) {
            console.error('❌ Failed to load or parse embeddings from file:', err);
            throw new Error('Failed to initialize AiService due to embedding file error.');
        }

        service.isInitialized = true;
    }

    public static getInstance(): AiService {
        if (!AiService.instance) {
            AiService.instance = new AiService();
        }
        return AiService.instance;
    }

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('AiService has not been initialized. Call AiService.initialize() first.');
        }
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) throw new Error('Vectors must be the same length');

        const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const normA = Math.sqrt(a.reduce((sum, val) => sum + val ** 2, 0));
        const normB = Math.sqrt(b.reduce((sum, val) => sum + val ** 2, 0));

        if (normA === 0 || normB === 0) return 0;
        return dot / (normA * normB);
    }

    private getRankedChunks(questionEmbedding: number[]): RankedChunk[] {
        // --- DEBUG 1: Is there any data to begin with? ---
        console.log(`[DEBUG] Starting getRankedChunks. Total chunks loaded: ${this.chunkData.length}`);

        if (this.chunkData.length === 0) {
            console.log('[DEBUG] Exiting because no chunk data is loaded.');
            return [];
        }

        const validChunks = this.chunkData.filter(chunk => {
            const isValid = chunk && Array.isArray(chunk.embedding);
            if (!isValid) {
                console.warn(`[DEBUG] Filtering out invalid chunk:`, chunk);
            }
            return isValid;
        });

        // --- DEBUG 3: Did the filter remove everything? ---
        console.log(`[DEBUG] Chunks remaining after filter: ${validChunks.length}`);

        if (validChunks.length === 0) {
            console.log('[DEBUG] Exiting because no valid chunks remained after filtering.');
            return [];
        }

        return validChunks
            .map((chunk) => {
                // --- DEBUG 4: Are the vector dimensions compatible? ---
                if (questionEmbedding.length !== chunk.embedding.length) {
                    console.error(`[FATAL DEBUG] VECTOR LENGTH MISMATCH!`);
                    console.error(`Query Vector Length: ${questionEmbedding.length}`);
                    console.error(`Chunk Vector Length (ID: ${chunk.id}): ${chunk.embedding.length}`);
                    // This is a critical error, so we'll stop here.
                    throw new Error("Vector length mismatch. Check your embedding models.");
                }

                return {
                    ...chunk,
                    similarity: this.cosineSimilarity(questionEmbedding, chunk.embedding),
                };
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3);
    }

    private async generateEmbeddings(text: string, model: AIModels): Promise<number[]> {
        try {
            const response = await axios.post(`${ollamaApiBaseUrl}/api/embeddings`, {
                model: model,
                prompt: text,
            });

            if (!response.data?.embedding) {
                throw new Error('Invalid response from Ollama embeddings API');
            }
            return response.data.embedding;
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Error generating embedding from Ollama:', axiosError.message, axiosError.response?.data);
            throw new Error('Failed to generate embedding.');
        }
    }

    /**
     * Queries the AI with context from the loaded data.
     * @param userQuery The user's question.
     * @param model The AI model to use.
     * @returns A promise that resolves to the AI's answer string.
     */
    public async queryAi(userQuery: string, model: AIModels): Promise<string> {
        this.ensureInitialized();

        try {
            const userQueryEmbedding = await this.generateEmbeddings(userQuery, AIModels.NOMIC_EMBED_TEXT);
            const rankedChunks = this.getRankedChunks(userQueryEmbedding);
            const isContext =  rankedChunks.length > 0;


            console.log("x", rankedChunks)

            let prompt = "";

            if (isContext) {
                const context = rankedChunks.map((c) => c.text).join('\n\n');
                prompt = `
You are answering a question using excerpts from the **"5th Edition of Cardiac Surgery in the Adult"**. Use only the provided context to answer the question.

If the context does not relate to the question, reply with:
"Does not seem to be related to our topic."

Do **not** assume anything outside the context. If you include medical information that is not found directly in the context, you **must state** that it is based on your own limited knowledge and **not** from "The Book".

---

**Context:**
${context}

---

**Question:**
${userQuery}

**Answer:**
`;
            } else {
                prompt = `
No relevant context was found from the book *"5th Edition of Cardiac Surgery in the Adult"*.

Start your answer with:
Does not seem to be related to our topic.

If you include any medical information, you must explicitly state that it is based on your own limited knowledge and **not** from "The Book".

---

**Question:**
${userQuery}

**Answer:**
`;
            }

            const response = await axios.post(`${ollamaApiBaseUrl}/api/generate`, {
                model: model,
                prompt: prompt,
                stream: false,
            });

            return response.data?.response?.trim() ?? 'No response from AI model.';
        } catch (error) {
            const axiosError = error as AxiosError;
            console.error('Error querying Ollama generate endpoint:', axiosError.message, axiosError.response?.data);
            return 'Failed to get a response from the AI model.';
        }
    }
}
