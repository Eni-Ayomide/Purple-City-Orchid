import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const app = createApp();
const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT, host: "0.0.0.0" }, "API server listening");
});

function shutDown(signal: string) {
  logger.info({ signal }, "Shutting down API server");
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutDown("SIGINT"));
process.once("SIGTERM", () => shutDown("SIGTERM"));
