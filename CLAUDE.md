# InfluxDB MCP Server - Guide for Claude

## Build & Test Commands
- **Run all tests**: `npm test`
- **Run a single test**: `npm test -- -t "test name"` (e.g., `npm test -- -t "should list organizations"`)
- **Skip integration tests**: `npm test -- --testPathIgnorePatterns=integration.test.js`
- **Install dependencies**: `npm install`
- **Start server**: `INFLUXDB_TOKEN=your_token node src/index.js`

## Code Style Guidelines
- **Language**: ES Modules JavaScript with TypeScript types (file extensions: .js)
- **Testing**: Jest with 60-second timeout for Docker operations
- **Formatting**: 2-space indentation
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Types**: Zod for runtime type validation
- **Error handling**: Try/catch blocks with structured error messages
- **Imports**: ES modules with named imports
- **Async patterns**: Async/await pattern preferred over promises

## Environment
- **Required vars**: `INFLUXDB_TOKEN` (authentication)
- **Optional vars**: `INFLUXDB_URL` (defaults to http://localhost:8086), `INFLUXDB_ORG`

## Project Structure
- `src/` - Core server implementation
- `tests/` - Integration tests using Docker containers