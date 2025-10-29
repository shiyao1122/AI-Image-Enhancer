import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Replicate from "replicate";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化 Replicate
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// 获取当前文件路径（Render 会从容器根目录运行）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// OpenAPI 文件路由
app.get("/openapi.json", (req, res) => {
  const openapiPath = path.join(__dirname, "openapi.json");
  res.sendFile(openapiPath, (err) => {
    if (err) {
      console.error("❌ Error sending openapi.json:", err);
      res.status(500).send("Cannot read openapi.json");
    }
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
