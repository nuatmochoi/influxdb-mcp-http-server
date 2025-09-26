import { influxRequest } from "../utils/influxClient.js";

// Tool: Get Measurement Schema
export async function getMeasurementSchema({ org, bucket, measurement }) {
  try {
    // Get field keys for the measurement
    const fieldKeysQuery = `
      import "schema"
      schema.measurementFieldKeys(
        bucket: "${bucket}",
        measurement: "${measurement}",
        start: -30d
      )
    `;

    // Get tag keys for the measurement
    const tagKeysQuery = `
      import "schema"
      schema.measurementTagKeys(
        bucket: "${bucket}",
        measurement: "${measurement}",
        start: -30d
      )
    `;

    // Execute both queries
    const [fieldResponse, tagResponse] = await Promise.all([
      influxRequest(`/api/v2/query?org=${encodeURIComponent(org)}`, {
        method: "POST",
        body: JSON.stringify({ query: fieldKeysQuery, type: "flux" }),
      }),
      influxRequest(`/api/v2/query?org=${encodeURIComponent(org)}`, {
        method: "POST",
        body: JSON.stringify({ query: tagKeysQuery, type: "flux" }),
      })
    ]);

    const fieldText = await fieldResponse.text();
    const tagText = await tagResponse.text();

    // Parse CSV responses
    const parseKeys = (csvText) => {
      const lines = csvText.split('\n').filter(line => line.trim());
      const keys = [];
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',');
        if (columns.length >= 2 && columns[1]) {
          const key = columns[1].trim();
          if (key && !keys.includes(key)) {
            keys.push(key);
          }
        }
      }
      return keys;
    };

    const fieldKeys = parseKeys(fieldText);
    const tagKeys = parseKeys(tagText);

    return {
      content: [{
        type: "text",
        text: `📊 Schema for measurement "${measurement}" in bucket "${bucket}":

🏷️  **Tag Keys** (indexed, for filtering):
${tagKeys.length > 0 ? tagKeys.map(key => `   • ${key}`).join('\n') : '   (No tag keys found)'}

📈 **Field Keys** (values, for aggregation):
${fieldKeys.length > 0 ? fieldKeys.map(key => `   • ${key}`).join('\n') : '   (No field keys found)'}

💡 **Usage Tips:**
• Use tag keys in WHERE clauses for efficient filtering
• Use field keys for mathematical operations and aggregations
• Tags are always strings, fields can be numbers, strings, or booleans

🔍 **Example Query:**
from(bucket: "${bucket}")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "${measurement}")${tagKeys.length > 0 ? `
  |> filter(fn: (r) => r.${tagKeys[0]} == "your_value")` : ''}${fieldKeys.length > 0 ? `
  |> filter(fn: (r) => r._field == "${fieldKeys[0]}")` : ''}`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting measurement schema: ${error.message}`
      }],
      isError: true
    };
  }
}