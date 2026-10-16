export function getHealthStatus() {
  return {
    status: "ok" as const,
    service: "purple-hearts-api",
    timestamp: new Date().toISOString(),
  };
}
