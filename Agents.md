# Agent Context: SQA Harness Project

## Project Overview
This repository contains a 3-Tier Automated Software Quality Assurance (SQA) Harness utilizing Playwright, OpenCV (`opencv4nodejs`), and the Gemini API to test complex UI states (specifically HTML5 Canvas elements).

## Architectural Boundaries
1. **Tier 1 (Frontend):** Next.js (App Router) running on port 3000. 
2. **Tier 2 (Queue):** Local Redis instance managing a BullMQ job queue.
3. **Tier 3 (Worker):** Standalone Node.js process executing Playwright and OpenCV scripts.

## Strict Rules of Engagement for Jules
* **Role:** You are acting as a junior boilerplate laborer. 
* **Prohibited Areas:** You must NEVER modify, refactor, or attempt to optimize the core `opencv4nodejs` computer vision logic or the Gemini AI prompt integrations unless explicitly directed via a strict prompt.
* **Tech Stack Limits:** Do not install bloated frameworks. Stick strictly to standard Node.js, Next.js, Redis (BullMQ), and Tailwind CSS.
* **Code Style:** Use strict TypeScript. Default to functional components for React. Handle all asynchronous operations cleanly to prevent Node.js memory leaks in the background workers.