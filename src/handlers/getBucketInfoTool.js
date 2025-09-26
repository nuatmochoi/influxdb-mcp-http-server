import { influxRequest } from "../utils/influxClient.js";

// Tool: Get Bucket Info
export async function getBucketInfo({ bucketName, org }) {
  try {
    // First, get all buckets to find the one we want
    const response = await influxRequest("/api/v2/buckets");
    const data = await response.json();

    if (!data.buckets) {
      return {
        content: [{
          type: "text",
          text: "No buckets found"
        }],
        isError: true
      };
    }

    const bucket = data.buckets.find(b => b.name === bucketName);

    if (!bucket) {
      const availableBuckets = data.buckets.map(b => b.name).join(', ');
      return {
        content: [{
          type: "text",
          text: `Bucket "${bucketName}" not found.\n\nAvailable buckets: ${availableBuckets}`
        }],
        isError: true
      };
    }

    // Get additional statistics with a query
    const statsQuery = `
      from(bucket: "${bucketName}")
        |> range(start: -30d)
        |> group()
        |> count()
    `;

    let dataPointCount = "Unknown";
    try {
      const statsResponse = await influxRequest(`/api/v2/query?org=${encodeURIComponent(org)}`, {
        method: "POST",
        body: JSON.stringify({ query: statsQuery, type: "flux" }),
      });
      const statsText = await statsResponse.text();
      const lines = statsText.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        const lastLine = lines[lines.length - 2]; // Second to last line usually has the data
        const columns = lastLine.split(',');
        if (columns.length >= 4) {
          dataPointCount = columns[3] || "0";
        }
      }
    } catch (statsError) {
      dataPointCount = "Unable to calculate";
    }

    // Format retention period
    const formatRetention = (retentionRules) => {
      if (!retentionRules || retentionRules.length === 0) {
        return "Infinite (no automatic deletion)";
      }

      const rule = retentionRules[0];
      if (rule.type === "expire" && rule.everySeconds) {
        const seconds = rule.everySeconds;
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);

        if (days > 0) {
          return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours}h` : ''}`;
        } else if (hours > 0) {
          return `${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
          return `${seconds} seconds`;
        }
      }
      return "Custom retention policy";
    };

    return {
      content: [{
        type: "text",
        text: `🪣 **Bucket Information: "${bucket.name}"**

📋 **Basic Details:**
   • ID: ${bucket.id}
   • Organization ID: ${bucket.orgID}
   • Type: ${bucket.type || 'user'}

🕐 **Timestamps:**
   • Created: ${new Date(bucket.createdAt).toLocaleString()}
   • Updated: ${new Date(bucket.updatedAt).toLocaleString()}

⏰ **Retention Policy:**
   • ${formatRetention(bucket.retentionRules)}

📊 **Data Statistics (last 30 days):**
   • Data Points: ${dataPointCount}

🔧 **Configuration:**
   • Schema Type: ${bucket.schemaType || 'implicit'}
   • Replicas: ${bucket.replicationFactor || 1}

${bucket.description ? `📝 **Description:**
   • ${bucket.description}` : ''}

💡 **Quick Actions:**
   • List measurements: Use get-measurements tool
   • Query data: Use query-data tool
   • Write data: Use write-data tool`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error getting bucket info: ${error.message}`
      }],
      isError: true
    };
  }
}