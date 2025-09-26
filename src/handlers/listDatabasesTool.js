import { influxRequest } from "../utils/influxClient.js";

// Tool: List Databases
export async function listDatabases() {
  try {
    const response = await influxRequest("/api/v2/buckets");
    const data = await response.json();

    if (data.buckets) {
      const bucketList = data.buckets.map(bucket => ({
        name: bucket.name,
        id: bucket.id,
        orgID: bucket.orgID,
        retentionPeriod: bucket.retentionRules?.[0]?.everySeconds || "infinite",
        createdAt: bucket.createdAt,
        updatedAt: bucket.updatedAt
      }));

      return {
        content: [{
          type: "text",
          text: `Found ${bucketList.length} buckets:\n\n${bucketList.map(bucket =>
            `• ${bucket.name} (ID: ${bucket.id})\n  Organization: ${bucket.orgID}\n  Retention: ${bucket.retentionPeriod === "infinite" ? "Infinite" : bucket.retentionPeriod + " seconds"}\n  Created: ${bucket.createdAt}`
          ).join('\n\n')}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: "No buckets found"
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error listing databases: ${error.message}`
      }],
      isError: true
    };
  }
}