/**
 * HTTP Transport for MCP Server using Streamable HTTP
 * Implements MCP-compatible HTTP transport with SSE support
 */

export class HttpTransport {
  constructor() {
    this.sessionId = null;
    this.callbacks = new Map();
    this.responseStream = null;
  }

  /**
   * Handle incoming HTTP request with genai-toolbox style flexibility
   */
  async handleRequest(req, res) {
    try {
      // More flexible CORS handling (genai-toolbox style)
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id');

      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }

      // Detect protocol version and session (genai-toolbox style)
      this.detectProtocolVersion(req);
      this.detectSession(req);

      if (req.method === 'POST') {
        await this.handlePost(req, res);
      } else if (req.method === 'GET') {
        await this.handleGet(req, res);
      } else {
        res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Error handling HTTP request:', error);
      this.sendErrorResponse(res, error);
    }
  }

  /**
   * Handle POST requests with genai-toolbox style flexibility
   */
  async handlePost(req, res) {
    try {
      // More flexible content type detection
      const contentType = req.headers['content-type'] || '';
      const acceptHeader = req.headers.accept || '*/*';
      const supportsSSE = acceptHeader.includes('text/event-stream');

      // Parse message with better error handling
      let message;
      try {
        message = req.body;
        if (typeof message === 'string') {
          message = JSON.parse(message);
        }
      } catch (parseError) {
        return this.sendErrorResponse(res, new Error('Invalid JSON'), 400);
      }

      // More flexible JSON-RPC validation (genai-toolbox style)
      if (!message || typeof message !== 'object') {
        return this.sendErrorResponse(res, new Error('Invalid message format'), 400);
      }

      // Handle requests with flexible protocol support
      if (message.method) {
        const response = await this.processRequest(message, req);

        if (message.id !== undefined && response) {
          // Send response in format client expects
          this.sendResponse(res, response, {
            supportsSSE: supportsSSE,
            method: message.method,
            requestId: message.id
          });
        } else {
          // Notification - send simple success
          res.status(200).json({ success: true });
        }
      } else {
        // Handle other message types
        res.status(200).json({ received: true });
      }
    } catch (error) {
      console.error('Error processing POST request:', error);
      this.sendErrorResponse(res, error, 500);
    }
  }

  /**
   * Handle GET requests with genai-toolbox style info
   */
  async handleGet(req, res) {
    // Check if this is an SSE connection request
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
      // Start SSE connection
      this.startSSEConnection(req, res);
      return;
    }

    // Return server info in genai-toolbox style
    res.json({
      name: 'InfluxDB MCP Server',
      version: '0.1.1',
      transport: 'http',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      protocolVersion: this.protocolVersion || '2024-11-05',
      serverInfo: {
        name: 'InfluxDB MCP Server',
        version: '0.1.1'
      }
    });
  }

  /**
   * Detect protocol version from headers (genai-toolbox style)
   */
  detectProtocolVersion(req) {
    this.protocolVersion = req.headers['mcp-protocol-version'] ||
                          req.query.protocolVersion ||
                          '2024-11-05';
  }

  /**
   * Detect session information (genai-toolbox style)
   */
  detectSession(req) {
    this.sessionId = req.headers['mcp-session-id'] ||
                     req.query.session ||
                     this.generateSessionId();
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Process request with enhanced error handling
   */
  async processRequest(message, req) {
    if (!this.messageHandler) {
      throw new Error('No message handler configured');
    }

    try {
      const response = await this.messageHandler(message);
      return response;
    } catch (error) {
      console.error('Error in message handler:', error);
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
    }
  }

  /**
   * Send response in appropriate format
   */
  sendResponse(res, response, options = {}) {
    const { supportsSSE, method, requestId } = options;

    // Use SSE for streaming if supported and appropriate
    if (supportsSSE && this.shouldStream(method)) {
      this.sendSSEResponse(res, response, requestId);
    } else {
      // Send JSON response with flexible headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(response);
    }
  }

  /**
   * Send error response in genai-toolbox style
   */
  sendErrorResponse(res, error, statusCode = 500) {
    const errorResponse = {
      error: {
        message: error.message || 'Unknown error',
        type: error.name || 'Error',
        code: statusCode
      },
      success: false
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(statusCode).json(errorResponse);
  }

  /**
   * Start SSE connection (genai-toolbox style)
   */
  startSSEConnection(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      sessionId: this.sessionId,
      protocolVersion: this.protocolVersion
    })}\n\n`);

    this.responseStream = res;

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.responseStream = null;
    });
  }

  /**
   * Send SSE response for streaming messages
   */
  sendSSEResponse(res, response, requestId) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send the response as SSE
    const eventData = JSON.stringify(response);
    res.write(`id: ${requestId}\n`);
    res.write(`data: ${eventData}\n\n`);

    // Close the stream after sending response
    res.end();
  }

  /**
   * Determine if a method should use streaming
   */
  shouldStream(method) {
    // Stream for potentially long-running operations
    const streamingMethods = ['query-data', 'write-data'];
    return streamingMethods.includes(method);
  }

  /**
   * More flexible origin checking (genai-toolbox style)
   */
  isAllowedOrigin(origin) {
    // Allow all origins for maximum compatibility (like genai-toolbox)
    return true;
  }

  /**
   * Set message handler callback
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }

  /**
   * Send message through HTTP transport
   */
  async send(message) {
    // For HTTP transport, messages are sent as responses to POST requests
    // This method would be used by the MCP server to send notifications
    if (this.responseStream) {
      const eventData = JSON.stringify(message);
      this.responseStream.write(`data: ${eventData}\n\n`);
    }
  }

  /**
   * Start the transport (placeholder for interface compatibility)
   */
  async start() {
    // HTTP transport starts when the server starts
    console.log('HTTP transport ready');
  }

  /**
   * Close the transport
   */
  async close() {
    if (this.responseStream) {
      this.responseStream.end();
      this.responseStream = null;
    }
  }
}