import { influxRequest } from "../utils/influxClient.js";

// Tool: Get Tag Values
export async function getTagValues({ org, bucket, tagKey, measurement }) {
  try {
    // Build the Flux query to get tag values
    let fluxQuery;

    if (measurement) {
      // Get tag values for a specific measurement
      fluxQuery = `
        import "schema"
        schema.tagValues(
          bucket: "${bucket}",
          tag: "${tagKey}",
          predicate: (r) => r._measurement == "${measurement}",
          start: -30d
        )
      `;
    } else {
      // Get tag values across all measurements
      fluxQuery = `
        import "schema"
        schema.tagValues(
          bucket: "${bucket}",
          tag: "${tagKey}",
          start: -30d
        )
      `;
    }

    const response = await influxRequest(
      `/api/v2/query?org=${encodeURIComponent(org)}`,
      {
        method: "POST",
        body: JSON.stringify({ query: fluxQuery, type: "flux" }),
      },
    );

    const responseText = await response.text();

    // Parse CSV response to extract tag values
    const lines = responseText.split('\n').filter(line => line.trim());
    const values = [];

    // Skip headers and parse data rows
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns.length >= 2 && columns[1]) {
        const value = columns[1].trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^"|"$/g, '');
        if (cleanValue && !values.includes(cleanValue)) {
          values.push(cleanValue);
        }
      }
    }

    if (values.length === 0) {
      const context = measurement ? ` for measurement "${measurement}"` : '';
      return {
        content: [{
          type: "text",
          text: `No values found for tag "${tagKey}"${context} in bucket "${bucket}".\n\n💡 This could mean:\n• Tag key doesn't exist\n• No data in the last 30 days\n• Tag key is misspelled\n\nUse get-measurements tool to see available measurements.`
        }]
      };
    }

    values.sort(); // Sort alphabetically

    const context = measurement ? ` for measurement "${measurement}"` : ' (across all measurements)';
    const exampleFilter = measurement
      ? `filter(fn: (r) => r._measurement == "${measurement}" and r.${tagKey} == "${values[0]}")`
      : `filter(fn: (r) => r.${tagKey} == "${values[0]}")`;

    return {
      content: [{
        type: "text",
        text: `🏷️ **Tag Values for "${tagKey}"${context}:**

Found ${values.length} unique value${values.length > 1 ? 's' : ''}:

${values.slice(0, 50).map((value, index) => `${index + 1}. ${value}`).join('\n')}${values.length > 50 ? `\n... and ${values.length - 50} more values` : ''}

💡 **Usage Example:**
\`\`\`flux
from(bucket: "${bucket}")
  |> range(start: -1h)
  |> ${exampleFilter}
\`\`\`

🔍 **Filter Tips:**
• Use these values in filter() functions for precise data selection
• Tag values are always strings in InfluxDB
• Multiple values can be used with OR conditions`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting tag values: ${error.message}`
      }],
      isError: true
    };
  }
}