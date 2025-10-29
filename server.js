import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import Replicate from "replicate";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化 Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 健康检查路由
app.get("/", (req, res) => {
  res.send("✅ Image Enhance MCP server is running on Render.");
});

// 图像增强接口
app.post("/enhance", async (req, res) => {
  try {
    const { image_url, scale = 2, face_enhance = true } = req.body;
    if (!image_url) return res.status(400).json({ error: "Missing image_url" });

    const input = { image: image_url, scale, face_enhance };
    console.log("🔹 Running enhancement on:", image_url);

    const output = await replicate.run("nightmareai/real-esrgan", { input });
    console.log("🔹 Output:", output);

    const enhancedImage = output?.url ? output.url() : output;

    res.json({
      input_image: image_url,
      enhanced_image: enhancedImage,
      status: "success",
    });
  } catch (error) {
    console.error("❌ Enhancement error:", error);
    res.status(500).json({ error: error.message || "Enhancement failed" });
  }
});

const openApiDocument = readFileSync(
  new URL("./openapi.json", import.meta.url),
  "utf-8"
);
const pluginManifest = readFileSync(
  new URL("./ai-plugin.json", import.meta.url),
  "utf-8"
);

const withHeadResponse = (payload) => (req, res) => {
  res
    .status(200)
    .set("Content-Type", "application/json")
    .set("Content-Length", Buffer.byteLength(payload, "utf-8"))
    .end();
};

const withGetResponse = (payload) => (req, res) => {
  res.type("application/json").send(payload);
};

app.head("/openapi.json", withHeadResponse(openApiDocument));
app.get("/openapi.json", withGetResponse(openApiDocument));

// === Serve plugin manifest ===
app.head("/.well-known/ai-plugin.json", withHeadResponse(pluginManifest));
app.get("/.well-known/ai-plugin.json", withGetResponse(pluginManifest));

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
