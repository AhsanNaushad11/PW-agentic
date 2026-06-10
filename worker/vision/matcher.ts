import cv from '@u4/opencv4nodejs';

export async function findElementWithVision(
  screenshotBuffer: Buffer,
  templatePath: string,
  confidenceThreshold: number = 0.85
): Promise<{ x: number; y: number } | null> {
  try {
    // 1. Decode screenshot buffer to Mat
    const screenshotMat = cv.imdecode(screenshotBuffer);
    
    // 2. Load template image
    const templateMat = await cv.imreadAsync(templatePath);

    // 3. Convert both to grayscale as per architectural constraints
    const screenshotGray = await screenshotMat.cvtColorAsync(cv.COLOR_BGR2GRAY);
    const templateGray = await templateMat.cvtColorAsync(cv.COLOR_BGR2GRAY);

    // 4. Feature matching (using matchTemplate for simplicity, ORB/SIFT requires more complex keypoint matching
    // but matchTemplate with TM_CCOEFF_NORMED is standard for this kind of UI element finding)
    const matched = await screenshotGray.matchTemplateAsync(templateGray, cv.TM_CCOEFF_NORMED);
    
    // 5. Find min/max values
    const minMax = await matched.minMaxLocAsync();

    if (minMax.maxVal >= confidenceThreshold) {
      // Return the center of the matched region
      return {
        x: minMax.maxLoc.x + (templateMat.cols / 2),
        y: minMax.maxLoc.y + (templateMat.rows / 2)
      };
    }

    return null;
  } catch (err) {
    console.error('Vision matching error:', err);
    return null;
  }
}
