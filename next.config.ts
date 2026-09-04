import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const dependencyRoot = existsSync(path.join(projectRoot, "node_modules", "next"))
  ? projectRoot
  : path.resolve(projectRoot, "../..");

const nextConfig: NextConfig = {
  // The local checkout keeps shared dependencies two levels above `release`.
  // Vercel installs them inside the project, so this resolves to projectRoot there.
  turbopack: { root: dependencyRoot },
  outputFileTracingRoot: dependencyRoot,
};

export default nextConfig;
