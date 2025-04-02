require('dotenv').config()

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "https://mini-x-app.netlify.app"],
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const mongoURI = process.env.MONGO_URI;

mongoose
  .connect(mongoURI, {})
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => console.error("Error al conectar a MongoDB:", err));

const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const tuitSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});
const Tuit = mongoose.model("Tuit", tuitSchema);

const connectedUsers = new Map();

// Cargar o crear bots al iniciar
async function loadBots() {
  const botNicknames = ["Bot1", "Bot2", "Bot3", "Bot4", "Bot5"];
  const botIds = [];
  for (const nickname of botNicknames) {
    let user = await User.findOne({ nickname });
    if (!user) {
      user = new User({ nickname });
      await user.save();
      console.log(`Bot registrado: ${nickname}`);
    }
    botIds.push(user._id.toString());
  }
  return botIds;
}

let botIds = [];
// Ejecutar al iniciar (no limpiar, solo cargar bots)
loadBots().then((ids) => {
  botIds = ids;
  console.log("Bots cargados:", botIds);
}).catch((err) => console.error("Error cargando bots:", err));

// Script para limpiar (comentar tras primera ejecución)
// async function initializeDatabase() {
//   await Tuit.deleteMany({});
//   console.log("Colección 'tuits' limpiada");
//   await User.deleteMany({});
//   console.log("Colección 'users' limpiada");
//   botIds = await loadBots();
// }
// initializeDatabase();

io.on("connection", async (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("login", async (nickname, callback) => {
    if (!nickname || typeof nickname !== "string" || nickname.trim() === "") {
      return callback({ success: false, message: "Nickname inválido" });
    }
    const trimmedNickname = nickname.trim();
    try {
      let user = await User.findOne({ nickname: trimmedNickname });
      if (!user) {
        user = new User({ nickname: trimmedNickname });
        await user.save();
      }
      if (Array.from(connectedUsers.values()).includes(user._id.toString())) {
        return callback({ success: false, message: "Nickname ya en uso" });
      }
      connectedUsers.set(socket.id, user._id.toString());
      callback({ success: true, nickname: user.nickname });
      const initialTuits = await Tuit.find()
        .populate("user", "nickname")
        .sort({ timestamp: -1 })
        .limit(5);
      socket.emit("initialTuits", initialTuits);
    } catch (err) {
      callback({ success: false, message: "Error en el servidor" });
    }
  });

  socket.on("newTuit", async (data) => {
    const userId = connectedUsers.get(socket.id);
    if (!userId) return;
    const { text } = data;
    const user = await User.findById(userId);
    if (!user) return;
    const tuit = new Tuit({ user: userId, text });
    await tuit.save();
    const populatedTuit = await Tuit.findById(tuit._id).populate("user", "nickname");
    socket.emit("tuit", populatedTuit);
    socket.broadcast.emit("newTuitAvailable", populatedTuit);
  });

  socket.on("loadNewTuits", async (data) => {
    const { lastTimestamp } = data;
    const newTuits = await Tuit.find({ timestamp: { $gt: lastTimestamp } })
      .populate("user", "nickname")
      .sort({ timestamp: -1 });
    socket.emit("newTuits", newTuits);
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
    console.log("Usuario desconectado:", socket.id);
  });
});

const botMessages = [
  "¡Qué día tan bonito!",
  "Acabo de ver una película genial.",
  "Noticias frescas: el clima mejora.",
  "Hora de un café, ¿alguien se apunta?",
  "Pensando en voz alta sobre el universo...",
];
async function postBotTuit() {
  if (botIds.length === 0) return; // Evitar errores si bots no cargaron
  const randomBotId = botIds[Math.floor(Math.random() * botIds.length)];
  const text = botMessages[Math.floor(Math.random() * botMessages.length)];
  const tuit = new Tuit({ user: randomBotId, text });
  await tuit.save();
  const populatedTuit = await Tuit.findById(tuit._id).populate("user", "nickname");
  io.emit("newTuitAvailable", populatedTuit);
}
setInterval(postBotTuit, 10000);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});