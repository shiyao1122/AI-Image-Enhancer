import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import Replicate from "replicate";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;

const scheduleJobCleanup = (jobId) => {
  const timer = setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);
  if (typeof timer.unref === "function") timer.unref();
};

// Health check
app.get("/", (req, res) => {
  res.send("AI Image Enhance MCP server is running on Render.");
});

// Image enhancement endpoint
app.post("/enhance", (req, res) => {
  const { image_url, scale = 2, face_enhance = true } = req.body || {};
  if (!image_url) return res.status(400).json({ error: "Missing image_url" });

  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  const input = { image: image_url, scale, face_enhance };

  jobs.set(jobId, {
    status: "processing",
    input_image: image_url,
    created_at: createdAt,
  });

  const pollUrl = `${req.protocol}://${req.get("host")}/enhance/${jobId}`;

  res.status(202).json({
    job_id: jobId,
    status: "processing",
    input_image: image_url,
    created_at: createdAt,
    poll_url: pollUrl,
  });

  (async () => {
    try {
      console.log("[enhance] Running enhancement on:", image_url);
      const output = await replicate.run("nightmareai/real-esrgan", { input });
      console.log("[enhance] Output:", output);

      const enhancedImage = Array.isArray(output)
        ? output[0]
        : output?.url ?? output;

      if (!enhancedImage) {
        throw new Error("Model returned empty output");
      }

      const completedAt = new Date().toISOString();

      jobs.set(jobId, {
        status: "success",
        input_image: image_url,
        enhanced_image: enhancedImage,
        created_at: createdAt,
        completed_at: completedAt,
      });
      scheduleJobCleanup(jobId);
    } catch (error) {
      console.error("[enhance] Enhancement error:", error);
      const completedAt = new Date().toISOString();

      jobs.set(jobId, {
        status: "failed",
        input_image: image_url,
        error: error?.message || "Enhancement failed",
        created_at: createdAt,
        completed_at: completedAt,
      });
      scheduleJobCleanup(jobId);
    }
  })();
});

app.get("/enhance/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({
    job_id: jobId,
    status: job.status,
    input_image: job.input_image,
    enhanced_image: job.enhanced_image,
    error: job.error,
    created_at: job.created_at,
    completed_at: job.completed_at,
  });
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

// Serve plugin manifest
app.head("/.well-known/ai-plugin.json", withHeadResponse(pluginManifest));
app.get("/.well-known/ai-plugin.json", withGetResponse(pluginManifest));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
