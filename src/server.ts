import dotenv from 'dotenv';
import express from "express";
import helmet from "helmet";

dotenv.config();
export const server = express();

server.use(helmet());
server.use(express.json());
server.disable('x-powered-by');

server.get('*', (req, res) => {
    res.status(404).json({
        message: 'Not Found'
    });
});

server.listen(process.env.PORT,  () => {
    console.log(Date() + ` - Server started on port ${process.env.PORT}`);
})
