import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";

const server = new McpServer({
  name: "groww-product-insights",
  version: "1.1.0"
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

let pendingAction = null;

const APPS_SCRIPT_URL = process.env.GROWW_APPS_SCRIPT_URL;
const APPS_SCRIPT_TOKEN = process.env.GROWW_MCP_TOKEN;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

const CSV_PATH =
  process.env.GROWW_CSV_PATH ||
  "C:\\Users\\prate\\OneDrive\\Documents\\Groww-Product-Insights\\data\\groww_reviews_last_8_weeks.csv";

// --------------------------------------------------
// 1. Preview a report without changing anything
// --------------------------------------------------

server.registerTool(
  "preview_product_pulse",
  {
    title: "Preview Product Pulse",
    description: "Preview a Groww product insights report without changing any documents.",
    inputSchema: {
      summary: z.string()
    }
  },
  async ({ summary }) => ({
    content: [{
      type: "text",
      text: `GROWW PRODUCT PULSE PREVIEW\n\n${summary}\n\nNo document was changed and no email was created.`
    }]
  })
);

// --------------------------------------------------
// 2. Stage an action for human approval
// --------------------------------------------------

server.registerTool(
  "request_action_approval",
  {
    title: "Request Action Approval",
    description: "Stage a specific Google Docs append or Gmail draft for explicit human approval. This tool never executes the action.",
    inputSchema: {
      action: z.enum(["append_report", "create_gmail_draft"]),
      details: z.string().min(1),
      reportId: z.string().optional(),
      reportText: z.string().optional(),
      subject: z.string().optional(),
      emailBody: z.string().optional(),
      recipient: z.string().optional()
    }
  },
  async ({ action, details, reportId, reportText, subject, emailBody, recipient }) => {
    if (pendingAction && !pendingAction.executed) {
      return {
        content: [{
          type: "text",
          text: "An action is already pending. Approve and execute it, or restart the MCP server to clear the pending action before staging another."
        }],
        isError: true
      };
    }

    if (
      action === "append_report" &&
      (!reportId?.trim() || !reportText?.trim())
    ) {
      return {
        content: [{
          type: "text",
          text: "For append_report, provide both reportId and the complete reportText. Nothing was staged."
        }],
        isError: true
      };
    }

    if (
      action === "create_gmail_draft" &&
      (!subject?.trim() || !emailBody?.trim())
    ) {
      return {
        content: [{
          type: "text",
          text: "For create_gmail_draft, provide both subject and the complete emailBody. Nothing was staged."
        }],
        isError: true
      };
    }

    pendingAction = {
      requestId: randomUUID(),
      action,
      details,
      payload: action === "append_report"
        ? { reportId, reportText }
        : { subject, emailBody, recipient: recipient || "" },
      approved: false,
      createdAt: Date.now(),
      executed: false
    };

    return {
      content: [{
        type: "text",
        text:
          `APPROVAL REQUIRED\n` +
          `Request ID: ${pendingAction.requestId}\n` +
          `Action: ${action}\n` +
          `Details: ${details}\n` +
          (
            action === "append_report"
              ? `Report ID: ${reportId}\nReport text length: ${reportText.length} characters\n`
              : `Email subject: ${subject}\nEmail body length: ${emailBody.length} characters\n`
          ) +
          "\nNothing has been executed. Review this exact action before approving it."
      }]
    };
  }
);

// --------------------------------------------------
// 3. Check the pending action
// --------------------------------------------------

server.registerTool(
  "check_pending_approval",
  {
    title: "Check Pending Approval",
    description: "Inspect the staged action and whether it has been approved or executed.",
    inputSchema: {}
  },
  async () => ({
    content: [{
      type: "text",
      text: !pendingAction
        ? "There is no action waiting for approval."
        : (
          `Request ID: ${pendingAction.requestId}\n` +
          `Action: ${pendingAction.action}\n` +
          `Details: ${pendingAction.details}\n` +
          `Approved: ${pendingAction.approved}\n` +
          `Executed: ${pendingAction.executed}\n` +
          `Created: ${new Date(pendingAction.createdAt).toISOString()}\n` +
          (
            pendingAction.action === "append_report"
              ? `Report ID: ${pendingAction.payload.reportId}\nReport text:\n${pendingAction.payload.reportText}`
              : `Email subject: ${pendingAction.payload.subject}\nEmail body:\n${pendingAction.payload.emailBody}\nRecipient: ${pendingAction.payload.recipient || "(not specified)"}`
          )
        )
    }]
  })
);

// --------------------------------------------------
// 4. Record explicit human approval
// --------------------------------------------------

server.registerTool(
  "approve_pending_action",
  {
    title: "Approve Pending Action",
    description: "Record explicit human approval after the user has reviewed the exact staged content.",
    inputSchema: {
      requestId: z.string().min(1),
      confirmation: z.literal("I reviewed and approve this exact action")
    }
  },
  async ({ requestId }) => {
    if (!pendingAction || pendingAction.requestId !== requestId) {
      return {
        content: [{
          type: "text",
          text: "No matching pending request. Nothing was approved."
        }],
        isError: true
      };
    }

    if (pendingAction.executed) {
      return {
        content: [{
          type: "text",
          text: "This request has already been executed."
        }],
        isError: true
      };
    }

    if (Date.now() - pendingAction.createdAt > APPROVAL_TIMEOUT_MS) {
      pendingAction = null;

      return {
        content: [{
          type: "text",
          text: "The approval request expired. Stage it again for a fresh review."
        }],
        isError: true
      };
    }

    pendingAction.approved = true;
    pendingAction.approvedAt = Date.now();

    return {
      content: [{
        type: "text",
        text:
          `Human approval recorded for ${requestId}.\n` +
          "Nothing has executed yet. Call execute_approved_action separately to perform the approved action."
      }]
    };
  }
);

// --------------------------------------------------
// 5. Execute only an approved action
// --------------------------------------------------

server.registerTool(
  "execute_approved_action",
  {
    title: "Execute Approved Action",
    description: "Execute the exact staged action only after approval. Appends a report to Google Docs or creates an unsent Gmail draft. Never sends email.",
    inputSchema: {
      requestId: z.string().min(1)
    }
  },
  async ({ requestId }) => {
    if (!APPS_SCRIPT_URL || !APPS_SCRIPT_TOKEN) {
      return {
        content: [{
          type: "text",
          text: "Missing GROWW_APPS_SCRIPT_URL or GROWW_MCP_TOKEN environment variable. Nothing was executed."
        }],
        isError: true
      };
    }

    if (!pendingAction || pendingAction.requestId !== requestId) {
      return {
        content: [{
          type: "text",
          text: "No matching pending request. Nothing was executed."
        }],
        isError: true
      };
    }

    if (!pendingAction.approved) {
      return {
        content: [{
          type: "text",
          text: "Approval is required first. Nothing was executed."
        }],
        isError: true
      };
    }

    if (pendingAction.executed) {
      return {
        content: [{
          type: "text",
          text: "This request has already been executed. Duplicate execution blocked."
        }],
        isError: true
      };
    }

    if (Date.now() - pendingAction.createdAt > APPROVAL_TIMEOUT_MS) {
      pendingAction = null;

      return {
        content: [{
          type: "text",
          text: "Approval expired. Nothing was executed. Stage and approve a new request."
        }],
        isError: true
      };
    }

    const actionToRun = pendingAction;

    const requestBody = {
      token: APPS_SCRIPT_TOKEN,
      action: actionToRun.action,
      requestId: actionToRun.requestId,
      ...actionToRun.payload
    };

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        redirect: "follow"
      });

      const responseText = await response.text();

      let result;

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Apps Script returned a non-JSON response (HTTP ${response.status}). Check the web app deployment access settings and URL.`
        );
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || `Apps Script request failed with HTTP ${response.status}.`
        );
      }

      actionToRun.executed = true;
      actionToRun.executedAt = Date.now();

      return {
        content: [{
          type: "text",
          text:
            `EXECUTION CONFIRMED\n` +
            `Action: ${actionToRun.action}\n` +
            `Request ID: ${actionToRun.requestId}\n` +
            `${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text:
            `Execution failed: ${error.message}\n` +
            "The action is not marked executed. Check Apps Script deployment access and logs before retrying."
        }],
        isError: true
      };
    }
  }
);

// --------------------------------------------------
// 6. Ask Gemini for analysis
// --------------------------------------------------

server.registerTool(
  "ask_gemini",
  {
    title: "Ask Gemini",
    description: "Ask Gemini a question. Gemini can analyze information but cannot stage or execute actions through this tool.",
    inputSchema: {
      prompt: z.string().describe("The question or task to give Gemini")
    }
  },
  async ({ prompt }) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction:
            "You assist with Groww product insights. Analyze information carefully, do not invent findings, and do not claim to have changed a document or created an email. Human approval is required before any external action. Never request or reveal API keys or other secrets.",
          tools: [{
            functionDeclarations: [{
              name: "stage_action_for_approval",
              description:
                "Suggest an action for human review. This function does not execute any action.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    enum: ["append_report", "create_gmail_draft"]
                  },
                  details: {
                    type: Type.STRING
                  }
                },
                required: ["action", "details"]
              }
            }]
          }]
        }
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const functionCall = parts.find(part => part.functionCall)?.functionCall;

      if (functionCall?.name === "stage_action_for_approval") {
        const args = functionCall.args;
        const allowedActions = ["append_report", "create_gmail_draft"];

        if (!allowedActions.includes(args?.action) || !args?.details) {
          return {
            content: [{
              type: "text",
              text: "Gemini returned an invalid action proposal. Nothing was staged or executed."
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text:
              `Gemini suggested an action: ${args.action}\n` +
              `Details: ${args.details}\n\n` +
              "This is only a suggestion. Nothing was staged or executed. To stage a complete action, use request_action_approval with all required content."
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: response.text || "Gemini returned no text. Please try again."
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text:
            `Gemini request failed: ${error.message}\n` +
            "Check the API key, model availability, and API usage limits."
        }],
        isError: true
      };
    }
  }
);

// --------------------------------------------------
// 7. Analyze a sample of reviews
// --------------------------------------------------

server.registerTool(
  "analyze_groww_reviews",
  {
    title: "Analyze Groww Reviews",
    description: "Read a sample of the local Groww review CSV and ask Gemini to identify product issues.",
    inputSchema: {
      question: z.string().describe("What to analyze in the customer reviews")
    }
  },
  async ({ question }) => {
    try {
      const csvText = await readFile(CSV_PATH, "utf8");

      const reviews = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        bom: true
      });

      const sample = reviews
        .filter(row => row.review_text && row.review_text.trim())
        .slice(0, 100)
        .map(row => ({
          date: row.review_date,
          rating: row.rating,
          review: row.review_text
        }));

      if (sample.length === 0) {
        throw new Error("No review rows were found in the CSV.");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          "Analyze only the customer reviews supplied below. Do not invent findings or claim this sample represents the entire dataset. Mention that this is a sample of up to 100 reviews. Identify up to three recurring product issues, support each with brief evidence, and distinguish observations from recommendations.",
          `User's question: ${question}`,
          `Customer reviews:\n${JSON.stringify(sample)}`
        ].join("\n\n")
      });

      return {
        content: [{
          type: "text",
          text:
            `Sample analyzed: ${sample.length} reviews.\n\n` +
            `${response.text || "Gemini returned no text."}\n\n` +
            "Note: This is a sample, not a full-dataset analysis."
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Review analysis failed: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// --------------------------------------------------
// 8. Analyze all reviews and count approximate themes
// --------------------------------------------------

server.registerTool(
  "analyze_all_groww_reviews",
  {
    title: "Analyze All Groww Reviews",
    description: "Analyze all non-empty reviews locally, count approximate issue themes, and ask Gemini to interpret the measured results.",
    inputSchema: {
      question: z.string().describe("What you want to learn from the full review dataset")
    }
  },
  async ({ question }) => {
    try {
      const csvText = await readFile(CSV_PATH, "utf8");

      const rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        bom: true
      });

      const reviews = rows.filter(
        row => row.review_text && row.review_text.trim()
      );

      if (reviews.length === 0) {
        throw new Error("No non-empty reviews were found.");
      }

      const themes = [
        {
          name: "App reliability and data accuracy",
          pattern: /\b(chart|charts|candle|candles|lag|lagging|slow|crash|crashes|crashing|bug|bugs|error|errors|not working|technical issue|data accuracy|data not updated|loading|freeze|freezing)\b/i
        },
        {
          name: "Customer support and resolution",
          pattern: /\b(customer support|customer care|support team|helpline|call connect|no response|not responding|not resolved|unresolved|complaint|complaints|ticket|email support|customer service|response time)\b/i
        },
        {
          name: "Fees and charge transparency",
          pattern: /\b(brokerage|brokerage charge|dp charge|cdsl|hidden charge|hidden charges|transaction charge|transaction charges|charges deducted|extra charge|extra charges|fee|fees|charges|deduction|deductions)\b/i
        },
        {
          name: "Transactions and account operations",
          pattern: /\b(withdrawal|withdraw|withdrawals|deposit|add money|money stuck|fund stuck|payment failed|order failed|order placed|order not|sell order|buy order|account activation|account blocked|account opening|kyc|settlement)\b/i
        },
        {
          name: "Usability and feature requests",
          pattern: /\b(user interface|ui|ux|interface|navigation|layout|feature|features|feature request|option|options|difficult to use|easy to use|confusing|confusing interface|design|update|new update|watchlist|widget|dark mode)\b/i
        }
      ];

      const results = themes.map(theme => {
        const matches = reviews.filter(row =>
          theme.pattern.test(row.review_text)
        );

        const lowRated = matches.filter(row => {
          const rating = Number(row.rating);
          return Number.isFinite(rating) && rating <= 2;
        });

        return {
          theme: theme.name,
          matchedReviews: matches.length,
          lowRatedMatches: lowRated.length,
          examples: matches.slice(0, 3).map(row => ({
            date: row.review_date || "Date unavailable",
            rating: row.rating || "Rating unavailable",
            quote: row.review_text.trim().slice(0, 350)
          }))
        };
      });

      const dates = reviews
        .map(row => row.review_date)
        .filter(Boolean)
        .sort();

      const prompt = [
        "You are a careful product analyst. Interpret the measured results below.",
        "Theme counts are keyword matches, not verified unique issue counts. Themes overlap, so do not add their counts together.",
        "Do not change, invent, or extrapolate any counts. Treat example quotes as supplied evidence, not proof that all users share the same experience.",
        "Identify the three themes most worth investigating. Explain the measured evidence, limitations, and a practical next step for each. Separate findings from recommendations.",
        `User question: ${question}`,
        `Total CSV rows: ${rows.length}`,
        `Reviews with non-empty text analyzed: ${reviews.length}`,
        `Dataset date range: ${dates[0] || "Unavailable"} to ${dates.at(-1) || "Unavailable"}`,
        `Measured theme results:\n${JSON.stringify(results, null, 2)}`
      ].join("\n\n");

      let interpretation =
        "Gemini interpretation unavailable. Use the measured keyword counts and example quotes above; retry interpretation later.";

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt
        });

        interpretation = response.text || interpretation;
      } catch (error) {
        interpretation += `\nReason: ${error.message}`;
      }

      return {
        content: [{
          type: "text",
          text:
            `FULL-DATASET REVIEW ANALYSIS\n` +
            `CSV rows: ${rows.length}\n` +
            `Reviews with text analyzed: ${reviews.length}\n` +
            `Date range: ${dates[0] || "Unavailable"} to ${dates.at(-1) || "Unavailable"}\n\n` +
            `MEASURED KEYWORD MATCHES\n${JSON.stringify(results, null, 2)}\n\n` +
            `GEMINI INTERPRETATION\n${interpretation}\n\n` +
            "LIMITATION: Keyword-based theme counts are approximate and may overlap. Review the sample quotes and validate categories before treating them as final issue counts."
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Full-dataset analysis failed: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// --------------------------------------------------
// Start the MCP server
// --------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);