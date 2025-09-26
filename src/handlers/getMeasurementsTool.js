import { influxRequest } from "../utils/influxClient.js";

// Tool: Get Measurements
export async function getMeasurements({ org, bucket }) {
  try {
    // Use a simple query to get all measurements from the bucket
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> group(columns: ["_measurement"])
        |> distinct(column: "_measurement")
        |> keep(columns: ["_measurement"])
        |> sort(columns: ["_measurement"])
    `;

    const response = await influxRequest(
      `/api/v2/query?org=${encodeURIComponent(org)}`,
      {
        method: "POST",
        body: JSON.stringify({ query: fluxQuery, type: "flux" }),
      },
    );

    const responseText = await response.text();

    // Parse CSV response to extract measurement names
    const lines = responseText.split('\n').filter(line => line.trim());
    const measurements = [];

    // Skip headers and parse data rows
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns.length >= 4 && columns[3]) {
        const measurement = columns[3].trim();
        if (measurement && !measurements.includes(measurement)) {
          measurements.push(measurement);
        }
      }
    }

    if (measurements.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No measurements found in bucket "${bucket}" for the last 30 days.\n\nThis could mean:\n• The bucket is empty\n• No data in the last 30 days\n• Different time range needed`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `Found ${measurements.length} measurement(s) in bucket "${bucket}":\n\n${measurements.map(m => `• ${m}`).join('\n')}\n\n💡 Use query-data tool with these measurement names to explore the data further.`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting measurements: ${error.message}`
      }],
      isError: true
    };
  }
}