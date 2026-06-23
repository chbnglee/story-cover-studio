const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_VERSION = "v1beta";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent`;

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

function buildGeminiPayload(payload) {
  return {
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
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestPost({ request }) {
  try {
    const payload = await request.json();
    if (!payload.imageData || !payload.mimeType || !payload.jobType) {
      return json({ error: "imageData, mimeType, and jobType are required." }, 400);
    }

    if (!payload.apiKey) {
      return json({ error: "API Key is required." }, 400);
    }

    const apiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": payload.apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(payload)),
    });

    const text = await apiResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!apiResponse.ok) {
      return json({ error: data?.error?.message || `Gemini API error: ${apiResponse.status}` }, apiResponse.status);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData || part.inline_data);
    const textPart = parts.find((part) => part.text);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;

    if (!inlineData?.data) {
      return json({ error: textPart?.text || "Gemini returned no image. Try again with a slightly different prompt." }, 500);
    }

    return json({
      mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
      data: inlineData.data,
      note: textPart?.text || "",
    });
  } catch (error) {
    return json({ error: error.message || "Image generation failed." }, 500);
  }
}
