import cv from '@u4/opencv4nodejs';
import * as fs from 'fs';

// --- Result Interface ---

export interface VisionMatchResult {
  found: boolean;
  x?: number;
  y?: number;
  confidence: number;
}

// --- Vision Pipeline ---

export class VisionMatcher {
  /**
   * Scans a screenshot for a specific template image and returns the center
   * coordinates of the best match.
   *
   * Algorithm: TM_CCOEFF_NORMED — handles slight lighting and rendering
   * variations better than raw pixel matching, which is essential for
   * HTML5 Canvas games that may re-render frames with minor differences.
   *
   * @param screenshotPath - Absolute path to the full game screenshot
   * @param templatePath   - Absolute path to the cropped template image (e.g., a Spin button)
   * @param threshold      - Minimum confidence score (0.0 to 1.0) to consider a match valid. Default: 0.85
   */
  public static async findElementCoordinates(
    screenshotPath: string,
    templatePath: string,
    threshold: number = 0.85
  ): Promise<VisionMatchResult> {
    // GUARD: Validate threshold range. Values outside [0.0, 1.0] are
    // nonsensical for TM_CCOEFF_NORMED which always returns in that range.
    if (threshold < 0 || threshold > 1) {
      throw new Error(
        `[VisionMatcher] Invalid threshold: ${threshold}. Must be between 0.0 and 1.0.`
      );
    }

    // GUARD: Validate that both image files actually exist on disk before
    // handing them to OpenCV. imread silently returns an empty Mat on
    // missing files, which causes a cryptic downstream crash in matchTemplate.
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`[VisionMatcher] Screenshot not found: ${screenshotPath}`);
    }
    if (!fs.existsSync(templatePath)) {
      throw new Error(`[VisionMatcher] Template not found: ${templatePath}`);
    }

    // Load images asynchronously to avoid blocking the event loop on large
    // screenshots (Canvas games can produce 1920×1080+ frames).
    const screenshot = await cv.imreadAsync(screenshotPath);
    const template = await cv.imreadAsync(templatePath);

    // Wrap the core pipeline in try/finally to guarantee Mat cleanup.
    // OpenCV Mats hold native C++ heap memory that is NOT managed by the
    // V8 garbage collector. Failing to release them causes a slow memory
    // leak that compounds over hundreds of game rounds.
    try {
      // GUARD: Even if the file exists, imread can return an empty Mat if the
      // file is corrupted, zero-length, or an unsupported format.
      if (screenshot.empty) {
        throw new Error(`[VisionMatcher] Failed to decode screenshot (empty Mat): ${screenshotPath}`);
      }
      if (template.empty) {
        throw new Error(`[VisionMatcher] Failed to decode template (empty Mat): ${templatePath}`);
      }

      // GUARD: The template must be smaller than the screenshot in both
      // dimensions. OpenCV's matchTemplate will throw an opaque C++ assertion
      // failure if this invariant is violated.
      if (template.rows > screenshot.rows || template.cols > screenshot.cols) {
        throw new Error(
          `[VisionMatcher] Template (${template.cols}x${template.rows}) is larger than ` +
          `screenshot (${screenshot.cols}x${screenshot.rows}). Cannot perform match.`
        );
      }

      // Perform template matching using TM_CCOEFF_NORMED.
      // The result is a single-channel float Mat where each pixel value represents
      // the correlation coefficient at that position.
      const result = await screenshot.matchTemplateAsync(template, cv.TM_CCOEFF_NORMED);

      // Extract the location and value of the best match.
      // For TM_CCOEFF_NORMED, the maximum value is the best match.
      // NOTE: Using the async variant to stay non-blocking, consistent with
      // the rest of the pipeline (imreadAsync, matchTemplateAsync).
      const { maxVal, maxLoc } = await cv.minMaxLocAsync(result);

      // Release the result Mat immediately — it's no longer needed.
      result.release();

      // If the best match doesn't meet the confidence threshold, report not found.
      if (maxVal < threshold) {
        console.log(
          `[VisionMatcher] No match. Best confidence: ${maxVal.toFixed(4)} (threshold: ${threshold})`
        );
        return { found: false, confidence: maxVal };
      }

      // COORDINATE MATH: maxLoc gives us the top-left corner of the matched
      // region. To click the center of the element (e.g., a Spin button),
      // we offset by half the template's width and height.
      const centerX = maxLoc.x + Math.floor(template.cols / 2);
      const centerY = maxLoc.y + Math.floor(template.rows / 2);

      console.log(
        `[VisionMatcher] Match found! Center: (${centerX}, ${centerY}) | ` +
        `Confidence: ${maxVal.toFixed(4)}`
      );

      return {
        found: true,
        x: centerX,
        y: centerY,
        confidence: maxVal,
      };
    } finally {
      // CLEANUP: Release native C++ memory held by Mat objects.
      // This runs on both success and error paths.
      screenshot.release();
      template.release();
    }
  }
}

// =============================================================================
// SPECULATED ISSUES & KNOWN LIMITATIONS — FOR THE RECORD
// =============================================================================
//
// 1. SCALE SENSITIVITY
//    TM_CCOEFF_NORMED is scale-invariant for brightness/contrast but NOT for
//    resolution. If the template was cropped from a 1920×1080 screenshot but
//    the runtime screenshot is 1280×720 (e.g., different viewport size), the
//    match will fail silently (confidence will drop below threshold). A future
//    enhancement could implement multi-scale matching by resizing the template
//    at multiple scale factors and running matchTemplate at each.
//
// 2. ROTATION SENSITIVITY
//    matchTemplate does not handle rotated templates. If the game UI rotates
//    elements (e.g., animated spin buttons), the match confidence will degrade.
//    This is a fundamental limitation of template matching; feature-based
//    matching (ORB/SIFT) would be needed for rotation-invariant detection.
//
// 3. MULTIPLE MATCHES
//    This implementation only finds the single best match (global maxVal).
//    If the same button appears multiple times on screen (e.g., multiple
//    "Bet" buttons in a multi-game layout), only the highest-confidence one
//    is returned. A future enhancement could threshold the result Mat and
//    return all match locations above the confidence threshold.
//
// 4. CHANNEL MISMATCH
//    imread loads images as BGR by default. If the screenshot is saved as
//    RGBA (e.g., Playwright's page.screenshot() produces PNG with alpha),
//    there may be a 4-channel vs 3-channel mismatch. matchTemplate handles
//    multi-channel images by summing across channels, so this typically
//    still works, but confidence scores may be slightly lower than expected.
//    If this becomes an issue, convert both to grayscale before matching:
//      screenshot.cvtColor(cv.COLOR_BGR2GRAY)
//
// 5. CONCURRENCY / THREAD SAFETY
//    @u4/opencv4nodejs uses N-API worker threads internally. Multiple
//    concurrent calls to findElementCoordinates are safe from a Node.js
//    perspective, but will compete for CPU. In a high-throughput scenario
//    (multiple workers on one machine), consider limiting concurrency.
//
// 6. NATIVE BINARY DEPENDENCY
//    @u4/opencv4nodejs requires a native OpenCV build. If the worker is
//    deployed to a different OS or architecture (e.g., ARM-based CI), the
//    native addon must be recompiled. This is a deployment concern, not a
//    code bug, but should be documented in the CI/CD pipeline setup.
//
// =============================================================================
