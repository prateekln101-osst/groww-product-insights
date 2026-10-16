# Groww Product Insights
## AI-Assisted Customer Review Analysis and Product Pulse

### 1. Project Overview

Groww Product Insights is a prototype workflow for analyzing customer reviews of the Groww investment application. It combines local CSV processing, keyword-based issue categorization, an AI model accessed through Google's Gemini API, and a Model Context Protocol (MCP) server.

The goal is to help product teams identify recurring customer pain points, examine supporting review evidence, and translate findings into actionable product recommendations.

The prototype also explores a human-approval workflow for Google Docs updates and Gmail draft creation.

### 2. Objectives

- Analyze customer reviews and identify recurring product issues.
- Measure approximate theme matches and low-rated matches.
- Use AI to summarize findings without inventing supporting evidence.
- Propose actionable improvements for product and customer experience teams.
- Require explicit human approval before executing supported external actions.
- Produce a weekly product pulse and a factual fee explainer.

### 3. Dataset

- **File:** `data/groww_reviews_last_8_weeks.csv` (adjust the path if your actual file is elsewhere).
- **Rows in the current dataset:** 2,963.
- **Reviews with non-empty text analyzed:** 2,963.
- **Observed date range:** September 13–October 12, 2026.
- **Review source listing:** https://play.google.com/store/apps/details?id=com.nextbillion.groww

**Important limitation:** Despite the CSV filename, the available dates cover approximately one month, not a full eight weeks. The dataset was collected using an unofficial Google Play review-scraping approach and may not represent all Groww users or reviews.

The date range and row count describe the current dataset and should be updated if the dataset changes.

### 4. Methodology

1. Load the CSV using Node.js.
2. Exclude rows with empty review text.
3. Apply predefined keyword patterns to five issue categories.
4. Count reviews matching each category and matching reviews rated one or two stars.
5. Extract example quotes for qualitative inspection.
6. Use Gemini for interpretation when the API is available.
7. Separate measured results from recommendations.
8. Disclose dataset limitations and potential category overlap.

Keyword-based categorization is exploratory. It may match positive, neutral, or negative comments, and a review may match multiple categories.

### 5. Full-Dataset Keyword Results

| Issue category | Matched reviews | Matches rated 1–2 |
|---|---:|---:|
| Usability and feature requests | 243 | 67 |
| App reliability and data accuracy | 115 | 64 |
| Customer support and resolution | 98 | 81 |
| Fees and charge transparency | 83 | 50 |
| Transactions and account operations | 43 | 30 |

These are keyword matches, not manually verified unique complaint counts. Categories overlap, and keyword patterns can match positive or neutral comments as well as complaints. The counts should be treated as directional evidence, not final validated complaint volumes.

### 6. Preliminary Product Priorities

#### Priority 1: Customer support and resolution

- **98** keyword-matched reviews.
- **81** matching reviews rated one or two stars.
- Example evidence includes complaints about unresolved issues and difficulty contacting customer support.
- **Recommendation:** Investigate resolution times, repeat contacts, and escalation handling.

#### Priority 2: App reliability and data accuracy

- **115** keyword-matched reviews.
- **64** matching reviews rated one or two stars.
- Example evidence includes reports of missing candlesticks and charts not updating regularly.
- **Recommendation:** Investigate chart freshness, data accuracy, and technical stability.

#### Priority 3: Transactions and account operations

- **43** keyword-matched reviews.
- **30** matching reviews rated one or two stars.
- Example evidence includes reports of withdrawal delays and account restrictions.
- **Recommendation:** Investigate transaction failures, withdrawal status communication, and account-resolution workflows.

These priorities are provisional and based on keyword matches in the current dataset. They should not be interpreted as validated estimates of the prevalence of each issue. Manual review and additional data are needed before making final roadmap decisions.

### 6A. How to Run the Prototype

#### Prerequisites

- Node.js installed.
- The project files and required npm dependencies available locally.
- A Gemini API key configured as `GEMINI_API_KEY` if Gemini functionality is required.
- MCP Inspector or another compatible MCP client.
- Google Apps Script endpoint URL and MCP authentication token configured if testing Google Docs and Gmail actions.

Do not place API keys or authentication tokens directly in this README or commit them to source control.

#### Start the MCP server

1. Open PowerShell.
2. Navigate to the MCP server directory:

   `cd C:\Users\prate\Groww-MCP`

3. Install dependencies if necessary:

   `npm install`

4. Start the server using the configured MCP client or MCP Inspector.

The MCP Inspector configuration should use the appropriate Node.js command, server script, working directory, and required environment variables for the local installation.

#### Review-analysis tools

- `analyze_groww_reviews` — analyze reviews using the configured tool implementation.
- `analyze_all_groww_reviews` — analyze the available review dataset.
- `preview_product_pulse` — preview a proposed product pulse without executing a Google Docs or Gmail action.

#### Human-approval workflow

The implemented workflow uses the following sequence:

1. Call `request_action_approval` to stage a proposed action.
2. Call `check_pending_approval` to inspect the pending request.
3. Call `execute_approved_action` before approval to verify that execution is blocked.
4. Call `approve_pending_action` with the exact request ID and required confirmation phrase: `I reviewed and approve this exact action`.
5. Call `execute_approved_action` again using the same request ID to execute the approved action.

A new request ID is generated for each newly staged action. Pending approval state is held in MCP server memory and is lost when the server restarts. After a restart, stage a new request and use its new request ID.

#### Supported external actions

The Google Apps Script integration has been tested for:

- Appending a report to the configured Google Doc.
- Creating an unsent Gmail draft.

The Gmail action creates a draft; it does not send the email.

Successful executions were tested during development. The final demo should show the approval-required response, blocked execution before approval, explicit approval, successful execution, and the resulting Google Doc or Gmail draft.

**Security limitation:** The approval gate is enforced by the MCP workflow. The Apps Script endpoint uses a shared secret token but does not independently verify the MCP approval state. The token must remain private.

### 7. Technology Stack

- JavaScript and Node.js
- Model Context Protocol (MCP) SDK
- Google Gemini API and `@google/genai`
- `csv-parse` for CSV processing
- Google Apps Script for Google Docs and Gmail integration
- Google Docs for the product pulse log
- Gmail for unsent draft creation
- MCP Inspector for local testing

### 8. Current Implementation Status

The following capabilities have been implemented or tested during development:

- A local review CSV is available and readable.
- The MCP server starts and registers its tools.
- Gemini text generation was tested.
- The local review-analysis tool processed 2,963 rows and returned keyword counts and example quotes.
- The product pulse was prepared and appended to a Google Doc.
- An unsent Gmail draft containing the product pulse and fee explainer was created.
- The human-approval workflow was tested for Google Docs append and Gmail draft creation.
- Execution before approval was blocked in testing.
- Approved execution was successful in previous tests.

Gemini interpretation may fail temporarily because of API availability, configuration, or usage limits. Local keyword results may still be available when Gemini is unavailable.

**Verification note:** These are development-test results, not a guarantee that every environment will work without configuration. Verify the current installation before presenting the prototype.

### 9. Privacy and Safety

- Keep the Gemini API key and MCP authentication token private.
- Do not commit secrets to GitHub.
- Review text sent to Gemini is transmitted to Google's API; therefore, this prototype is not fully local or entirely offline.
- Require explicit approval in the MCP workflow before executing supported external actions.
- The Apps Script endpoint relies on a shared secret token and does not independently enforce MCP approval state.
- The Gmail workflow creates an unsent draft and does not send messages.
- Do not include credentials, private user data, or confidential information in demo recordings or public documentation.

### 10. Known Limitations and Future Improvements

- Expand the dataset to at least eight weeks using genuine, verifiable historical reviews.
- Increase the documented source list to at least four relevant resources.
- Validate and improve keyword patterns, including multilingual and Hindi-language reviews.
- Distinguish complaints, praise, feature requests, and neutral mentions.
- Add deduplication and a repeatable review-sampling strategy.
- Evaluate classification against a manually labelled sample.
- Improve error handling, audit logging, and repeatable tests.
- Consider persistent approval state and stronger server-side authorization.
- Provide a public-facing web interface if required by the submission criteria.

### 11. Sources and References

1. Google Play listing for Groww: https://play.google.com/store/apps/details?id=com.nextbillion.groww
2. Groww official fees and charges help page: https://groww.in/help/payments-%26-withdrawals/payments-charges/what-fees-does-groww-charge--58
3. Groww official DP charges help page: https://groww.in/help/stocks/searchable/are-dp-charges-per-stock-or-per-order

**Before submission:** Add at least one additional relevant, verifiable source to meet the minimum of four resources, and ensure each source supports a clearly stated part of the analysis.

### 12. Deliverables

Complete and verify the following items before submission:

- [ ] Source code in the GitHub repository.
- [ ] Sample review CSV.
- [ ] Weekly product pulse in Markdown, PDF, or Google Docs.
- [ ] Fee explainer with official references and a last-checked date.
- [ ] README with setup instructions, limitations, and approval workflow.
- [ ] Demo video of no more than three minutes, or a working hosted prototype if required.
- [ ] Google Docs append evidence.
- [ ] Screenshot or text evidence of the unsent Gmail draft.
- [ ] Source list containing at least four relevant resources.
- [ ] GitHub repository URL.
- [ ] Publicly accessible prototype URL or permitted demo-video link.

The final sharing permissions and links must be tested before submission.

### 13. Conclusion

Groww Product Insights demonstrates an exploratory workflow for analyzing customer reviews, identifying recurring themes, and proposing product improvements. It combines local keyword analysis, optional AI-assisted interpretation, and a tested human-approval workflow for Google Docs and Gmail actions.

The current dataset covers approximately one month, and the results are directional rather than validated complaint estimates. Expanding the dataset, validating the categories, completing the source list, and verifying the final submission links are important next steps before the prototype can be considered a more complete product-insights solution.
