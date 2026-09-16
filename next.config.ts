import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "gray-matter",
    "@huggingface/transformers",
    "onnxruntime-node",
    "sharp",
    "pdf-parse",
    "mammoth",
  ],
};

export default nextConfig;
