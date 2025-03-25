const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173"], // Frontend local por ahora
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json()); // Para parsear JSON en futuras rutas

// Conexión a MongoDB (usaremos MongoDB Atlas o local)
// const mongoURI = "mongodb://localhost:27017/mini-x"; // Cambia si usas Atlas
const mongoURI = "mongodb+srv://rfmai46:WY6v35ewDTEMvETQ@cluster0.cphw1.mongodb.net/mini-x?retryWrites=true&w=majority"
// useNewUrlParser: true, useUnifiedTopology: true
mongoose
  .connect(mongoURI, {})
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB:", err));

// Modelo de Tuit
const tuitSchema = new mongoose.Schema({
  nickname: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Tuit = mongoose.model("Tuit", tuitSchema);

// Ruta básica para probar el servidor
app.get("/", (req, res) => {
  res.send("¡Mini-X API funcionando!");
});

// Lógica de WebSockets
io.on("connection", async (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Enviar los últimos 10 tuits al conectar
  
  try {
    // Enviar los últimos 10 tuits al conectar
    const initialTuits = await Tuit.find().sort({ timestamp: -1 }).limit(10);
    console.log("Enviando tuits iniciales:", initialTuits.length, "tuits");
    socket.emit("initialTuits", initialTuits);
  } catch (err) {
    console.error("Error al cargar tuits iniciales:", err);
  }

/*   const initialTuits = await Tuit.find().sort({ timestamp: -1 }).limit(10);
  socket.emit("initialTuits", initialTuits); */

  // Recibir nuevos tuits del cliente
  socket.on("newTuit", async (data) => {
    const { nickname, text } = data;
    console.log("Tuit recibido:", text, "de", nickname);
    const tuit = new Tuit({ nickname, text });
    await tuit.save(); // Guardar en MongoDB
    io.emit("tuit", tuit); // Enviar a todos los clientes
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

// Bots simulados (prueba inicial)
const botNicknames = ["Bot1", "Bot2", "Bot3", "Bot4", "Bot5"];
const botMessages = [
  "¡Qué día tan bonito!",
  "Acabo de ver una película genial.",
  "Noticias frescas por aquí.",
  "Hora de un café.",
  "Pensando en voz alta...",
];

function postBotTuit() {
  const nickname = botNicknames[Math.floor(Math.random() * botNicknames.length)];
  const text = botMessages[Math.floor(Math.random() * botMessages.length)];
  const tuit = new Tuit({ nickname, text });
  tuit.save().then(() => {
    io.emit("tuit", tuit); // Enviar a todos los clientes
    console.log("Bot tuit publicado:", text, "de", nickname);
  });
}

// Publicar un tuit de bot cada 30 segundos (ajustable)
setInterval(postBotTuit, 30000);

// Iniciar el servidor
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});