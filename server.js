const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const START_PORT = Number(process.env.PORT || 5173);
const MAX_PORT = Number(process.env.MAX_PORT || 5199);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image";
const GEMINI_API_VERSION = process.env.GEMINI_API_VERSION || "v1beta";
const USE_RESPONSE_FORMAT = process.env.GEMINI_USE_RESPONSE_FORMAT === "1";
const ROOT = __dirname;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const targetSpecs = {
  wide: {
    name: "16:9 horizontal cover",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    composition:
      "a purpose-made wide story cover with the title near the top center, generous sky behind the title, and the main characters and props arranged across the middle and lower area",
  },
  bannerLarge: {
    name: "large platform banner",
    width: 1332,
    height: 404,
    ratio: "1332:404, about 3.30:1",
    composition:
      "an ultra-wide banner with a readable title in the central safe area and the complete main characters and important props distributed around the center without crowding the top or bottom edges",
  },
  bannerMedium: {
    name: "medium platform banner",
    width: 814,
    height: 262,
    ratio: "814:262, about 3.11:1",
    composition:
      "a moderately wide banner with a slightly tighter composition than the large banner, keeping the title large and legible and keeping the same main characters and props visible",
  },
  bannerSmall: {
    name: "small platform banner",
    width: 560,
    height: 207,
    ratio: "560:207, about 2.71:1",
    composition:
      "a compact wide banner with the clearest possible title and a simplified but faithful arrangement of the same characters and key props",
  },
  background: {
    name: "clean story background plate",
    width: 1920,
    height: 1080,
    ratio: "16:9",
    composition:
      "a clean 16:9 background-only illustration matching the uploaded scene's camera angle, environment, lighting, color palette, and visual style",
  },
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let didReject = false;
    request.on("data", (chunk) => {
      if (didReject) return;
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) {
        didReject = true;
        const error = new Error("The request image is too large. Please use an image file under 25MB.");
        error.statusCode = 413;
        reject(error);
        request.resume();
      }
    });
    request.on("end", () => {
      if (!didReject) resolve(body);
    });
    request.on("error", reject);
  });
}

function cleanBase64(dataUrlOrBase64) {
  return String(dataUrlOrBase64 || "").replace(/^data:[^;]+;base64,/, "");
}

function imagePrompt({ jobType, storyId }) {
  const spec = targetSpecs[jobType] || targetSpecs.wide;
  const id = storyId?.trim() || "the story id";

  if (jobType === "background") {
    return [
      "Use the uploaded story scene image as the visual reference.",
      `Story ID for filename only: ${id}. Do not render this Story ID anywhere in the image.`,
      `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
      `Target aspect ratio: ${spec.ratio}.`,
      spec.composition,
      "Remove all characters, people, animals, mascots, body parts, faces, and character-held foreground props.",
      "Reconstruct and repaint the background areas that were hidden behind the removed characters so the scene looks complete and naturally illustrated.",
      "Preserve the same setting, architecture, plants, furniture, ground, sky, atmosphere, lighting direction, lens perspective, and illustration style from the reference.",
      "Do not stretch, squeeze, warp, crop, zoom, pad, letterbox, pillarbox, blur-extend, or place the original image inside a new canvas.",
      "Do not add any title, text, captions, logos, labels, watermarks, UI, or new characters.",
      "The final image must look like an original clean background plate for animation or storybook production.",
    ].join("\n");
  }

  const sharedRules = [
    "Use the uploaded 3:4 portrait book cover as the visual reference.",
    `Story ID for filename only: ${id}. Do not render this Story ID anywhere in the image.`,
    "The original cover already contains the story title. Recreate the exact visible title text from the reference cover, in the same title style, without changing the wording.",
    "ABSOLUTELY FORBIDDEN: do not stretch, squeeze, warp, resize, crop, zoom, pad, letterbox, pillarbox, blur-extend, background-fill, or place the original cover inside a wider canvas.",
    "ABSOLUTELY FORBIDDEN: do not make a ratio-converted version of the uploaded cover or any previous generated image.",
    "You must create a fully regenerated illustration composed natively for the requested target canvas.",
    "Preserve the exact story identity: same main characters, same character count, same species, same costumes, same important props, same environment, same visual style, same color palette, and same mood.",
    "You may adjust character placement, spacing, and scale to fit the target banner, but do not replace, redesign, omit, or add important characters or props.",
    "Extend and repaint the scene naturally with newly generated scenery so it looks originally illustrated for this target size.",
    "Keep faces, heads, hands, limbs, animals, and important props complete and away from the crop edges.",
    "No extra logos, labels, watermarks, captions, subtitles, UI, or decorative text.",
    "Leave a safe margin around all title letters so no word touches the top, bottom, left, or right edge.",
  ];

  if (jobType !== "wide") {
    return [
      ...sharedRules,
      `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
      `Target aspect ratio: ${spec.ratio}.`,
      spec.composition,
      "This is a separate native regeneration for this exact banner size, not a crop or resize from another banner.",
      "Use the available vertical space carefully: title must remain readable, and characters must not be squeezed or cut off.",
      "Prefer a clean readable title area over decorative clutter.",
    ].join("\n");
  }

  return [
    ...sharedRules,
    `Create a new ${spec.name} composed specifically for ${spec.width}x${spec.height}px.`,
    `Target aspect ratio: ${spec.ratio}.`,
    spec.composition,
  ].join("\n");
}

function generationConfig(jobType) {
  const spec = targetSpecs[jobType] || targetSpecs.wide;
  return {
    responseFormat: {
      image: {
        aspectRatio: spec.ratio.split(",")[0],
        imageSize: "2K",
      },
    },
  };
}

function buildGeminiPayload(payload, includeImageConfig) {
  const requestPayload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: imagePrompt(payload) },
          {
            inline_data: {
              mime_type: payload.mimeType,
              data: cleanBase64(payload.imageData),
            },
          },
        ],
      },
    ],
  };

  if (includeImageConfig && USE_RESPONSE_FORMAT) {
    requestPayload.generationConfig = generationConfig(payload.jobType);
  }

  return requestPayload;
}

async function postGemini(requestPayload, apiKey) {
  const apiResponse = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestPayload),
  });

  const text = await apiResponse.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!apiResponse.ok) {
    const message = data?.error?.message || `Gemini API error: ${apiResponse.status}`;
    const error = new Error(message);
    error.status = apiResponse.status;
    throw error;
  }

  return data;
}

function isUnsupportedGenerationConfig(error) {
  return /responseFormat|generation_config|generationConfig|Cannot find field|Unknown name/i.test(
    error?.message || "",
  );
}

async function callGemini(payload) {
  const apiKey = payload.apiKey || GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is required.");
  }

  let data;
  let fallbackNote = "";

  try {
    data = await postGemini(buildGeminiPayload(payload, true), apiKey);
  } catch (error) {
    if (!isUnsupportedGenerationConfig(error)) {
      throw error;
    }

    fallbackNote =
      "Gemini rejected responseFormat, so the request was retried without generationConfig. The app will crop the returned image to the requested size.";
    data = await postGemini(buildGeminiPayload(payload, false), apiKey);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData || part.inline_data);
  const textPart = parts.find((part) => part.text);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;

  if (!inlineData?.data) {
    throw new Error(textPart?.text || "Gemini returned no image. Try again with a slightly different prompt.");
  }

  return {
    mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
    data: inlineData.data,
    note: [fallbackNote, textPart?.text].filter(Boolean).join("\n"),
  };
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/generate") {
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body);
      if (!payload.imageData || !payload.mimeType || !payload.jobType) {
        sendJson(response, 400, { error: "imageData, mimeType, and jobType are required." });
        return;
      }
      const result = await callGemini(payload);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      console.error(`[api/generate] ${statusCode}: ${error.message || "Image generation failed."}`);
      sendJson(response, statusCode, { error: error.message || "Image generation failed." });
    }
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

function openBrowser(url) {
  if (process.env.OPEN_BROWSER !== "1") return;

  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  childProcess.exec(command, () => {});
}

function startServer(port) {
  const onError = (error) => {
    server.off("listening", onListening);
    if (error.code === "EADDRINUSE" && port < MAX_PORT) {
      console.log(`Port ${port} is already in use. Trying ${port + 1}...`);
      startServer(port + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  };

  const onListening = () => {
    server.off("error", onError);
    const actualPort = server.address().port;
    const url = `http://localhost:${actualPort}`;
    console.log(`Story Cover Studio: ${url}`);
    console.log(`Gemini model: ${GEMINI_MODEL} (${GEMINI_API_VERSION})`);
    if (!GEMINI_API_KEY) {
      console.log("Enter your Gemini API key in the app screen before generating images.");
    }
    openBrowser(url);
  };

  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port);
}

startServer(START_PORT);
