import { influxRequest } from "../utils/influxClient.js";
import { INFLUXDB_URL } from "../config/env.js";

// Tool: Health Check
export async function healthCheck() {
  try {
    const start = Date.now();

    // Try to ping the InfluxDB instance
    const response = await influxRequest("/ping");
    const duration = Date.now() - start;

    const headers = Object.fromEntries(response.headers.entries());
    const version = headers["x-influxdb-version"] || "Unknown";
    const build = headers["x-influxdb-build"] || "Unknown";

    return {
      content: [{
        type: "text",
        text: `✅ InfluxDB Health Check - HEALTHY

📍 URL: ${INFLUXDB_URL}
⚡ Response Time: ${duration}ms
📦 Version: ${version}
🔨 Build: ${build}
🕐 Timestamp: ${new Date().toISOString()}

Status: Connection successful, server is responding normally.`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ InfluxDB Health Check - UNHEALTHY

📍 URL: ${INFLUXDB_URL}
🚨 Error: ${error.message}
🕐 Timestamp: ${new Date().toISOString()}

Status: Unable to connect to InfluxDB server. Please check:
- InfluxDB server is running
- URL and port are correct
- Network connectivity
- Authentication token is valid`
      }],
      isError: true
    };
  }
}