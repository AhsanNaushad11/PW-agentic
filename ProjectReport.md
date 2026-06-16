# PW Agentic - Project Report

## 1. Application Objective
The **PW Agentic** application is a 3-Tier Automated Software Quality Assurance (SQA) Harness designed for agentic-based game testing. It specifically targets online casino games (like slots, plinko, and crash games) that use complex HTML5 Canvas UI states. The system enables a user to input natural language test cases which are then converted into Playwright TypeScript scripts using an LLM (Gemini 2.5 Flash). The scripts are executed by a standalone Node.js worker via a Redis-backed BullMQ job queue. To bypass the limitations of DOM-less Canvas elements, the worker employs OpenCV for template-based computer vision (to locate UI controls) and the Gemini Vision API to extract game state and financial metrics (e.g., Balance, Bet, Win) from screenshots via OCR. The objective is to establish an autonomous, self-healing functional testing loop capable of memorizing game rules and gathering photographic evidence of every game round.

## 2. Libraries and Resources Used
- **Next.js (v16):** The core React framework serving the frontend UI and backend API routes.
- **Playwright (`@playwright/test`):** A browser automation framework used to execute the generated test scripts and interact with the game UI.
- **BullMQ (`bullmq`):** A fast and robust job queue system for Node.js used to orchestrate test execution tasks.
- **IORedis (`ioredis`):** A robust Redis client for Node.js, used as the underlying message broker and storage for BullMQ.
- **Google Gen AI SDK (`@google/genai`):** The official SDK used to interface with the Gemini API for code generation and visual OCR extraction.
- **OpenCV (`opencv4nodejs`):** A computer vision library utilized by the worker to locate UI components (e.g., spin buttons) on canvas elements via template matching.
- **Monaco Editor (`@monaco-editor/react`):** A browser-based code editor integrated into the frontend to display, highlight, and edit the generated TypeScript scripts.
- **Tailwind CSS (`tailwindcss`):** A utility-first CSS framework used for styling the frontend interface.
- **Zustand (`zustand`):** A lightweight state management library used for handling global state in the React frontend.
- **i18next (`i18next` / `react-i18next`):** Internationalization frameworks utilized for multi-language support.

## 3. Test Plans

### Smoke Testing
**Objective:** Verify that critical system components and core communication paths are operational.
1. Start the Next.js frontend, local Redis server, and the Node.js execution Worker.
2. Load the web interface at `localhost:3000` to confirm the UI renders without crashing.
3. Submit a simple natural language prompt to generate a test script.
4. Verify the application successfully communicates with the Gemini API and populates the Monaco Editor with Playwright TypeScript code.
5. Trigger an execution job and verify that the payload is correctly published to the BullMQ queue.
6. Check the worker logs to verify the job is dequeued and acknowledged without throwing initial validation errors.

### Integration Testing
**Objective:** Validate the end-to-end execution loop across all three tiers (Frontend → Redis Queue → Worker → AI Vision).
1. Enqueue a simulated job with a valid target URL, game mode, and execution parameters.
2. Verify the worker picks up the job and Playwright initializes a browser with a strictly enforced 1280x720 viewport.
3. Verify the browser correctly navigates to the target URL and captures the pre-spin action screenshot.
4. Assert that the OpenCV `VisionMatcher` successfully calculates the x/y coordinates of the UI template and that Playwright injects a physical click at that exact coordinate.
5. Wait for the 3000ms delay and assert the post-spin result screenshot is captured.
6. Verify the Gemini API correctly receives the post-spin screenshot and returns structured OCR data (e.g., `currentBalance`, `betAmount`, `winAmount`).
7. Verify that upon job completion (or failure), the worker's `finally` block successfully purges the temporary screenshot directory to prevent disk exhaustion.

### Speculated Integration Testing Failures
1. **Computer Vision Scale Drift:** If the game canvas renders at a slightly different scale or applies a visual filter, the OpenCV template matcher might fall below the 0.85 confidence threshold, causing the click injection to be skipped or executed on incorrect coordinates.
2. **Gemini API Throttling (HTTP 429):** During rapid succession of rounds (e.g., 100 rounds with minimal spin intervals), the Gemini Vision API might rate-limit the requests, causing the OCR extraction step to fail or timeout for specific rounds.
3. **Browser Navigation Timeouts:** If the test target utilizes persistent WebSockets or continuous streaming assets, Playwright's `waitUntil: 'networkidle'` condition might never trigger, causing the initial page load to fail after the 60-second default timeout.

## 4. Known Flaws and Unhandled Exceptions

### Flaws
- **Game State Desync (Blind Fire-and-Forget):** The execution loop injects a physical click and waits a hardcoded interval (3000ms) without checking if the game actually transitioned to a "spinning" state. If the UI lags, or a blocker (e.g., "Insufficient Funds" pop-up) appears, the loop will aggressively desync from the actual game state.
- **BullMQ Stalls via Event Loop Starvation:** Heavy, synchronous image processing via OpenCV can starve the Node.js event loop. If the event loop stalls longer than BullMQ's lock duration (30 seconds), BullMQ assumes the worker crashed and will blindly re-queue the job to another worker, leading to duplicated test executions.
- **Infinite Navigation Hang:** Relying on `networkidle` for modern canvas/WebGL games is notoriously unstable due to background polling and media streams, frequently causing phantom timeouts before tests even begin.

### Unhandled Exceptions & Risks
- **Zombie Browser Processes:** The global `uncaughtException` handler logs the error and calls `process.exit(1)`. This immediately kills the Node process without executing the `browserManager.close()` cleanup routine, inevitably leaving orphaned headless Chromium processes eating up system memory.
- **Silent Loss of Functional Data:** When the Gemini Vision API fails (due to network or safety block), the inner `try/catch` in the worker logs the error but continues the loop. While this prevents a total job crash, it silently leaves gaps in the required functional testing evidence without flagging the overall job as compromised.
