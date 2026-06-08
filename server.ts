import express from "express";
import path from "path";
import fs from "fs";
import mqtt from "mqtt";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Default configurations
const DEFAULT_BROKERS = [
  {
    server: "kingfisher.lmq.cloudamqp.com",
    port: 8883,
    user: "harvltis",
    pass: "jfOuozBlP2LGYTdWBByxJyFrpbAtO_56",
    client_id: "AMQPEsp",
    vhost: "harvltis"
  },
  {
    server: "mqtt.ably.io",
    port: 8883,
    user: "DiFTpw.Mpn-vg",
    pass: "ZIVYTCFuApMnENUYZcUmw83JUx3KJiClrsIwm3b3oH0",
    client_id: "AblyEsp",
    vhost: ""
  },
  {
    server: "pf-z3fj9bwmozmxa93e6k1e.cedalo.cloud",
    port: 8883,
    user: "web2",
    pass: "a",
    client_id: "webclient2",
    vhost: ""
  }
];

const DEFAULT_RELAY_LABELS = [
  "Relay 1 (Kipas)",
  "Relay 2 (Lampu)",
  "Relay 3 (Water Pump)",
  "Relay 4 (Sistem Utama)"
];

// Configuration persistence
const CONFIG_FILE = path.join(process.cwd(), "brokers-config.json");
let appConfig = {
  brokers: [...DEFAULT_BROKERS],
  relayLabels: [...DEFAULT_RELAY_LABELS]
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    appConfig = {
      brokers: parsed.brokers || [...DEFAULT_BROKERS],
      relayLabels: parsed.relayLabels || [...DEFAULT_RELAY_LABELS]
    };
  } catch (err) {
    console.error("Gagal membaca file konfigurasi, menggunakan default.", err);
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
}

// Global System State
let latestTemp: number | null = null;
let latestHum: number | null = null;
let relayStates = [false, false, false, false];
let variasiMode = 0; // 0: off, 1: variasi 1, 2: variasi 2
let activeBrokerIndexESP32 = 0; // reported from status/broker

// SSE clients list
let sseClients: any[] = [];

// Logs in memory
interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'mqtt_rx' | 'mqtt_tx';
  broker: string;
  topic?: string;
  payload?: string;
  message: string;
}
let logs: LogEntry[] = [];

function addLog(
  type: 'info' | 'success' | 'warning' | 'error' | 'mqtt_rx' | 'mqtt_tx',
  broker: string,
  message: string,
  topic?: string,
  payload?: string
) {
  const log: LogEntry = {
    id: Math.random().toString(36).substring(2, 9) + Date.now().toString().slice(-4),
    timestamp: new Date().toLocaleTimeString('id-ID', { hour12: false }),
    type,
    broker,
    topic,
    payload,
    message
  };
  
  logs.unshift(log);
  if (logs.length > 150) {
    logs.pop();
  }
  broadcastState();
}

// Broadcast to SSE clients
function broadcastState() {
  const statePayload = {
    temp: latestTemp,
    hum: latestHum,
    relayStates,
    variasiMode,
    activeBrokerIndexESP32,
    relayLabels: appConfig.relayLabels,
    brokers: appConfig.brokers.map((b, idx) => ({
      server: b.server,
      port: b.port,
      user: b.user,
      pass: b.pass,
      client_id: b.client_id,
      vhost: b.vhost
    })),
    brokerConnectionStates: mqttClients.map((client, idx) => ({
      index: idx,
      connected: client ? client.connected : false,
      connecting: client ? (!client.connected && !client.disconnected) : false
    })),
    logs: logs.slice(0, 80)
  };

  const dataString = `data: ${JSON.stringify(statePayload)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(dataString);
    } catch (e) {
      // client connection already closed, will be cleaned up
    }
  });
}

// MQTT Clients configuration
let mqttClients: (mqtt.MqttClient | null)[] = [null, null, null];

function initMqttConnections() {
  appConfig.brokers.forEach((cfg, index) => {
    connectToBroker(index, cfg);
  });
}

function connectToBroker(index: number, cfg: typeof DEFAULT_BROKERS[0]) {
  // End existing connection if any
  if (mqttClients[index]) {
    try {
      mqttClients[index]?.end(true);
    } catch (e) {
      console.error(`Gagal menutup koneksi Broker ${index + 1}`, e);
    }
    mqttClients[index] = null;
  }

  const brokerLabel = `Broker ${index + 1}`;
  if (!cfg.server || cfg.server.trim() === "") {
    addLog("warning", brokerLabel, "Konfigurasi server kosong. Silakan configure broker.");
    return;
  }

  addLog("info", brokerLabel, `Menghubungkan ke mqtts://${cfg.server}:${cfg.port}...`);

  const protocol = cfg.port === 8883 ? "mqtts" : "mqtt";
  const url = `${protocol}://${cfg.server}:${cfg.port}`;

  let connectionUsername = cfg.user;
  // If vhost is present, prepend vhost:username
  if (cfg.vhost && cfg.vhost.trim().length > 0) {
    connectionUsername = `${cfg.vhost}:${cfg.user}`;
  }

  const options: mqtt.IClientOptions = {
    clientId: cfg.client_id || `WebProxy_${Math.random().toString(36).substring(2, 8)}`,
    rejectUnauthorized: false, // Mirror ESP32 espClient.setInsecure()
    keepalive: 60,
    reconnectPeriod: 10005, // retry every 10s
    connectTimeout: 15000,
  };

  if (connectionUsername && connectionUsername.trim().length > 0) {
    options.username = connectionUsername;
  }
  if (cfg.pass && cfg.pass.trim().length > 0) {
    options.password = cfg.pass;
  }

  try {
    const client = mqtt.connect(url, options);
    mqttClients[index] = client;

    client.on("connect", () => {
      addLog("success", brokerLabel, `Terhubung ke broker ${cfg.server}:${cfg.port}`);
      
      // Subscribe to all important topics
      client.subscribe("sensor/suhu");
      client.subscribe("sensor/kelembaban");
      client.subscribe("status/broker");
      client.subscribe("kontrol/relay1");
      client.subscribe("kontrol/relay2");
      client.subscribe("kontrol/relay3");
      client.subscribe("kontrol/relay4");
      client.subscribe("kontrol/variasi");
      client.subscribe("kontrol/broker");

      broadcastState();
    });

    client.on("reconnect", () => {
      addLog("info", brokerLabel, `Mencoba menghubungkan ulang ke ${cfg.server}:${cfg.port}...`);
    });

    client.on("close", () => {
      addLog("warning", brokerLabel, `Koneksi ke broker ditutup atau terputus.`);
      broadcastState();
    });

    client.on("offline", () => {
      addLog("warning", brokerLabel, `Broker lari ke mode offline.`);
      broadcastState();
    });

    client.on("error", (err) => {
      addLog("error", brokerLabel, `Kesalahan koneksi: ${err.message}`);
      broadcastState();
    });

    client.on("message", (topic, payloadBuffer) => {
      const payloadString = payloadBuffer.toString().trim();
      handleIncomingMqttMessage(index, topic, payloadString);
    });

  } catch (err: any) {
    addLog("error", brokerLabel, `Inisialisasi koneksi gagal: ${err.message}`);
  }
}

function handleIncomingMqttMessage(brokerIdx: number, topic: string, payload: string) {
  const brokerName = `Broker ${brokerIdx + 1}`;
  
  if (topic === "sensor/suhu") {
    const v = parseFloat(payload);
    if (!isNaN(v)) latestTemp = v;
    addLog("mqtt_rx", brokerName, `Suhu terperbarui: ${payload}°C`, topic, payload);
  } 
  else if (topic === "sensor/kelembaban") {
    const v = parseFloat(payload);
    if (!isNaN(v)) latestHum = v;
    addLog("mqtt_rx", brokerName, `Kelembaban terperbarui: ${payload}%`, topic, payload);
  } 
  else if (topic === "status/broker") {
    // Expected format: BROKER:1|kingfisher.lmq.cloudamqp.com
    const match = payload.match(/BROKER:(\d+)/i);
    if (match) {
      activeBrokerIndexESP32 = parseInt(match[1]) - 1;
    }
    addLog("mqtt_rx", brokerName, `Status ESP32 diterima: ${payload}`, topic, payload);
  } 
  else if (topic.startsWith("kontrol/relay")) {
    const idx = parseInt(topic.replace("kontrol/relay", "")) - 1;
    if (idx >= 0 && idx < 4) {
      relayStates[idx] = (payload === "ON");
      addLog("mqtt_rx", brokerName, `Pesan relay ${idx + 1}: ${payload}`, topic, payload);
    }
  } 
  else if (topic === "kontrol/variasi") {
    if (payload === "STOP") {
      variasiMode = 0;
    } else {
      const v = parseInt(payload);
      if (v === 1 || v === 2) variasiMode = v;
    }
    addLog("mqtt_rx", brokerName, `Pesan variasi: ${payload}`, topic, payload);
  }
  else if (topic === "kontrol/broker") {
    addLog("mqtt_rx", brokerName, `Perpindahan broker terdeteksi: ${payload}`, topic, payload);
  }
}

function publishMessage(topic: string, message: string) {
  let matchedPublishCount = 0;
  mqttClients.forEach((client, idx) => {
    if (client && client.connected) {
      client.publish(topic, message, { qos: 1 });
      addLog("mqtt_tx", `Broker ${idx + 1}`, `Kirim [${topic}] => ${message}`, topic, message);
      matchedPublishCount++;
    }
  });

  if (matchedPublishCount === 0) {
    addLog("warning", "Sistem", `Mencoba kirim [${topic}:${message}] tapi tidak ada broker terhubung!`);
  }
}

// Core API endpoints
app.get("/api/state", (req, res) => {
  res.json({
    temp: latestTemp,
    hum: latestHum,
    relayStates,
    variasiMode,
    activeBrokerIndexESP32,
    relayLabels: appConfig.relayLabels,
    brokers: appConfig.brokers.map((b, idx) => ({
      server: b.server,
      port: b.port,
      user: b.user,
      pass: b.pass,
      client_id: b.client_id,
      vhost: b.vhost
    })),
    brokerConnectionStates: mqttClients.map((client, idx) => ({
      index: idx,
      connected: client ? client.connected : false,
      connecting: client ? (!client.connected && !client.disconnected) : false
    })),
    logs: logs.slice(0, 80)
  });
});

// SSE Stream Endpoint
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  // Send initial state immediately
  const statePayload = {
    temp: latestTemp,
    hum: latestHum,
    relayStates,
    variasiMode,
    activeBrokerIndexESP32,
    relayLabels: appConfig.relayLabels,
    brokers: appConfig.brokers.map((b, idx) => ({
      server: b.server,
      port: b.port,
      user: b.user,
      pass: b.pass,
      client_id: b.client_id,
      vhost: b.vhost
    })),
    brokerConnectionStates: mqttClients.map((client, idx) => ({
      index: idx,
      connected: client ? client.connected : false,
      connecting: client ? (!client.connected && !client.disconnected) : false
    })),
    logs: logs.slice(0, 80)
  };
  res.write(`data: ${JSON.stringify(statePayload)}\n\n`);

  req.on("close", () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Toggle or Control Relay
app.post("/api/relay", (req, res) => {
  const { index, state } = req.body;
  if (typeof index !== "number" || index < 0 || index > 3 || (state !== "ON" && state !== "OFF")) {
    return res.status(400).json({ error: "Argumen tidak valid" });
  }

  // If in variation mode, tell user they must stop first (to mirror ESP32 logic callback()!)
  // Or publish "STOP" first, or just publish direct and let ESP32 handle it
  // In ESP32, if variasiMode != 0, it ignores manual commands. Let's warn the user in UI!
  if (variasiMode !== 0) {
    publishMessage("kontrol/variasi", "STOP");
    variasiMode = 0;
  }

  relayStates[index] = (state === "ON");
  publishMessage(`kontrol/relay${index + 1}`, state);
  res.json({ success: true, relayStates });
});

// Turn All Relays ON/OFF
app.post("/api/relay/all", (req, res) => {
  const { state } = req.body;
  if (state !== "ON" && state !== "OFF") {
    return res.status(400).json({ error: "Membawa state harus ON atau OFF" });
  }

  if (variasiMode !== 0) {
    publishMessage("kontrol/variasi", "STOP");
    variasiMode = 0;
  }

  addLog("info", "Sistem", `Mengendalikan SEMUA relay ke: ${state}`);
  for (let i = 0; i < 4; i++) {
    relayStates[i] = (state === "ON");
    publishMessage(`kontrol/relay${i + 1}`, state);
  }
  res.json({ success: true, relayStates });
});

// Set Variasi mode
app.post("/api/variasi", (req, res) => {
  const { mode } = req.body; // "1", "2", "STOP"
  if (mode !== "1" && mode !== "2" && mode !== "STOP") {
    return res.status(400).json({ error: "Sintaks mode tidak dikenal" });
  }

  if (mode === "STOP") {
    variasiMode = 0;
  } else {
    variasiMode = parseInt(mode);
  }

  publishMessage("kontrol/variasi", mode);
  res.json({ success: true, variasiMode });
});

// Switch ESP32 Broker Shortcut
app.post("/api/switch-broker", (req, res) => {
  const { index } = req.body; // 0, 1, 2
  if (typeof index !== "number" || index < 0 || index > 2) {
    return res.status(400).json({ error: "Indeks broker tidak valid" });
  }

  // ESP32 subscribes to kontrol/broker and listens for "1", "2", "3" (1-based index)
  const espPayload = String(index + 1);
  activeBrokerIndexESP32 = index; // Update local state so UI is immediately in-sync and does not snap back!
  publishMessage("kontrol/broker", espPayload);
  addLog("info", "Sistem", `Mengirim perintah perpindahan broker ke ESP32 ke Broker ${index + 1}`);
  res.json({ success: true, activeBrokerIndexESP32: index });
});

// Save Broker Configuration with Persistence
app.post("/api/config", (req, res) => {
  const { brokers, relayLabels } = req.body;

  if (brokers && Array.isArray(brokers)) {
    // Validate and limit
    brokers.forEach((b, idx) => {
      if (idx < 3) {
        appConfig.brokers[idx] = {
          server: b.server || "",
          port: Number(b.port) || 8883,
          user: b.user || "",
          pass: b.pass || "",
          client_id: b.client_id || `WebProxy_${idx}`,
          vhost: b.vhost || ""
        };
      }
    });
  }

  if (relayLabels && Array.isArray(relayLabels)) {
    relayLabels.forEach((label, idx) => {
      if (idx < 4 && typeof label === "string") {
        appConfig.relayLabels[idx] = label;
      }
    });
  }

  // Save to file
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    addLog("success", "Sistem", "Konfigurasi berhasil disimpan dan disimpan!");
    
    // Reinitialize only the modified connections
    initMqttConnections();
    res.json({ success: true, config: appConfig });
  } catch (err: any) {
    addLog("error", "Sistem", `Gagal menyimpan konfigurasi: ${err.message}`);
    res.status(500).json({ error: "Gagal menyimpan konfigurasi" });
  }
});

// Smart AI Voice parsing using Gemini
app.post("/api/gemini/parse-voice", async (req, res) => {
  const { transcript } = req.body;
  if (!transcript || typeof transcript !== "string") {
    return res.status(400).json({ error: "Suara kosong atau tidak terbaca" });
  }

  addLog("info", "Suara", `Menerima perintah suara: "${transcript}"`);

  // Prompt layout for Gemini to parse semantic meanings in context of 4 relays and 2 variations
  const prompt = `Lakukan parsing pada perintah suara pengguna berikut ini dan translasikan ke format aksi IoT untuk alat controller 4 relay dan 2 tipe variasi otomatis.
  Labels Relay Saat Ini:
  1. ${appConfig.relayLabels[0]}
  2. ${appConfig.relayLabels[1]}
  3. ${appConfig.relayLabels[2]}
  4. ${appConfig.relayLabels[3]}

  Perintah Suara Pengguna: "${transcript}"

  Instruksi Parsing:
  Identifikasi apakah ini mengontrol relay individual, mengontrol semua relay, memicu variasi atau stop variasi, atau berpindah broker.
  Format Output harus berupa objek JSON dengan struktur:
  {
    "matched": boolean (apakah perintah dapat dipahami),
    "action": "relay" | "relay_all" | "variasi" | "switch_broker" | "unknown",
    "params": {
      "index": number (0-3 untuk relay, 0-2 untuk broker),
      "state": "ON" | "OFF" (untuk relay/relay_all),
      "mode": "1" | "2" | "STOP" (untuk variasi)
    },
    "explanation": "Penjelasan singkat dalam bahasa Indonesia yang ramah"
  }
  Hanya berikan respons JSON yang valid tanpa markdown code block.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matched: { type: Type.BOOLEAN },
            action: { type: Type.STRING, description: "Aksi terdeteksi" },
            params: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER },
                state: { type: Type.STRING },
                mode: { type: Type.STRING }
              }
            },
            explanation: { type: Type.STRING }
          },
          required: ["matched", "action", "explanation"]
        }
      }
    });

    const resultText = response.text || "{}";
    const result = JSON.parse(resultText.trim());

    if (result.matched) {
      addLog("success", "Suara", `Aksi terpahami: ${result.explanation}`);
    } else {
      addLog("warning", "Suara", `Tidak dapat memahami arti dari: "${transcript}"`);
    }

    res.json(result);
  } catch (err: any) {
    console.error("Gagal memanggil Gemini API:", err);
    res.json({
      matched: false,
      action: "unknown",
      explanation: "Gagal menghubungkan ke asisten pintar, silakan coba lagi."
    });
  }
});


// Start MQTT Connections on boot up
initMqttConnections();


// Integration with Vite
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OK] Server running on http://localhost:${PORT}`);
  });
}

startServer();
