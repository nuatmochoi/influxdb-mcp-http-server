# InfluxDB MCP Server Integration Tests

This directory contains a comprehensive integration test suite for the InfluxDB MCP Server. The tests verify that the server correctly interacts with an InfluxDB instance and exposes all the functionality through the Model Context Protocol.

## Prerequisites

- Node.js 16 or higher
- Docker (for running InfluxDB during tests)
- npm or yarn

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Make sure Docker is running on your system

## Running Tests

To run the integration tests:

```
npm test
```

## What the Tests Cover

The test suite:

1. Starts an InfluxDB 2.7 container in Docker
2. Initializes the database with an organization, bucket, and authentication token
3. Starts the InfluxDB MCP Server
4. Connects an MCP client to the server
5. Tests all MCP server functionality:
   - Writing data to InfluxDB
   - Listing organizations and buckets
   - Querying measurements in a bucket
   - Using the write-data and query-data tools
   - Creating new buckets
   - Accessing query resources
   - Retrieving prompt templates

## Test Environment

The tests use the following configuration:

- InfluxDB running on port 8086
- A test organization named "test-org"
- A test bucket named "test-bucket"
- A test admin token and a separate token for the MCP server

## Automatic Cleanup

After the tests complete, the suite:

1. Closes the MCP client connection
2. Terminates the MCP server process
3. Stops and removes the InfluxDB Docker container

## Note on Docker Usage

The integration tests require Docker to be installed and running on your system. Make sure you have proper permissions to create and manage Docker containers before running the tests.
